import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import { advance, change, clone, lowered, records, run, TICKED } from "./board-loop.fixture.ts";

/** The install and the pick; who may start the runner and the clone sit in `board-loop-clone.test.ts`. [n]: `/zombies` ideas. */

afterAll(cleanup);

/** The position of the first logged call that starts with `call`. */
const at = (calls: string, call: string) =>
	calls.split("\n").findIndex((line) => line.startsWith(call));

describe("the install", () => {
	// spec: board-loop/the-install-fails
	test("a failing install refuses, prints its output and starts no session [30]", () => {
		const { dir } = clone();
		const r = run(dir, [], { install: 1 });
		expect(r.code).toBe(1);
		expect(r.text).toContain("the install says this");
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.calls).not.toContain("claude");
		expect(records(r.state).map((x) => x.decision)).toEqual(["refused"]);
	});

	// spec: board-loop/the-pin-moved-on-the-default-branch
	test("the install runs after the fast-forward and before the session [31]", () => {
		const { dir, origin } = clone();
		advance(origin, { "bun.lock": "moved\n" });
		const { calls } = run(dir);
		const order = [
			at(calls, "git merge --ff-only"),
			at(calls, "bun install --frozen-lockfile"),
			at(calls, "claude"),
		];
		expect(order.every((n) => n >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	// spec: board-loop/the-pin-moved-on-the-default-branch
	test("the install runs on a pass whose fast-forward brought nothing [31]", () => {
		const { dir } = clone();
		expect(run(dir).calls).toContain("bun install --frozen-lockfile");
	});
});

describe("the pick", () => {
	/** Whether a stage session started: only its prompt opens with `/goal`. */
	const staged = (calls: string) => calls.includes("claude -p /goal");

	test.each([[["demo"]], [["demo", "other"]], [["../demo"]]])(
		"any argument is refused with the usage, before any command runs [15][16]: %j",
		(args) => {
			const { dir } = clone();
			const r = run(dir, args);
			expect(r.last).toContain("usage: board-loop.ts");
			expect(r.calls).toBe("");
		},
	);

	// spec: board-loop/the-user-dragged-a-card-up
	test.each([
		["alone", "PICK: other"],
		["under lines of prose", "Read the board.\nThe first card is other.\nPICK: other"],
		["ending in a carriage return", "PICK: other\r"],
	])("the pass carries the change the pick names, not the first in the tree's order: %s", (_, pick) => {
		const { dir } = clone({ ...change("demo"), ...change("other") });
		const r = run(dir, [], { pick });
		expect(r.calls).toContain("goal-check.ts apply other 1");
		expect(r.calls).not.toContain("apply demo");
	});

	/** The pick session's prompt, the log up to the stage session. */
	const pickOf = (dir: string) => run(dir).calls.split("\nclaude -p /goal")[0];

	// spec: board-loop/a-picked-card-is-claimed
	test("the pick prompt names the board by its harness.board value and lists the takeable slugs [21], and claims the picked card alone [1]", () => {
		const { dir } = clone({ ...change("demo"), ...change("other"), ...change("spent", undefined, ["demo"]) });
		const pick = pickOf(dir);
		expect(pick).toContain("`Board view` of the Notion board Demo");
		expect(pick).toContain("\nThis session runs unattended.\n");
		expect(pick).toContain("demo, other");
		expect(pick).not.toContain("spent");
		expect(pick).not.toContain("change nothing anywhere");
		expect(pick).toContain("set the `Status` of the card your `PICK:` line names to `applying` when it reads `proposed`");
		expect(pick).toContain("write no other card or property");
		expect(pick).toContain("Write nothing when that line names no change listed above.");
	});

	// spec: board-loop/a-card-already-applying
	test("the pick prompt leaves a card already at applying unwritten [2]", () => {
		const { dir } = clone();
		expect(pickOf(dir)).toContain("Leave a card already at `applying` unwritten.");
	});

	// spec: board-loop/a-picked-card-is-claimed
	test("the pick prompt fetches the card again after the write [3]", () => {
		const { dir } = clone();
		expect(pickOf(dir)).toContain("then fetch that card again");
	});

	test("a takeable change and an answer candidate each appear in their own list of the prompt only [11]", () => {
		const { dir } = clone({ ...change("demo"), ...change("spent", TICKED) });
		const lines = pickOf(dir).split("\n");
		expect(lines.find((line) => line.startsWith("These changes are takeable:"))).toStartWith("These changes are takeable: demo.");
		expect(lines.find((line) => line.startsWith("These changes are answer candidates:"))).toStartWith("These changes are answer candidates: spent.");
	});

	// spec: board-loop/an-answered-card-goes-first board-loop/a-candidate-with-no-answer
	test("the pick prompt reads Assign and the discussion, resolved or not, after the last question [15], puts answered cards first from applied [16] and claims them from applied [17]", () => {
		const { dir } = clone();
		const pick = pickOf(dir);
		for (const part of ["`Assign`", "`notion-get-comments` with `include_resolved: true`", "never a comment on a block","holds a comment opening with `harness-question` and, after the last such comment, one by the user `Assign` names", "A card with no such question is no answer."])
			expect(pick).toContain(part);
		expect(pick).toContain("Take an answered candidate's card first, from `applied` or `applying`, then the `applying` column, then `proposed`");
		expect(pick).toContain("or when it reads `applied` and names an answer candidate");
	});

	// spec: task-board/a-question-the-integration-posted task-board/an-answer-before-the-last-question
	test("the answer follows the last question, whoever posted it, and is read from the page-level discussion alone [41]", () => {
		const { dir } = clone();
		const pick = pickOf(dir);
		expect(pick).toContain("after the last such comment, one by the user `Assign` names that does not open with it. That last question counts whichever account posted it, a Notion integration included.");
		expect(pick).toContain("`notion-get-comments` with `include_resolved: true`");
		expect(pick).toContain("never a comment on a block");
	});

	test("the stage session's prompt is still the launch form's five lines, with no claim [4]", () => {
		const { dir } = clone();
		const { calls } = run(dir);
		const from = calls.indexOf("\nclaude -p /goal ") + 1;
		const stage = calls.slice(from, calls.indexOf(" --permission-mode", from));
		expect(stage.split("\n")).toHaveLength(5);
		expect(stage).not.toContain("applying");
		expect(stage).not.toContain("`Status`");
	});

	// The runner neither reads nor waits on the move: what the session says of it changes nothing.
	test("a pick that says its move failed, above a valid PICK: line, still carries the step [5]", () => {
		const { dir } = clone();
		const r = run(dir, [], { pick: "The Status write was refused.\nPICK: demo" });
		expect(staged(r.calls)).toBe(true);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	// spec: board-loop/a-pick-outside-the-list
	test("PICK: none is idle and starts no stage session [18]", () => {
		const { dir } = clone();
		const r = run(dir, [], { pick: "PICK: none" });
		expect([r.code, r.last]).toEqual([0, "board-loop: idle — the pick session found no takeable card on the board"]);
		expect(staged(r.calls)).toBe(false);
		expect(records(r.state).map((x) => x.decision)).toEqual(["idle"]);
	});

	// spec: board-loop/a-pick-outside-the-list
	test.each([
		["a change neither takeable nor a candidate [19][22]", { ...change("demo"), ...change("spent", undefined, ["demo"]) }, "PICK: spent", "spent: after: demo is still open"],
		["a change with no directory [19]", change("demo"), "PICK: ghost", "ghost: no change of that name is takeable"],
		["nothing at all [20]", change("demo"), "", "not one exact PICK: line"],
		["no PICK: line [20]", change("demo"), "demo, I think", "not one exact PICK: line"],
		["two PICK: lines [20]", change("demo"), "PICK: demo\nPICK: demo", "not one exact PICK: line"],
		["a PICK: line with more on it [20]", change("demo"), "PICK: demo, then other", "not one exact PICK: line"],
	])("a pick naming %s is refused and starts nothing", (_, tree, pick, why) => {
		const { dir } = clone(tree);
		const r = run(dir, [], { pick });
		expect(r.code).toBe(1);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain(why);
		// What the session said is shown to the user above the line.
		expect(r.text).toContain(pick);
		expect(staged(r.calls)).toBe(false);
		expect(records(r.state).map((x) => x.decision)).toEqual(["refused"]);
	});

	test("a child the pick session leaves running does not stall the pass", () => {
		const { dir } = clone();
		const started = Date.now();
		const r = run(dir, [], { pickChild: true });
		expect(Date.now() - started).toBeLessThan(20_000);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	test("a pick session still running at the limit gives timeout and starts no stage", () => {
		const { dir } = clone();
		const r = run(dir, [], { pickSleep: 30 }, { entry: lowered(1000) });
		expect(r.last).toStartWith("board-loop: timeout — the pick session");
		expect(staged(r.calls)).toBe(false);
	});

	// spec: board-loop/no-board-named
	test("no harness.board refuses, naming the key, and launches no session [7]", () => {
		const { dir } = clone({ ...change("demo"), "package.json": "{}\n" });
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain("harness.board");
		expect(r.calls).not.toContain("claude");
		expect(records(r.state).map((x) => x.decision)).toEqual(["refused"]);
	});
});
