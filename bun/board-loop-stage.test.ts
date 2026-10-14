import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
		const r = run(dir, [], { verdict: OPEN });
		expect(r.code).toBe(1);
		expect(r.last).toStartWith("board-loop: open — apply demo step 1");
		expect(r.last).toContain("no open pull request for feat/demo");
	});

	// The run blocks bun's own timer, so the case names a limit of its own.
	test("a session that ignores SIGTERM at the limit is killed outright", () => {
		const { dir } = clone();
		const started = Date.now();
		const r = run(dir, [], { sleep: 60, stubborn: true }, { entry: lowered(1000) });
		expect(Date.now() - started).toBeLessThan(30_000);
		expect(r.last).toStartWith("board-loop: timeout — apply demo step 1");
	}, 40_000);

	test("a child the session started is ended with it at the limit, before the pass returns", async () => {
		const { dir } = clone();
		const marker = join(emptyDir("board-loop-orphan-"), "late");
		const started = Date.now();
		const r = run(dir, [], { sleep: 60, orphan: marker }, { entry: lowered(1000) });
		expect(r.last).toStartWith("board-loop: timeout — apply demo step 1");
		// Past the 8 s after the stage's start at which the child, had it outlived the pass, would write.
		await Bun.sleep(Math.max(0, 12_000 - (Date.now() - started)));
		expect(existsSync(marker)).toBe(false);
	}, 40_000);

	test("Ctrl-C ends the session and every child it started, not the runner alone", async () => {
		const { dir } = clone();
		const marker = join(emptyDir("board-loop-orphan-"), "late");
		const started = Date.now();
		const r = run(dir, [], { sleep: 30, orphan: marker, interrupt: true });
		expect(r.code).toBe(130);
		await Bun.sleep(Math.max(0, 12_000 - (Date.now() - started)));
		expect(existsSync(marker)).toBe(false);
	}, 40_000);

	test.each([
		["the working tree's check reads met", false],
		["the session rewrites the pinned check to read met", true],
	])("the verdict is the pin as installed before any session: %s", (_, tamper) => {
		const { dir } = clone({ ...change("demo"), "bun/goal-check.ts": "goal met: apply demo step 1 at abc1234\n" });
		const r = run(dir, [], { verdict: OPEN, tamper });
		// A copy of the pin, outside the clone.
		const verdict = r.calls.split("\n").find((line) => line.endsWith("goal-check.ts apply demo 1")) ?? "";
		expect(verdict).toStartWith("bun /");
		expect(verdict).not.toContain(realpathSync(dir));
		expect(r.last).toStartWith("board-loop: open — apply demo step 1");
		expect(r.last).toContain("no open pull request for feat/demo");
	});

	test("an install that leaves no pinned check refuses before any session", () => {
		const { dir } = clone();
		const r = run(dir, [], { pinned: false });
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain("run bun install");
		expect(r.calls).not.toContain("claude");
	});

	// spec: board-loop/the-step-met-its-goal
	test("a session exiting non-zero still takes the check's verdict [27]", () => {
		const { dir } = clone();
		const r = run(dir, [], { claudeCode: 3 });
		expect([r.code, r.last]).toEqual([0, "board-loop: met — apply demo step 1"]);
	});

	// spec: board-loop/the-session-runs-past-the-limit
	test("a session still running at the limit is ended and gives timeout [26]", () => {
		const { dir } = clone();
		const started = Date.now();
		const r = run(dir, [], { sleep: 30 }, { entry: lowered(1000) });
		expect(Date.now() - started).toBeLessThan(20_000);
		expect(r.code).toBe(1);
		expect(r.last).toStartWith("board-loop: timeout — apply demo step 1");
		expect(records(r.state).map((x) => x.decision)).toEqual(["timeout"]);
	});
});

describe("the session", () => {
	// spec: board-loop/permissions-are-never-bypassed
	test("both sessions run headless in auto mode with no prompts and no bypass [23]", () => {
		const { dir } = clone();
		const { calls } = run(dir);
		// Each prompt spans lines: the pick runs up to the stage, the stage up to the check.
		const [pick, stage] = [
			calls.slice(calls.indexOf("\nclaude ") + 1, calls.indexOf("\nclaude -p /goal ")),
			calls.slice(calls.indexOf("\nclaude -p /goal ") + 1, calls.indexOf("\nbun /")),
		];
		expect(pick).toStartWith("claude -p ");
		expect(pick).not.toContain("/goal");
		expect(stage).toStartWith("claude -p /goal ");
		for (const call of [pick, stage]) {
			expect(call).toContain("--permission-mode auto --permission-prompts none");
			expect(call).not.toContain("bypassPermissions");
			expect(call).not.toContain("dangerously-skip-permissions");
		}
	});

	// spec: stage-goal/an-apply-step-launched-headless
	test("the prompt is the launch form: unattended, the apply goal, the slug and the step [24]", () => {
		const { dir } = clone();
		const { calls } = run(dir);
		expect(calls).toContain(
			"/goal Carry step 1 of the OpenSpec change demo: /opsx:apply demo for its group 1,",
		);
		expect(calls).toContain("\nThis session runs unattended.\n");
		expect(calls).toContain("`bun node_modules/harness/bun/goal-check.ts apply demo 1`, run after the last push");
	});
});

describe("one record and one line per pass", () => {
	// spec: board-loop/every-pass-leaves-a-record
	test("an unwritable state directory changes neither the line nor the exit [28]", () => {
		const { dir } = clone();
		const state = join(emptyDir("board-loop-file-"), "not-a-directory");
		writeFileSync(state, "");
		const r = run(dir, [], {}, { state });
		expect([r.code, r.last]).toEqual([0, "board-loop: met — apply demo step 1"]);
	});

	test("a record names the clone and no commit", () => {
		const { dir } = clone();
		const [loop] = records(run(dir).state);
		expect([loop.project, "commit" in loop]).toEqual([realpathSync(dir), false]);
	});

	const gone = (origin: string) => rmSync(origin, { recursive: true });
	test.each([
		["a fetch that fails", [], gone, {}, "git fetch failed"],
		["a tree board-state rejects", ["ghost"], () => {}, {}, "does not derive a board state"],
		["no claude on PATH", [], () => {}, { claudeCode: null }, "claude could not be started"],
	] as const)("%s refuses the pass", (_, after, arrange, stubs, reason) => {
		const { dir, origin } = clone(change("demo", undefined, [...after]));
		arrange(origin);
		const r = run(dir, [], stubs);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain(reason);
	});

	// spec: board-loop/every-pass-leaves-a-record
	test.each([
		["refused", { install: 1 }, change("demo")],
		["idle", {}, change("demo", TICKED)],
		["met", {}, change("demo")],
	] as const)("a %s pass leaves exactly one loop record [29]", (decision, stubs, tree) => {
		const { dir } = clone(tree);
		const r = run(dir, [], stubs);
		expect(records(r.state).map((x) => x.decision)).toEqual([decision]);
	});
});
