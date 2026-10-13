import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { change, clone, lowered, records, run, TICKED } from "./board-loop.fixture.ts";

/** The stage session, its verdict, and each pass's record. [n]: `/zombies` ideas. */

afterAll(cleanup);

const OPEN = "goal open: apply demo step 1 at abc1234 — no open pull request for feat/demo";

describe("the verdict", () => {
	// spec: board-loop/the-step-met-its-goal
	test("goal met is met, exit 0, and one loop/met/apply record [22]", () => {
		const { dir } = clone();
		const r = run(dir);
		expect([r.code, r.last]).toEqual([0, "board-loop: met — apply demo step 1"]);
		expect(records(r.state).map(({ decision, rule }) => [decision, rule])).toEqual([
			["met", "apply"],
		]);
	});

	// spec: board-loop/the-session-claims-success-that-the-check-denies
	test("a session exiting 0 under goal open is open, exit 1, naming what is missing [25]", () => {
		const { dir } = clone();
		const r = run(dir, ["demo"], { verdict: OPEN });
		expect(r.code).toBe(1);
		expect(r.last).toStartWith("board-loop: open — apply demo step 1");
		expect(r.last).toContain("no open pull request for feat/demo");
	});

	// spec: board-loop/the-step-met-its-goal
	test("a session exiting non-zero still takes the check's verdict [27]", () => {
		const { dir } = clone();
		const r = run(dir, ["demo"], { claudeCode: 3 });
		expect([r.code, r.last]).toEqual([0, "board-loop: met — apply demo step 1"]);
	});

	// spec: board-loop/the-session-runs-past-the-limit
	test("a session still running at the limit is ended and gives timeout [26]", () => {
		const { dir } = clone();
		const started = Date.now();
		const r = run(dir, ["demo"], { sleep: 30 }, { entry: lowered(300) });
		expect(Date.now() - started).toBeLessThan(20_000);
		expect(r.code).toBe(1);
		expect(r.last).toStartWith("board-loop: timeout — apply demo step 1");
		expect(records(r.state).map((x) => x.decision)).toEqual(["timeout"]);
	});
});

describe("the session", () => {
	// spec: board-loop/permissions-are-never-bypassed
	test("claude runs headless in auto mode with no prompts and no bypass [23]", () => {
		const { dir } = clone();
		const { calls } = run(dir);
		// The prompt spans lines, and nothing is logged after the session but the check.
		const call = calls.slice(calls.indexOf("\nclaude ") + 1, calls.indexOf("\nbun /"));
		expect(call).toStartWith("claude -p /goal ");
		expect(call).toContain("--permission-mode auto --permission-prompts none");
		expect(call).not.toContain("bypassPermissions");
		expect(call).not.toContain("dangerously-skip-permissions");
	});

	// spec: stage-goal/an-apply-step-launched-headless
	test("the prompt is the launch form: unattended, the apply goal, the slug and the step [24]", () => {
		const { dir } = clone();
		const { calls } = run(dir);
		expect(calls).toContain(
			"/goal Carry step 1 of the OpenSpec change demo: /opsx:apply demo for its group 1,",
		);
		expect(calls).toContain("\nThis session runs unattended.\n");
		expect(calls).toMatch(/`bun \S*goal-check\.ts apply demo 1`, run after the last push/);
	});
});

describe("one record and one line per pass", () => {
	// spec: board-loop/every-pass-leaves-a-record
	test("an unwritable state directory changes neither the line nor the exit [28]", () => {
		const { dir } = clone();
		const state = join(emptyDir("board-loop-file-"), "not-a-directory");
		writeFileSync(state, "");
		const r = run(dir, ["demo"], {}, { state });
		expect([r.code, r.last]).toEqual([0, "board-loop: met — apply demo step 1"]);
	});

	// spec: board-loop/every-pass-leaves-a-record
	test.each([
		["refused", ["demo"], { install: 1 }, change("demo")],
		["idle", ["demo"], {}, change("demo", TICKED)],
		["met", ["demo"], {}, change("demo")],
	] as const)("a %s pass leaves exactly one loop record [29]", (decision, args, stubs, tree) => {
		const { dir } = clone(tree);
		const r = run(dir, [...args], stubs);
		expect(records(r.state).map((x) => x.decision)).toEqual([decision]);
	});
});
