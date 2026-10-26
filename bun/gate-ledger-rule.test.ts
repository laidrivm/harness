import { afterAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { ran, ranUnder, RUNNER_STEPS } from "./gate-ledger.ts";
import { run, runRecord, stateWith, tasks, TWO } from "./goal-check.fixture.ts";

/**
 * `ran()` asked about one runner step: only that step's record answers it, so
 * a passing diff budget never stands in for project checks that failed or
 * never ran. Bracketed numbers are the proposal-stage `/zombies` ideas.
 */

afterAll(cleanup);

const C = "c".repeat(40);
const TOP = "/repo";
const line = (rule: string, decision = "pass") =>
	JSON.stringify({ gate: "pre-pr", decision, rule, project: TOP, commit: C });

describe("a rule given to ran()", () => {
	test("finds the step's own record [19]", () => {
		const ledger = [line("diff-budget"), line("project-checks")].join("\n");
		expect(RUNNER_STEPS.map((rule) => ran(C, TOP, "pass", ledger, rule))).toEqual([true, true]);
	});

	// spec: pre-pr-runner/a-record-of-one-step-only
	test("a passing diff-budget record alone does not answer project-checks [20]", () => {
		expect(ran(C, TOP, "pass", line("diff-budget"), "project-checks")).toBe(false);
	});

	test("a pre-pr record under an unknown rule answers neither step [21]", () => {
		const ledger = line("something-else");
		expect(RUNNER_STEPS.map((rule) => ran(C, TOP, "pass", ledger, rule))).toEqual([false, false]);
	});

	test("given no rule, any pre-pr record of the commit still counts", () => {
		expect(ran(C, TOP, undefined, line("project-checks", "fail"))).toBe(true);
	});
});

describe("the goal check asks for every runner step", () => {
	// spec: stage-goal/the-project-checks-failed
	test.each([
		["checks `fail` [22]", (dir: string) => stateWith(runRecord(dir)[0], runRecord(dir, "fail")[1])],
		["no checks record [23]", (dir: string) => stateWith(runRecord(dir)[0])],
	])("budget `pass` with %s is open, naming the missing passing record", (_, state) => {
		const dir = tasks(TWO);
		const r = run(dir, ["apply", "demo", "2"], { state: state(dir) });
		expect([r.code, r.last]).toEqual([1, expect.stringContaining("no passing pre-PR run record for")]);
	});
});

describe("ranUnder() asks for every runner step", () => {
	/** A launcher that enters the clone it is handed, with `state` as its state directory. */
	const launcher = (state: string) => ["sh", "-c", `cd "$0" && export XDG_STATE_HOME='${state}' && exec "$@"`];

	test.each([
		["both passes is found", RUNNER_STEPS, true],
		["the budget's pass alone is not", ["diff-budget"], false],
	])("a session ledger with %s [24]", (_, rules, found) => {
		const clone = realpathSync(emptyDir("gate-ledger-clone-"));
		const lines = rules.map((rule) => ({ gate: "pre-pr", decision: "pass", rule, project: clone, commit: C }));
		expect(ranUnder([...launcher(stateWith(...lines)), clone], C)).toBe(found);
	});
});
