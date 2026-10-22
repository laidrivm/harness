#!/usr/bin/env bun
/**
 * `PreToolUse` guard for every Bash call, registered in
 * `.claude/settings.json`. It blocks the prohibitions no permission entry can
 * express: a commit while `HEAD` is on `main` or on a branch whose pull request
 * has merged, a force-push wherever the flag sits, the `gh` commands that
 * publish text on the user's behalf, a shell handed a program the line does not
 * spell out, a `bunx` that would install what it runs, and a test run that
 * retries a failing test until it passes.
 *
 * It runs without an `if` field on purpose. A permission pattern — which is
 * what `if` takes — matches the command word literally, so `/usr/bin/git` and
 * `command gh` never reach a hook narrowed that way. Deciding here instead
 * costs one bun start per Bash call, and buys a boundary that a spelling does
 * not walk around. On a call it allows, the guard measured 10.7-11.0 ms per call
 * before the merged-branch check and 11.0-11.1 ms after (50 runs per round,
 * three rounds, 2026-10-13). Only a commit pays for the branch's git reads.
 *
 * Exit 0 allows and exit 2 blocks, with the reason on stderr — those are the
 * only two codes Claude Code reads as a decision. Every other non-zero code is
 * non-blocking, so an event this script cannot decide takes the blocking one
 * as well. An interpreter given program text the guard cannot read is refused
 * too, but only once the whole line is read, so a git block anywhere in it
 * keeps its own id; a prompt would not do, since a local `allow` rule silences
 * a hook's `ask` (measured 2026-10-22). Only an interpreter given a file pays
 * for that check's git reads.
 *
 * Reading the command line is `command-parse.ts`'s, and what one command
 * invokes is `command-words.ts`'s; what this file holds is what the
 * prohibitions themselves are, the reading of a `gh` invocation excepted,
 * which is `command-guard-gh.ts`'s, of a shell's program and a `bunx`'s
 * options, which is `command-guard-exec.ts`'s, and of what an interpreter is
 * refused, which is `command-guard-interpreters.ts`'s.
 */

import { existsSync } from "node:fs";
import { branchState, FETCH_MAX_AGE, headBranch } from "./branch-state.ts";
import {
	bunTestRetry,
	bunxInstall,
	shellWords,
	unreadProgram,
} from "./command-guard-exec.ts";
import { ghApiWrite, ghPublish } from "./command-guard-gh.ts";
import { interpreter, type Refusal } from "./command-guard-interpreters.ts";
import { commands } from "./command-parse.ts";
import { invocations, place, SHELLS } from "./command-words.ts";
import { blocker } from "./gate-ledger.ts";
import { FORCE, pushWords, REF_WIDE, VALUE_OPTIONS } from "./git-options.ts";

/**
 * Blocks a push whose destination cannot be shown to exclude `main`. Two
 * reasons, because a command that names no destination must not be refused
 * with one it never carried.
 */
function blockDestination(destination?: string): never {
	if (destination)
		block(
			"push-to-main",
			`command-guard: this push names \`${destination}\` as a destination. Pushing to main is the user's — ask them to run it.`,
		);
	block(
		"unbounded-push",
		"command-guard: this push names no bounded destination, so it cannot be shown not to reach main. Name the branch you mean.",
	);
}

const payload = await Bun.stdin.json().catch(() => null);
const block: (id: string, reason: string) => never = blocker("command-guard", payload);
const command = payload?.tool_input?.command;
if (typeof command !== "string") {
	block(
		"unreadable-event",
		"command-guard: the hook event carried no readable tool_input.command, so this command could not be checked. Blocked rather than allowed, because an unread command is the case the guard exists for.",
	);
}

/**
 * Every directory the command being checked may run in: the event's `cwd`,
 * since nothing promises the hook starts there, and each place a `cd` or
 * `pushd` before it reaches — `cd ../other && git commit` commits in `other`.
 * All of them rather than the last, because a move inside `( … )` or behind a
 * `false &&` is not taken, and telling those apart means running the shell. A
 * commit or push is refused if any is on main, which costs refusing `cd
 * <feature> && git commit` from a checkout on main; `git -C <feature>` is the
 * spelling that commits there. `null` stands for a move only the shell could
 * resolve, and blocks.
 */
const dirs = new Set<string | null>([
	typeof payload?.cwd === "string" ? payload.cwd : process.cwd(),
]);

/** The interpreters the line would be refused for; decided after the walk, never during it. */
const refusals: Refusal[] = [];

/**
 * The branch `HEAD` points at in `cwd` — the `-C` target when the command
 * names one, since that is the repository the commit would land in — or a
 * block when git cannot say.
 */
const currentBranch = (cwd: string | null) =>
	(cwd === null ? null : headBranch(cwd)) ??
	block(
		"unreadable-branch",
		"command-guard: could not read the current branch — a detached HEAD, no work tree, an unreadable -C target, or a directory change the guard cannot resolve. A commit cannot be checked against main, so it is blocked.",
	);

/**
 * Refuses a commit on `target`'s branch where `branchState` finds its pull
 * request merged, or cannot tell. `onMain` has already read every target and
 * blocked on any it could not, so `target` is a directory here.
 */
function refuseStranded(target: string): void {
	const branch = currentBranch(target);
	const state = branchState(target, branch);
	const where = `command-guard: \`${branch}\``;
	if (state === "merged")
		block(
			"merged-branch",
			`${where} is already merged: origin/main carries a commit of it as an equivalent patch, so anything committed to it now is stranded. Move the work to a new branch cut from origin/main.`,
		);
	if (state === "stale")
		block(
			"stale-fetch",
			`${where} is on the remote, and origin/main was not fetched within ${FETCH_MAX_AGE / 60_000} minutes, so whether its pull request has merged cannot be decided. Run git fetch origin, then commit.`,
		);
	if (state === "unknown")
		block(
			"unreadable-fetch",
			`${where} cannot be checked for a merged pull request: its commits could not be compared with origin/main, or the last fetch's FETCH_HEAD could not be read. Run git fetch origin, then commit.`,
		);
}

function check(command: string): void {
	for (const part of commands(command, block)) {
		// Every candidate, not the first: past a wrapper the parser cannot tell
		// an option's operand from the command it wraps, and a candidate naming
		// nothing this file guards costs a comparison.
		for (const [index, [name, rest]] of invocations(part).entries()) {
			const unread = unreadProgram(part, name, rest, index === 0);
			if (unread) block("unread-program", unread);
			const bunx = bunxInstall(name, rest);
			if (bunx) block("bunx-install", bunx);
			const retry = bunTestRetry(name, rest);
			if (retry) block("bun-test-retry", retry);
			// `bash -c "git push --force"`, `bash -lc …` and `bash -oc pipefail
			// …` too: the program is the first operand after the options and
			// their values, wherever the `c` stood. Every word from there is read
			// as a program on its own, since one that looks like a redirection
			// may be it, and joined to the next it could hide its last command.
			const shell = SHELLS.has(name) ? shellWords(rest) : null;
			if (shell?.command) {
				for (const word of rest.slice(shell.start)) check(word);
				continue;
			}
			if (name === "eval") {
				check(rest.join(" "));
				continue;
			}
			const refused = interpreter(name, rest, dirs, index === 0, check);
			if (refused) refusals.push(refused);
			if (name === "cd" || name === "pushd" || name === "popd") {
				// `popd` returns to a stack this reader does not keep; bare `cd` goes home.
				const operand = rest.find(
					(word) => word === "-" || !word.startsWith("-"),
				);
				for (const from of [...dirs]) {
					const to = name === "popd" ? null : place(from, operand ?? "~");
					// A `cd` into nothing fails and moves nowhere: `&&` stops there,
					// and after `;` the shell stands where this set already has it.
					if (to === null || existsSync(to)) dirs.add(to);
				}
				continue;
			}

			if (name === "gh") {
				const publish = ghPublish(rest);
				if (publish) block("gh-publish", publish);
				const write = ghApiWrite(rest);
				if (write) block("gh-api-write", write);
				continue;
			}

			if (name !== "git") continue;

			let at = 0;
			let targets = [...dirs];
			for (let word = rest[at]; word?.startsWith("-"); word = rest[at]) {
				// Each `-C` resolves from the one before it, as git chains them.
				const path = rest[at + 1] ?? "";
				if (word === "-C") targets = targets.map((from) => place(from, path));
				at += VALUE_OPTIONS.has(word) ? 2 : 1;
			}
			const subcommand = rest[at];
			const args = rest.slice(at + 1);

			if (subcommand === "commit" && onMain(targets)) {
				block(
					"main-commit",
					`command-guard: HEAD is on main and this project never commits there. Branch first, then commit on the branch. ${ELSEWHERE}`,
				);
			}
			if (subcommand === "commit")
				for (const target of targets) refuseStranded(target as string);
			if (subcommand === "push") checkPush(args, targets);
		}
	}
}

const onMain = (targets: (string | null)[]) =>
	targets.some((target) => currentBranch(target) === "main");

/** How to reach another checkout from one on main, which `dirs` refuses by `cd`. */
const ELSEWHERE =
	"Every directory the line may run in is checked, so a cd into another checkout from one on main is refused too; name that checkout with git -C <path> instead.";

function checkPush(args: string[], targets: (string | null)[]): void {
	// Classified as git's parser reads them, so a push option's value — `-o
	// --force` — is neither a switch nor an operand.
	const { switches, operands } = pushWords(args);
	if (switches.some((arg) => FORCE.test(arg))) {
		block(
			"force-push",
			"command-guard: force-pushing is the user's, not the agent's — the boundary is the rewrite, not how carefully it is leased. Ask the user to run it.",
		);
	}

	// Before the branch is read, so `--all` with a detached HEAD blocks on the
	// flag rather than on the unreadable head — the flag decides it either way,
	// and the reason should say which.
	//
	// Prefix, not equality: git resolves any unambiguous abbreviation, so
	// `--mir` and `--pru` reach the option they shorten. A form git would itself
	// reject as ambiguous blocks too; over-refusing a command git does not
	// accept costs nothing. The length guard keeps bare `--`, which ends the
	// options and names nothing, from matching all four.
	if (
		switches.some(
			(arg) => arg.length > 2 && REF_WIDE.some((opt) => opt.startsWith(arg)),
		)
	) {
		blockDestination();
	}

	// Every push from main, whatever it names. Telling a bare `git push` from
	// one carrying a refspec means deciding which operand is the repository, and
	// a value-taking option such as `-o <string>` moves that operand by one
	// word. Refusing the branch outright removes the decision instead of parsing
	// around it, and costs nothing: the agent cannot commit on main, so it has
	// nothing of its own to push from there.
	if (onMain(targets)) {
		block(
			"main-push",
			`command-guard: HEAD is on main and this project never pushes from there. Branch first, then push the branch. ${ELSEWHERE}`,
		);
	}

	for (const arg of operands) {
		// Every operand, the repository among them: one word cannot be told from
		// a refspec without the decision refused above, and a remote called
		// `main` refuses a push that would have been allowed — the safe way to
		// be wrong.
		if (arg.startsWith("+")) {
			block(
				"plus-refspec",
				"command-guard: a leading `+` on a refspec forces the update exactly as --force does. Force-pushing is the user's, not the agent's.",
			);
		}
		const colon = arg.lastIndexOf(":");
		// `[+]<src>:<dst>`, and a refspec without `:<dst>` updates the ref its
		// `<src>` names — so a bare word is its own destination. The split is on
		// the last colon per the spec; no ref name git accepts carries one, so
		// no input tells that apart from a split on the first.
		const destination = colon === -1 ? arg : arg.slice(colon + 1);
		// git matches a `<dst>` outside `refs/` against the remote's refs, so
		// `heads/main` reaches `refs/heads/main` as surely as `main` does.
		if (destination.replace(/^(refs\/)?heads\//, "") === "main") {
			blockDestination(destination);
		}
		// Unbounded rather than aimed at main: the matching `:` form pushes every
		// branch that already exists on the remote, and a wildcard pushes
		// whatever it matches. Neither can be shown to exclude main.
		if (destination === "" || destination.includes("*")) blockDestination();
	}
}

check(command);

// Only once the whole line is read, so a git block anywhere keeps its own id.
const [head] = refusals;
if (head) block(head.id, refusals.map((one) => one.reason).join(" "));
