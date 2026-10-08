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
 * completed a task group of an active change, unless the final message
 * carries a gate line or `BLOCKED` naming what only the user can settle.
 *
 * It refuses at most once per mark. A refused turn is continued, not
 * restarted, so no new mark is written. That bounds a condition the model
 * cannot satisfy to one turn, without reading `stop_hook_active`.
 *
 * Whatever it cannot read — no mark, no message, no repository, a detached
 * `HEAD`, an event that is not JSON — ends the turn. This is fail-open on
 * purpose, unlike the command guard. A hook that refuses when its partner did
 * not run turns a partial installation into a session that cannot end a turn.
 * And the escape from a refusal is text in the message, so refusing over an
 * unreadable one leaves nothing to act on.
 *
 * It reads the final message, not the gates: a gate line written without
 * running the gate passes it.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Event = {
	session_id?: unknown;
	cwd?: unknown;
	last_assistant_message?: unknown;
};

type Boxes = { ticked: number; open: number };

/**
 * Every `## ` group of a task list with its boxes counted. A box inside a
 * fenced code block is an example, not a task.
 */
function groups(text: string): Map<string, Boxes> {
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
 * Groups complete at `tip` that were not complete at the mark, as
 * `<heading> in <change dir>`. Both sides are read from git, never from a
 * record beside the mark. A group absent at the mark was not complete there,
 * so the turn that wrote and ticked it qualifies.
 */
function completed(cwd: string, at: string, tip: string): string[] {
	const paths = (
		git(cwd, "ls-tree", "-r", "--name-only", tip, "--", "openspec/changes") ?? ""
	)
		.split("\n")
		.filter((path) => ACTIVE.test(path));
	const texts = blobs(cwd, paths.flatMap((p) => [`${at}:${p}`, `${tip}:${p}`]));
	return paths.flatMap((path, i) => {
		const before = new Set(complete(texts[2 * i]));
		return complete(texts[2 * i + 1])
			.filter((heading) => !before.has(heading))
			.map((heading) => `"${heading}" in ${path.replace(/tasks\.md$/, "")}`);
	});
}

/** The refusal for this turn, or nothing when it may end. */
export function decide(event: Event, store: string): string | undefined {
	const file = markFile(store, event);
	const { cwd, last_assistant_message: message } = event;
	if (!file || typeof cwd !== "string" || typeof message !== "string") return;
	if (reported(message)) return;
	let recorded: string;
	try {
		recorded = readFileSync(file, "utf8");
	} catch {
		return;
	}
	const [at, refused] = recorded.split(" ");
	if (refused || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(at)) return;
	if (!git(cwd, "symbolic-ref", "-q", "HEAD")) return;
	const end = tip(cwd, at);
	const done = end ? completed(cwd, at, end) : [];
	if (done.length === 0) return;
	writeFileSync(file, `${at} refused`);
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
		if (process.argv[2] === "mark") mark(event, store);
		else reason = decide(event, store);
	} catch {
		// Fail-open, as the header says: an event this script cannot read
		// ends the turn rather than holding it.
	}
	if (reason) {
		process.stderr.write(`${reason}\n`);
		process.exit(2);
	}
}
