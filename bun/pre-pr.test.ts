import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	cleanup,
	emptyDir,
	gate,
	git,
	lines,
	repo,
} from "./diff-budget.fixture.ts";
import { head, ledger, records, run } from "./pre-pr.fixture.ts";
import { reported } from "./turn-gate.ts";

/**
 * `pre-pr.ts`, spawned as an agent runs it: the diff budget it runs, the
 * records it leaves in the gate ledger, and when it leaves none. The project
 * checks are `true` here, from the fabricated manifest; the cases about them
 * are in `pre-pr-checks.test.ts`. Bracketed numbers are the proposal-stage
 * `/zombies` ideas.
 */

afterAll(cleanup);

describe("the step the runner runs", () => {
	// spec: pre-pr-runner/a-branch-within-budget
	test("within budget, the diff budget's line is printed unchanged [3]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		expect(run(dir).out.trim()).toBe(gate(dir).line);
	});

	// spec: pre-pr-runner/a-branch-within-budget pre-pr-runner/a-branch-over-budget
	// pre-pr-runner/a-base-it-cannot-resolve pre-pr-runner/an-unmeasured-run
	test.each([
		["within budget", lines(3), [], 0, "pass"],
		["in the WARN band [7]", lines(600), [], 0, "pass"],
		["at the failing threshold [8]", lines(800), [], 1, "fail"],
		["against a base that does not resolve [15]", lines(3), ["nope"], 2, "error"],
	])("a branch %s exits with the step's status and records its outcome [14]", (_, text, args, code, decision) => {
		const dir = repo({}, { "a.ts": text });
		const result = run(dir, {}, args as string[]);
		expect([result.code, records(result.state)[0]?.decision]).toEqual([
			code,
			decision,
		]);
	});

	test("an unresolvable base prints the step's ERROR line [15]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		expect(run(dir, {}, ["nope"]).err).toContain("DIFF gate: ERROR");
	});
});

describe("the record of a run", () => {
	// spec: pre-pr-runner/a-passing-run
	test("names the gate, the step, the outcome and the full HEAD [4]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const [record] = records(run(dir).state);
		expect(record).toMatchObject({
			gate: "pre-pr",
			rule: "diff-budget",
			decision: "pass",
			commit: head(dir),
		});
	});

	// spec: gate-ledger/a-gate-that-reads-a-commit
	test("holds the six ledger keys and the commit, and no gate-line text [13]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const { state } = run(dir);
		const [record] = records(state);
		expect(Object.keys(record).sort()).toEqual(
			["at", "commit", "decision", "gate", "project", "rule", "session"],
		);
		expect(readFileSync(ledger(state), "utf8")).not.toContain("DIFF gate");
	});

	test("a branch with nothing past its base records `pass` [1]", () => {
		const dir = repo({}, {});
		expect(records(run(dir).state)[0]?.decision).toBe("pass");
	});

	test("the first run creates the ledger with a line per step [2]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		expect(records(run(dir).state)).toHaveLength(2);
	});

	test("two runs at one commit leave four records [5]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const { state } = run(dir);
		run(dir, { XDG_STATE_HOME: state });
		expect(records(state)).toHaveLength(4);
	});

	test("runs at A, then B, leave records naming each in order [6]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const a = head(dir);
		const { state } = run(dir);
		git(dir, "commit", "-q", "--allow-empty", "-m", "b");
		run(dir, { XDG_STATE_HOME: state });
		const b = head(dir);
		expect(records(state).map((r) => r.commit)).toEqual([a, a, b, b]);
	});

	test("a set CLAUDE_CODE_SESSION_ID is the record's session", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const result = run(dir, { CLAUDE_CODE_SESSION_ID: "abc-123" });
		expect(records(result.state)[0]?.session).toBe("abc-123");
	});

	// spec: commit-gates/a-run-from-a-subdirectory
	test("run from a subdirectory, the project is still the top level", () => {
		const dir = repo({}, { "src/a.ts": lines(3) });
		const { state } = run(join(dir, "src"));
		expect(records(state)[0]?.project).toBe(realpathSync(dir));
	});

	test("the project is the checkout's top level, whatever CLAUDE_PROJECT_DIR names", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const elsewhere = emptyDir("pre-pr-other-");
		const result = run(dir, { CLAUDE_PROJECT_DIR: elsewhere });
		expect(records(result.state)[0]?.project).toBe(realpathSync(dir));
	});

	test("an empty CLAUDE_CODE_SESSION_ID records no session [12]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const result = run(dir, { CLAUDE_CODE_SESSION_ID: "" });
		expect(records(result.state)[0]?.session).toBeNull();
	});

	// spec: pre-pr-runner/an-unwritable-ledger
	test("an unwritable state directory changes neither the line nor the exit [16]", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		const blocker = join(emptyDir("pre-pr-file-"), "state");
		writeFileSync(blocker, "a file where the state directory would be");
		const result = run(dir, { XDG_STATE_HOME: blocker });
		expect([result.code, result.out.trim()]).toEqual([0, gate(dir).line]);
	});
});

describe("when no record is written", () => {
	// spec: pre-pr-runner/an-uncommitted-edit
	test.each([
		["an unstaged edit [9]", false],
		["a staged edit [10]", true],
	])("%s prints the line, records nothing, and says why", (_, stage) => {
		const dir = repo({}, { "a.ts": lines(3) });
		writeFileSync(join(dir, "a.ts"), lines(4));
		if (stage) git(dir, "add", "a.ts");
		const result = run(dir);
		expect([records(result.state).length, result.out]).toEqual([
			0,
			expect.stringContaining("no run record"),
		]);
		expect(result.out).toContain("DIFF gate:");
	});

	test("a repository with no commit records nothing, and says so", () => {
		const dir = emptyDir("pre-pr-bare-");
		git(dir, "init", "-q");
		const result = run(dir);
		expect([records(result.state).length, result.out]).toEqual([
			0,
			expect.stringContaining("no run record"),
		]);
	});

	test("the line saying no record was written is not read as a gate line", () => {
		const dir = repo({}, { "a.ts": lines(3) });
		writeFileSync(join(dir, "a.ts"), lines(4));
		const said = run(dir).out.split("\n").filter((l) => l.includes("no run record"));
		expect([said.length, reported(said.join("\n"))]).toEqual([1, false]);
	});

	// spec: pre-pr-runner/a-push
	test.each([".githooks/pre-push", ".github/workflows/diff-budget.yml"])(
		"%s calls the diff budget, never the runner [18]",
		(path) => {
			const text = readFileSync(join(import.meta.dir, "..", path), "utf8");
			expect([text.includes("diff-budget.sh"), text.includes("pre-pr")]).toEqual([
				true,
				false,
			]);
		},
	);
});
