#!/usr/bin/env bun
/**
 * The pre-PR sequence's turn gate: both ends of one contract, so the mark's
 * format lives in one place.
 *
 * `bun turn-gate.ts mark` is the `UserPromptSubmit` half. It records `HEAD`
 * as control arrives, keyed by session.
 *
 * `bun turn-gate.ts stop` is the `Stop` half. It refuses, by exiting 2 with
 * the reason on stderr, to end a turn that left commits on the branch and
 * completed a task group of an active change — one complete neither at the
 * mark nor on `origin/main` as the turn ends — unless the final message
 * carries `BLOCKED` naming what only the user can settle, or carries a gate
 * line while the gate ledger holds the pre-PR runner's record of the tip in
 * this checkout.
 *
 * It refuses at most once per mark. A refused turn is continued, not
 * restarted, so no new mark is written. That bounds a condition the model
 * cannot satisfy to one turn, and the bound reads no event field.
 *
 * The round ceiling does read one. Before it decides, the `stop` half counts
 * the stops a goal continued (`stop_hook_active` true) since the mark. At the
 * ceiling `goal-rounds.ts` fixes, it ends the session instead, printing
 * `continue: false` and exiting 0, and records `goal`/`rounds`/`ceiling`. A
 * refusal would only hand the goal another round. `commit-gates`' "SHALL NOT
 * depend on a loop-protection field" is about the refusal, so the ceiling may.
 *
 * Whatever it cannot read — no mark, no message, no repository, a detached
 * `HEAD`, an event that is not JSON — ends the turn. This is fail-open on
 * purpose, unlike the command guard. A hook that refuses when its partner did
 * not run turns a partial installation into a session that cannot end a turn.
 * And the escape from a refusal is text in the message, so refusing over an
 * unreadable one leaves nothing to act on. The ledger is the exception: one it
 * cannot read holds no record, and the once-per-mark bound limits that to one
 * refusal.
 *
 * Any of the runner's records proves that it ran the deterministic steps at the
 * tip, and nothing more. The judgement steps are read from the final message alone, so
 * a gate line for one of them, written without running it, still passes.
 *
 * Run as the hook, it records each refusal, pass and release of a turn that
 * completed a group in the gate ledger (`gate-ledger.ts`); `decide` called
 * from a test records nothing.
 */

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { BASE } from "./branch-state.ts";
import { ran, record } from "./gate-ledger.ts";
import { countRound, resetRounds } from "./goal-rounds.ts";

type Event = {
	session_id?: unknown;
	cwd?: unknown;
	last_assistant_message?: unknown;
};

type Boxes = { ticked: number; open: number };

/**
 * Every `## ` group of a task list with its boxes counted. A box inside a
 * fenced code block is an example, not a task. Exported for the goal check,
 * which reads a step's group by its place in this order.
 */
export function groups(text: string): Map<string, Boxes> {
	const found = new Map<string, Boxes>();
	let group: Boxes | undefined;
	let fence: string | undefined;
	for (const line of text.split("\n")) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1][0];
		if (marker && (!fence || marker === fence)) {
			fence = fence ? undefined : marker;
			continue;
		}
		if (fence) continue;
		const heading = /^## (.+?)\s*$/.exec(line);
		if (heading) {
			group = { ticked: 0, open: 0 };
			found.set(heading[1], group);
			continue;
		}
		const box = /^\s*[-*] \[([ xX])\]/.exec(line);
		if (box && group) box[1] === " " ? group.open++ : group.ticked++;
	}
	return found;
}

/**
 * Headings of the groups with at least one box and no unticked one — a group
 * with no boxes at all has no evidence that one was ticked.
 */
export function complete(text: string): string[] {
	return [...groups(text)]
		.filter(([, b]) => b.ticked > 0 && b.open === 0)
		.map(([heading]) => heading);
}

const GATE_LINE = /^\W*[A-Z][A-Z-]* gate: (PASS|OPEN|BLOCKED)\b/m;

/** A line opening with `BLOCKED` and naming something after it. */
const NAMED_BLOCK = /^\W*BLOCKED\b[^\w\n]*\w/m;

/** Whether a final message reports: a gate line, or a `BLOCKED` with content. */
export const reported = (message: string) =>
	GATE_LINE.test(message) || NAMED_BLOCK.test(message);

/** Where a session's mark lives, or nothing for an id unsafe as a file name. */
function markFile(store: string, event: Event): string | undefined {
	const id = event.session_id;
	return typeof id === "string" && /^[\w-]+$/.test(id)
		? join(store, id)
		: undefined;
}

function git(cwd: string, ...args: string[]): string | undefined {
	const run = Bun.spawnSync(["git", ...args], { cwd });
	return run.exitCode === 0 ? run.stdout.toString().trim() : undefined;
}

/** Records `HEAD` for the session; outside a repository, an empty mark. */
export function mark(event: Event, store: string): void {
	const file = markFile(store, event);
	if (!file || typeof event.cwd !== "string") return;
	mkdirSync(store, { recursive: true });
	writeFileSync(file, git(event.cwd, "rev-parse", "-q", "--verify", "HEAD") ?? "");
	resetRounds(file);
}

/**
 * The commit the turn's work is read from, or nothing when it left none.
 * `HEAD` back at the mark still counts as work when the remote-tracking ref
 * holds a commit the mark does not: it reached the remote branch.
 */
function tip(cwd: string, at: string): string | undefined {
	const head = git(cwd, "rev-parse", "HEAD");
	if (head !== at) return head;
	const pushed = git(cwd, "rev-list", "--max-count=1", `${at}..@{upstream}`);
	return pushed ? git(cwd, "rev-parse", "@{upstream}") : undefined;
}

/** Task lists of the active changes at a commit; `archive/` retires a change. */
const ACTIVE = /^openspec\/changes\/(?!archive\/)[^/]+\/tasks\.md$/;

/**
 * Each `<rev>:<path>` as one `git cat-file --batch` answers it, in order; one
 * the revision lacks reads as empty. A launch per file cost 208 ms on a tree
 * of 13 changes, against 14 ms for the batch. Each answer is framed by the
 * byte size in its header, so a file's own text is never read as a header.
 */
function blobs(cwd: string, specs: string[]): string[] {
	const out = Bun.spawnSync(["git", "cat-file", "--batch"], {
		cwd,
		stdin: Buffer.from(specs.map((spec) => `${spec}\n`).join("")),
	}).stdout;
	const texts: string[] = [];
	let at = 0;
	for (const _ of specs) {
		const eol = out.indexOf(10, at);
		const size = /^\S+ blob (\d+)$/.exec(
			eol < 0 ? "" : out.subarray(at, eol).toString(),
		)?.[1];
		at = eol + 1;
		if (size === undefined) {
			texts.push(""); // `missing`, or no answer at all
			continue;
		}
		texts.push(out.subarray(at, at + Number(size)).toString());
		at += Number(size) + 1;
	}
	return texts;
}

/**
 * Groups complete at `tip` that were complete neither at the mark nor on
 * `BASE` as the turn ends, as `<heading> in <change dir>`. Every side is read
 * from git, never from a record beside the mark. A group `BASE` holds complete
 * came in by a pull, a fetch or a merge of `main`, and a missing `BASE` reads
 * as empty, excluding nothing. A group absent at the mark was not complete
 * there, so the turn that wrote and ticked it qualifies.
 */
function completed(cwd: string, at: string, tip: string): string[] {
	const paths = (
		// `--full-tree`: without it a session in a subdirectory lists nothing.
		git(cwd, "ls-tree", "--full-tree", "-r", "--name-only", tip, "--",
			"openspec/changes") ?? ""
	)
		.split("\n")
		.filter((path) => ACTIVE.test(path));
	const sides = [at, BASE, tip];
	const texts = blobs(cwd, paths.flatMap((p) => sides.map((s) => `${s}:${p}`)));
	return paths.flatMap((path, i) => {
		const [atMark, onBase, atTip] = texts.slice(3 * i, 3 * i + 3);
		const before = new Set([...complete(atMark), ...complete(onBase)]);
		return complete(atTip)
			.filter((heading) => !before.has(heading))
			.map((heading) => `"${heading}" in ${path.replace(/tasks\.md$/, "")}`);
	});
}

/** The runner's path as a command run from `cwd` reaches it. */
function runner(cwd: string): string {
	const path = join(import.meta.dir, "pre-pr.ts");
	try {
		// Real paths on both sides: a temp directory reached through a symlink
		// would otherwise climb out to the root and back.
		return relative(realpathSync(cwd), path);
	} catch {
		return path;
	}
}

/**
 * The refusal for this turn, or nothing when it may end. A turn that completed
 * a group is handed to `log` as `passed` when it names a `BLOCKED`, or carries
 * a gate line and the runner's record of the tip; `released` when the
 * once-per-mark bound alone lets it end; or `refused`. The groups are computed
 * before the message is read for that, so a gate line alone is no pass.
 */
export function decide(
	event: Event,
	store: string,
	log: (decision: string) => void = () => {},
): string | undefined {
	const file = markFile(store, event);
	const { cwd, last_assistant_message: message } = event;
	if (!file || typeof cwd !== "string" || typeof message !== "string") return;
	let recorded: string;
	try {
		recorded = readFileSync(file, "utf8");
	} catch {
		return;
	}
	const [at, refused] = recorded.split(" ");
	if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(at)) return;
	if (!git(cwd, "symbolic-ref", "-q", "HEAD")) return;
	const end = tip(cwd, at);
	const done = end ? completed(cwd, at, end) : [];
	if (done.length === 0 || !end) return;
	const gated = GATE_LINE.test(message);
	const top = gated ? git(cwd, "rev-parse", "--show-toplevel") : undefined;
	if (NAMED_BLOCK.test(message) || (gated && ran(end, top))) {
		log("passed");
		return;
	}
	if (refused) {
		log("released");
		return;
	}
	writeFileSync(file, `${at} refused`);
	log("refused");
	if (gated)
		return (
			`This turn committed and completed ${done.join(", ")}, and reports ` +
			`gates, but the gate ledger holds no pre-PR runner record of ${end} ` +
			"in this checkout. Run `bun " +
			runner(cwd) +
			"` with `HEAD` at that commit — it records only the commit it reads " +
			"— and end with its line and the other gate lines, or end with " +
			"`BLOCKED — <what the user must decide>`."
		);
	return (
		`This turn committed and completed ${done.join(", ")}, and its final ` +
		"message reports no gates. Run the pre-PR sequence now " +
		"(core/review-toolkit.md) and end with its gate lines — or, if only " +
		"the user can settle what stops it, end with a line " +
		"`BLOCKED — <what they must decide>`."
	);
}

if (import.meta.main) {
	// ponytail: one mark file per session accumulates in the OS temp dir,
	// which the OS clears; prune here if that ever stops being true.
	const store = join(tmpdir(), "turn-gate");
	let reason: string | undefined;
	try {
		const event = JSON.parse(await Bun.stdin.text());
		const file = markFile(store, event);
		// Before `decide`: a session that is ending gains nothing from a refusal.
		const ceiling =
			process.argv[2] !== "mark" && file ? countRound(event, file) : undefined;
		if (process.argv[2] === "mark") mark(event, store);
		else if (ceiling) {
			record("goal", "ceiling", "rounds", event);
			console.log(JSON.stringify({ continue: false, stopReason: ceiling }));
		} else
			reason = decide(event, store, (decision) =>
				record("turn-gate", decision, "pre-pr-sequence", event),
			);
	} catch {
		// Fail-open, as the header says: an event this script cannot read
		// ends the turn rather than holding it.
	}
	if (reason) {
		process.stderr.write(`${reason}\n`);
		process.exit(2);
	}
}
