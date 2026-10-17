import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { change, clone, commit, lowered, ONE, out, records, run, THREE, TICKED } from "./board-loop.fixture.ts";

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

	test.each([["stage", "orphan"], ["pick", "pickOrphan"]] as const)(
		"a child the %s session left after exiting on its own is ended before the pass returns",
		async (_, key) => {
			const { dir } = clone();
			const marker = join(emptyDir("board-loop-orphan-"), "late");
			const started = Date.now();
			const r = run(dir, [], { [key]: marker });
			expect(r.last).toBe("board-loop: met — apply demo step 1");
			await Bun.sleep(Math.max(0, 12_000 - (Date.now() - started)));
			expect(existsSync(marker)).toBe(false);
		},
		40_000,
	);

	// Signal 0 fails as it does for a member another user owns; real signals still go through.
	const eperm = `(pid, signal) => { if (signal === 0) throw Object.assign(new Error("EPERM"), { code: "EPERM" }); process.kill(pid, signal); }`;

	test("a group the runner cannot signal (EPERM) is not taken as gone: the pass refuses, naming it", () => {
		const { dir } = clone();
		const r = run(dir, [], {}, { entry: lowered(60_000, eperm) });
		expect(r.last).toStartWith("board-loop: refused — process group ");
		expect(r.last).toContain("outlived");
		expect(records(r.state).map((x) => x.decision)).toEqual(["refused"]);
	}, 40_000);

	test("a group left past the limit keeps timeout, naming the group", () => {
		const { dir } = clone();
		const r = run(dir, [], { pickSleep: 30 }, { entry: lowered(1000, eperm) });
		expect(r.last).toStartWith("board-loop: timeout — the pick session ran past");
		expect(r.last).toContain("outlived the pick session");
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

/** These [n] number `pick-claim-answer`'s `/zombies` ideas. */
describe("an answer's step", () => {
	// spec: board-loop/an-answer-s-step
	test("a pick naming an answer candidate is judged by goal-check.ts apply <slug> 2 [9]", () => {
		const { dir } = clone(change("demo", TICKED));
		const r = run(dir);
		expect(r.text).toContain("carrying apply demo step 2 on feat/demo-2");
		expect(r.calls).toContain("goal-check.ts apply demo 2");
		expect(r.last).toBe("board-loop: met — apply demo step 2");
	});

	test("a goal check printing tasks.md has no group 2 gives open [23]", () => {
		const { dir } = clone(change("demo", TICKED));
		const r = run(dir, [], { verdict: "goal open: apply demo step 2 at abc1234 — tasks.md has no group 2" });
		expect(r.code).toBe(1);
		expect(r.last).toBe("board-loop: open — apply demo step 2: goal open: apply demo step 2 at abc1234 — tasks.md has no group 2");
	});

	// spec: board-loop/an-answer-s-step
	test("the answer form's first line writes the answer as group N+1 [13], then the unattended line and the check for apply <slug> N+1 [14]", () => {
		const { dir } = clone(change("demo", TICKED));
		const { calls } = run(dir);
		const from = calls.indexOf("\nclaude -p /goal ") + 1;
		const lines = calls.slice(from, calls.indexOf(" --permission-mode", from)).split("\n");
		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain("write the answer on its card into its tasks.md as group 2, then /opsx:apply demo for that group,");
		// task-board: an answer that asks for a change of its own files a card instead.
		expect(lines[0]).toEndWith(
			"the pull request — or, when the answer asks for a change of its own or its work would not fit one step, file an `idea` card for it, clear the card's `Assign`, add no group and end with `BLOCKED — <that card>`.",
		);
		expect(lines[1]).toBe("This session runs unattended.");
		expect(lines[2]).toContain("`bun node_modules/harness/bun/goal-check.ts apply demo 2`, run after the last push");
	});
});

/** These [n] number `step-branch-retry`'s `/zombies` ideas. */
describe("a step branch a session left", () => {
	const stage = (calls: string) => {
		const from = calls.indexOf("\nclaude -p /goal ") + 1;
		expect(from).toBeGreaterThan(0); // else a "no clause" case passes on the pick's prompt
		return calls.slice(from, calls.indexOf(" --permission-mode", from)).split("\n");
	};
	const clause = (b: string) =>
		` A session left the branch ${b}: switch to it with \`git switch ${b}\` rather than create it, and carry on from what its commits hold.`;
	const local = (...names: string[]) => (dir: string) => names.forEach((name) => git(dir, "branch", name));
	const pushed = (name: string) => (dir: string) => git(dir, "push", "-q", "origin", `main:refs/heads/${name}`);

	// spec: board-loop/no-branch-left board-loop/a-local-branch-a-session-left board-loop/a-branch-pushed-without-a-pull-request board-loop/an-answer-step-s-branch
	test.each([
		["no branch left gives no clause [1]", ONE, () => {}, null],
		["a local feat/demo is named [2]", ONE, local("feat/demo"), "feat/demo"],
		["a feat/demo on origin alone is named [3]", ONE, pushed("feat/demo"), "feat/demo"],
		["at step 2, feat/demo-2 is named and feat/demo-1 beside it is not [4]", THREE, local("feat/demo-1", "feat/demo-2"), "feat/demo-2"],
		["a single group's feat/demo-1 gives no clause [5]", ONE, local("feat/demo-1"), null],
		["at step 2, feat/demo-20 gives no clause [6]", THREE, local("feat/demo-20"), null],
		["a tag named feat/demo gives no clause", ONE, (dir: string) => git(dir, "tag", "feat/demo"), null],
		["an answer candidate's feat/demo-2 is named in the answer form [11]", TICKED, local("feat/demo-2"), "feat/demo-2"],
	] as const)("%s", (_, tasks, arrange, named) => {
		const { dir } = clone(change("demo", tasks));
		arrange(dir);
		const [first] = stage(run(dir).calls);
		expect(first).not.toContain("switch -c");
		if (named === null) expect(first).not.toContain("A session left");
		else expect(first).toEndWith(clause(named));
		if (named === "feat/demo-2") expect(first).not.toContain("feat/demo-1");
	});

	// spec: board-loop/a-local-branch-a-session-left
	test("the clause changes the first line alone [7], is announced before carrying [8], and the tip stays [9]", () => {
		const { dir } = clone();
		git(dir, "switch", "-qc", "feat/demo");
		commit(dir);
		const tip = out(dir, "rev-parse", "HEAD");
		git(dir, "switch", "-q", "main");
		const r = run(dir);
		const lines = stage(r.calls);
		expect(lines).toHaveLength(4);
		expect(lines[0]).toEndWith(`the push and the pull request.${clause("feat/demo")}`);
		expect(lines[1]).toBe("This session runs unattended.");
		expect(lines[2]).toBe(
			"The goal is met when the last line of `bun node_modules/harness/bun/goal-check.ts apply demo 1`, run after the last push, opens with `goal met` — or when the final message opens with `BLOCKED —` and names what only the user can settle.",
		);
		const said = r.text.indexOf("continuing feat/demo, which a session left");
		expect(said).toBeGreaterThan(-1);
		expect(said).toBeLessThan(r.text.indexOf("carrying apply demo step 1"));
		expect(out(dir, "rev-parse", "feat/demo")).toBe(tip);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
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
		["idle", {}, {}],
		["met", {}, change("demo")],
	] as const)("a %s pass leaves exactly one loop record [29]", (decision, stubs, tree) => {
		const { dir } = clone(tree);
		const r = run(dir, [], stubs);
		expect(records(r.state).map((x) => x.decision)).toEqual([decision]);
	});
});
