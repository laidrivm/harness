import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { advance, change, clone, commit, lowered, out, records, run, TICKED } from "./board-loop.fixture.ts";

/** Who may start the runner, the clone it starts from, the install and the pick. [n]: `/zombies` ideas. */

afterAll(cleanup);

/** The position of the first logged call that starts with `call`. */
const at = (calls: string, call: string) =>
	calls.split("\n").findIndex((line) => line.startsWith(call));

describe("started from a session", () => {
	// spec: board-loop/started-from-an-agent-s-shell
	test.each([
		["set [1]", "1"],
		["empty [2]", ""],
	])("CLAUDECODE %s refuses before any command runs", (_, value) => {
		const { dir } = clone();
		const r = run(dir, [], {}, { env: { CLAUDECODE: value } });
		expect(r.code).toBe(1);
		expect(r.last).toContain("from a terminal of your own");
		expect(r.calls).toBe("");
	});
});

describe("the clone", () => {
	// spec: board-loop/an-edited-tracked-file
	test("a tracked edit refuses [3]", () => {
		const { dir } = clone();
		writeFileSync(join(dir, "package.json"), '{"edited": true}\n');
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.calls).not.toContain("claude");
	});

	// spec: board-loop/an-edited-tracked-file
	test("an untracked file alone does not refuse [3]", () => {
		const { dir } = clone();
		writeFileSync(join(dir, "scratch.txt"), "x\n");
		expect(run(dir).last).toStartWith("board-loop: met");
	});

	// spec: board-loop/unpushed-work
	test("an unpushed tip refuses and leaves the branch checked out [4]", () => {
		const { dir } = clone();
		git(dir, "switch", "-qc", "feat/demo");
		commit(dir);
		const tip = out(dir, "rev-parse", "HEAD");
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain("unpushed");
		const after = [out(dir, "branch", "--show-current"), out(dir, "rev-parse", "HEAD")];
		expect(after).toEqual(["feat/demo", tip]);
	});

	// spec: board-loop/the-previous-pass-s-step-branch
	test("a pushed step branch is switched off to the default branch's tip [5]", () => {
		const { dir, origin } = clone();
		git(dir, "switch", "-qc", "feat/demo");
		commit(dir);
		git(dir, "push", "-q", "origin", "feat/demo");
		advance(origin);
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: met");
		expect(out(dir, "branch", "--show-current")).toBe("main");
		expect(out(dir, "rev-parse", "HEAD")).toBe(out(dir, "rev-parse", "origin/main"));
	});

	// spec: board-loop/the-previous-pass-s-step-branch
	test.each([
		["diverged from", true, "cannot fast-forward"],
		["only ahead of", false, "holds commits origin/main lacks"],
	])("a local main %s origin refuses, merging and resetting nothing [6]", (_, moved, why) => {
		const { dir, origin } = clone();
		commit(dir);
		const local = out(dir, "rev-parse", "main");
		git(dir, "switch", "-qc", "feat/demo", "origin/main");
		git(dir, "push", "-q", "origin", "feat/demo");
		if (moved) advance(origin);
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain(why);
		expect(out(dir, "rev-parse", "main")).toBe(local);
		expect(r.calls).not.toContain("claude");
	});
});

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

	test("the pick prompt names the board by its harness.board value and lists the takeable slugs [21]", () => {
		const { dir } = clone({ ...change("demo"), ...change("other"), ...change("spent", TICKED) });
		const pick = run(dir).calls.split("\nclaude -p /goal")[0];
		expect(pick).toContain("`Board view` of the Notion board Demo");
		expect(pick).toContain("\nThis session runs unattended.\n");
		expect(pick).toContain("demo, other");
		expect(pick).not.toContain("spent");
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
		["a change that is not takeable [19]", { ...change("demo"), ...change("spent", TICKED) }, "PICK: spent", "spent: every group is ticked"],
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
