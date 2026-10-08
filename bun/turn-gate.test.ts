import { afterAll, describe, expect, test } from "bun:test";
import {
	cleanup,
	commit,
	DONE,
	end,
	OPEN,
	prompt,
	repo,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";
import { complete, decide, mark, reported } from "./turn-gate.ts";

/**
 * What `turn-gate.ts` reads: which task groups a task list completes, and
 * whether a final message reports. What a turn did to the branch is
 * `turn-gate-turn.test.ts`'s. Bracketed numbers are the proposal-stage
 * `/zombies` ideas, as `tasks.md` numbers them.
 */

afterAll(cleanup);

/** Commits `after` over `before` under one mark, and decides a silent turn. */
function silentTurn(
	before: Record<string, string>,
	after: Record<string, string>,
) {
	const dir = repo(before);
	const marks = store();
	mark(prompt(dir), marks);
	commit(dir, after);
	return decide(end(dir, SILENT), marks);
}

describe("which groups a task list completes", () => {
	// spec: commit-gates/a-task-group-is-completed-and-the-turn-ends-silently
	test("a group whose last box is ticked is complete [4]", () => {
		expect(complete(DONE)).toEqual(["1. Group"]);
	});

	// spec: commit-gates/every-group-still-has-work-in-it
	test("a group with an unticked box is not [6, 22]", () => {
		expect(complete(OPEN)).toEqual([]);
	});

	// spec: commit-gates/a-group-that-carries-no-boxes
	test("a group with no boxes at all is not [8]", () => {
		expect(complete("## 1. Group\n\nProse, and no boxes.\n")).toEqual([]);
	});

	test("`- [X]` counts as ticked [10]", () => {
		expect(complete("## 1. Group\n\n- [X] 1.1 a\n")).toEqual([
			"1. Group",
		]);
	});

	test("a checkbox inside a fenced code block does not count [11]", () => {
		const text = "## 1. Group\n\n- [x] 1.1 a\n\n```md\n- [ ] not a task\n```\n";
		expect(complete(text)).toEqual(["1. Group"]);
	});

	test("a file with no group headings completes nothing [9]", () => {
		expect(complete("# c\n\n- [x] 1.1 a\n")).toEqual([]);
	});

	test("each group is decided on its own boxes", () => {
		expect(complete(`${DONE}\n## 2. Next\n\n- [ ] 2.1 c\n`)).toEqual([
			"1. Group",
		]);
	});
});

describe("which task lists a turn is decided on", () => {
	// spec: commit-gates/the-completed-group-belongs-to-an-archived-change
	test("a change under `archive/` is not read [2]", () => {
		const path = "openspec/changes/archive/2026-01-01-c/tasks.md";
		expect(silentTurn({ [path]: OPEN }, { [path]: DONE })).toBeUndefined();
	});

	test("a repository with no `openspec/changes/` completes nothing [1]", () => {
		expect(silentTurn({ "a.txt": "a" }, { "a.txt": "b" })).toBeUndefined();
	});

	test.each([
		"a",
		"b",
	])("of two active changes, completing one in %s triggers [5]", (which) => {
		const path = (name: string) => `openspec/changes/${name}/tasks.md`;
		const reason = silentTurn(
			{ [path("a")]: OPEN, [path("b")]: OPEN },
			{ [path(which)]: DONE },
		);
		expect(reason).toContain(`openspec/changes/${which}/`);
	});

	// spec: commit-gates/a-group-completed-in-an-earlier-turn
	test("a group already complete at the mark does not qualify the turn", () => {
		const before = `${DONE}\n## 2. Next\n\n- [ ] 2.1 c\n- [ ] 2.2 d\n`;
		const after = `${DONE}\n## 2. Next\n\n- [x] 2.1 c\n- [ ] 2.2 d\n`;
		expect(silentTurn({ [TASKS]: before }, { [TASKS]: after })).toBeUndefined();
	});

	test("a group that did not exist at the mark does not qualify the turn", () => {
		expect(silentTurn({ "a.txt": "a" }, { [TASKS]: DONE })).toBeUndefined();
	});
});

describe("whether the final message reports", () => {
	// spec: commit-gates/the-turn-reports-its-gates
	test("a gate line reports [16]", () => {
		expect(reported("Done.\n\nTRIAGE gate: PASS — 1 groups.")).toBe(true);
	});

	test("the words “gate line” in prose do not [16]", () => {
		expect(reported("I will write the gate line next time.")).toBe(false);
	});

	// spec: commit-gates/the-turn-names-what-only-the-user-can-settle
	test("`BLOCKED` with what the user must settle reports", () => {
		expect(reported("BLOCKED — pick a name for the flag.")).toBe(true);
	});

	// spec: commit-gates/a-bare-marker-with-nothing-after-it
	test.each([
		"BLOCKED",
		"Stopping here.\nBLOCKED —",
	])("a bare `BLOCKED` does not: %p", (message) => {
		expect(reported(message)).toBe(false);
	});

	test("an empty message does not [3]", () => {
		expect(reported("")).toBe(false);
	});

	// spec: commit-gates/the-final-message-cannot-be-read
	test("a payload with no final assistant message ends the turn [21]", () => {
		const dir = repo({ [TASKS]: OPEN });
		const marks = store();
		mark(prompt(dir), marks);
		commit(dir, { [TASKS]: DONE });
		expect(decide(end(dir, undefined), marks)).toBeUndefined();
	});
});
