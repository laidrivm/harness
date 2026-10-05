#!/usr/bin/env bun
/**
 * `PreToolUse` guard for every Bash call, registered in
 * `.claude/settings.json`. It blocks the prohibitions no permission entry can
 * express: a commit while `HEAD` is on `main`, a force-push wherever the flag
 * sits, and the `gh` commands that publish text on the user's behalf.
 *
 * It runs without an `if` field on purpose. A permission pattern — which is
 * what `if` takes — matches the command word literally, so `/usr/bin/git` and
 * `command gh` never reach a hook narrowed that way. Deciding here instead
 * costs one bun start per Bash call, measured at 16-22 ms, and buys a boundary
 * that a spelling does not walk around.
 *
 * Exit 0 allows and exit 2 blocks, with the reason on stderr — those are the
 * only two codes Claude Code reads as a decision. Every other non-zero code is
 * non-blocking, so an event this script cannot decide takes the blocking one
 * as well.
 *
 * Reading the command line is `scripts/command-parse.ts`'s; what this file
 * holds is what the prohibitions themselves are.
 */

import { commands, invocations, SHELLS } from "./command-parse.ts";

function block(reason: string): never {
	process.stderr.write(`${reason}\n`);
	process.exit(2);
}

/**
 * Global options that swallow the token after them, so the subcommand of
 * `git -C some/dir commit` resolves to `commit` and not to the path.
 * `--exec-path` is absent on purpose: bare, it prints the path and runs
 * nothing, so treating the next token as its value would be wrong.
 */
const VALUE_OPTIONS = new Set([
	"-C",
	"-c",
	"--git-dir",
	"--work-tree",
	"--namespace",
	"--config-env",
]);

/**
 * Short flags bundle — git reads `push -uf` as `-u -f` — so the single-dash
 * form matches an `f` anywhere in the group, and `-f` is the only short option
 * of `git push` that carries one. The long form matches by prefix because git
 * accepts any unambiguous abbreviation: `--force-w` and `--force-i` are taken,
 * while `--forc` and `--fo` are rejected as ambiguous, so every spelling git
 * honours begins with `--force`. `--follow-tags` and `--fixup` do not.
 */
const FORCE = /^(-[a-z0-9]*f[a-z0-9]*$|--force)/;

/**
 * Options of `git push` that act on refs the command never names, so no
 * destination check can clear them: the first three push every ref under
 * `refs/heads/` or `refs/`, `main` among them, and `--prune` deletes a remote
 * branch that has no local counterpart — `main` itself in any tree that does
 * not carry it.
 */
const REF_WIDE = ["--all", "--branches", "--mirror", "--prune"];

/**
 * Options whose value is the next word. Matched by their exact spelling, unlike
 * `REF_WIDE`: a prefix here could swallow the word after it and hide an
 * operand, while an abbreviation left unskipped is read as an operand and can
 * only refuse a push. Both lists resolve their uncertainty towards blocking.
 * The `=` forms need no entry — they are one word, and start with `-`.
 */
const PUSH_VALUE_OPTIONS = new Set([
	"-o",
	"--push-option",
	"--receive-pack",
	"--exec",
	"--repo",
]);

/**
 * Blocks a push whose destination cannot be shown to exclude `main`. Two
 * reasons, because a command that names no destination must not be refused
 * with one it never carried.
 */
function blockDestination(destination?: string): never {
	block(
		destination
			? `command-guard: this push names \`${destination}\` as a destination. Pushing to main is the user's — ask them to run it.`
			: "command-guard: this push names no bounded destination, so it cannot be shown not to reach main. Name the branch you mean.",
	);
}

const payload = await Bun.stdin.json().catch(() => null);
const command = payload?.tool_input?.command;
if (typeof command !== "string") {
	block(
		"command-guard: the hook event carried no readable tool_input.command, so this command could not be checked. Blocked rather than allowed, because an unread command is the case the guard exists for.",
	);
}

/**
 * The branch `HEAD` points at in `cwd` — the `-C` target when the command
 * names one, since that is the repository the commit would land in — or a
 * block when git cannot say.
 */
function currentBranch(cwd?: string): string {
	try {
		const head = Bun.spawnSync(
			["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
			{ cwd },
		);
		if (head.exitCode === 0) return head.stdout.toString().trim();
	} catch {
		// An unreadable `-C` target makes spawnSync throw, which would exit
		// non-zero and non-blocking. Fall through to the block instead.
	}
	block(
		"command-guard: could not read the current branch — a detached HEAD, no work tree, or an unreadable -C target. A commit cannot be checked against main, so it is blocked.",
	);
}

/** The `gh` subcommand pairs that publish text on the user's behalf. */
const GH_WRITES = [
	["pr", "comment"],
	["issue", "comment"],
	["pr", "review"],
];

function check(command: string): void {
	for (const part of commands(command)) {
		// Every candidate, not the first: past a wrapper the parser cannot tell
		// an option's operand from the command it wraps, and a candidate naming
		// nothing this file guards costs a comparison.
		for (const [name, rest] of invocations(part)) {
			// `bash -c "git push --force"`, and `bash -lc …` too: short flags
			// bundle, so `-c` neither stands alone nor has to come first.
			const dashC = rest.findIndex((word) => /^-[a-z]*c[a-z]*$/.test(word));
			if (SHELLS.has(name) && dashC >= 0) {
				check(rest.slice(dashC + 1).join(" "));
				continue;
			}

			if (name === "gh") {
				// Adjacent anywhere, not the first two words: a global flag's value
				// sits in front of them in `gh --repo a/b pr comment`.
				const plain = rest.filter((word) => !word.startsWith("-"));
				const write = GH_WRITES.find(([a, b]) =>
					plain.some((word, at) => word === a && plain[at + 1] === b),
				);
				if (write) {
					block(
						`command-guard: \`gh ${write.join(" ")}\` publishes text under the user's name. Report what you would have written and let them send it.`,
					);
				}
				continue;
			}

			if (name !== "git") continue;

			let at = 0;
			let target: string | undefined;
			for (let word = rest[at]; word?.startsWith("-"); word = rest[at]) {
				if (word === "-C") target = rest[at + 1];
				at += VALUE_OPTIONS.has(word) ? 2 : 1;
			}
			const subcommand = rest[at];
			const args = rest.slice(at + 1);

			if (subcommand === "commit" && currentBranch(target) === "main") {
				block(
					"command-guard: HEAD is on main and this project never commits there. Branch first, then commit on the branch.",
				);
			}
			if (subcommand === "push") checkPush(args, target);
		}
	}
}

function checkPush(args: string[], target?: string): void {
	if (args.some((arg) => FORCE.test(arg))) {
		block(
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
		args.some(
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
	if (currentBranch(target) === "main") {
		block(
			"command-guard: HEAD is on main and this project never pushes from there. Branch first, then push the branch.",
		);
	}

	for (let at = 0; at < args.length; at++) {
		const arg = args[at] ?? "";
		if (arg.startsWith("-")) {
			if (PUSH_VALUE_OPTIONS.has(arg)) at++;
			continue;
		}

		// Every operand, the repository among them: one word cannot be told from
		// a refspec without the decision refused above, and a remote called
		// `main` refuses a push that would have been allowed — the safe way to
		// be wrong.
		if (arg.startsWith("+")) {
			block(
				"command-guard: a leading `+` on a refspec forces the update exactly as --force does. Force-pushing is the user's, not the agent's.",
			);
		}
		const colon = arg.lastIndexOf(":");
		// `[+]<src>:<dst>`, and a refspec without `:<dst>` updates the ref its
		// `<src>` names — so a bare word is its own destination. The split is on
		// the last colon per the spec; no ref name git accepts carries one, so
		// no input tells that apart from a split on the first.
		const destination = colon === -1 ? arg : arg.slice(colon + 1);
		if (destination === "main" || destination === "refs/heads/main") {
			blockDestination(destination);
		}
		// Unbounded rather than aimed at main: the matching `:` form pushes every
		// branch that already exists on the remote, and a wildcard pushes
		// whatever it matches. Neither can be shown to exclude main.
		if (destination === "" || destination.includes("*")) blockDestination();
	}
}

check(command);
