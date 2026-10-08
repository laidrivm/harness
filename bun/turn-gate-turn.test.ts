import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	cleanup,
	commit,
	DONE,
	end,
	git,
	OPEN,
	prompt,
	repo,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";
import { decide, mark } from "./turn-gate.ts";

/**
 * What `turn-gate.ts` makes of what a turn did to the branch: whether it
 * committed, against which mark, and how often it may refuse. Which task
 * groups count and which messages report is `turn-gate.test.ts`'s.
 * Bracketed numbers are the proposal-stage `/zombies` ideas.
 */

afterAll(cleanup);

/** A repository whose one group is still open, marked as a turn starts. */
function started(session = "s1") {
	const dir = repo({ [TASKS]: OPEN });
	const marks = store();
	mark(prompt(dir, session), marks);
	return { dir, marks };
}

describe("a turn that committed", () => {
	// spec: commit-gates/a-task-group-is-completed-and-the-turn-ends-silently
	test("completing a group and ending silently is refused", () => {
		const { dir, marks } = started();
		commit(dir, { [TASKS]: DONE });
		expect(decide(end(dir, SILENT), marks)).toContain("1. Group");
	});

	test("`HEAD` moved by an amend is a turn that committed [13]", () => {
		const { dir, marks } = started();
		writeFileSync(join(dir, TASKS), DONE);
		git(dir, "commit", "-a", "--amend", "--no-edit");
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});

	test("four commits read the same as one [7]", () => {
		const { dir, marks } = started();
		commit(dir, { "a.txt": "1" });
		commit(dir, { "a.txt": "2" });
		commit(dir, { [TASKS]: DONE });
		commit(dir, { "a.txt": "3" });
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});

	// spec: commit-gates/the-turn-commits-and-pushes-before-ending
	test("pushing before the turn ends does not discharge it", () => {
		// The condition this replaces — fire only while commits are unpushed —
		// would let exactly this turn through.
		const { dir, marks } = started();
		commit(dir, { [TASKS]: DONE });
		git(dir, "push");
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});
});

describe("a turn that left nothing committed", () => {
	// spec: commit-gates/a-turn-that-commits-nothing
	test("`HEAD` equal to the mark ends the turn, whatever the message [12]", () => {
		const dir = repo({ [TASKS]: DONE });
		const marks = store();
		mark(prompt(dir), marks);
		expect(decide(end(dir, ""), marks)).toBeUndefined();
	});

	// spec: commit-gates/a-turn-whose-commits-are-withdrawn-before-it-ends
	test("commits withdrawn back to the mark end the turn", () => {
		const { dir, marks } = started();
		const at = git(dir, "rev-parse", "HEAD");
		commit(dir, { [TASKS]: DONE });
		git(dir, "reset", "--hard", at);
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	// spec: commit-gates/a-turn-that-pushes-then-resets-to-the-mark
	test("commits pushed, then reset locally, are still refused", () => {
		const { dir, marks } = started();
		const at = git(dir, "rev-parse", "HEAD");
		commit(dir, { [TASKS]: DONE });
		git(dir, "push");
		git(dir, "reset", "--hard", at);
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});
});

describe("the mark", () => {
	// spec: commit-gates/a-refusal-is-not-repeated
	test("a second refusal with the same mark does not happen", () => {
		const { dir, marks } = started();
		commit(dir, { [TASKS]: DONE });
		decide(end(dir, SILENT), marks);
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	test("a new mark can be refused again", () => {
		const { dir, marks } = started();
		commit(dir, { [TASKS]: DONE.replace("[x] 1.2", "[ ] 1.2") });
		decide(end(dir, SILENT), marks);
		mark(prompt(dir), marks);
		commit(dir, { [TASKS]: DONE });
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});

	// spec: commit-gates/two-sessions-in-one-repository
	test("a second session is decided against its own mark", () => {
		const { dir, marks } = started("s2");
		commit(dir, { [TASKS]: DONE });
		mark(prompt(dir, "s1"), marks);
		expect(decide(end(dir, SILENT, "s2"), marks)).toBeDefined();
	});

	// spec: commit-gates/the-mark-was-never-written
	test("an absent mark ends the turn [21]", () => {
		const dir = repo({ [TASKS]: OPEN });
		commit(dir, { [TASKS]: DONE });
		expect(decide(end(dir, SILENT), store())).toBeUndefined();
	});

	test("an unreadable mark ends the turn [18]", () => {
		const { dir, marks } = started();
		for (const file of readdirSync(marks))
			writeFileSync(join(marks, file), "not a commit");
		commit(dir, { [TASKS]: DONE });
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	test("a session id that is not a plain name writes and reads no mark", () => {
		// A mark written through the id would land outside the store, where a
		// listing of the store cannot see it; the decision can.
		const { dir, marks } = started("../escape");
		commit(dir, { [TASKS]: DONE });
		expect(decide(end(dir, SILENT, "../escape"), marks)).toBeUndefined();
	});
});
