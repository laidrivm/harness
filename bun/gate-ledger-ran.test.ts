import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import { passed, ran, RUNNER_STEPS } from "./gate-ledger.ts";
import { run, runRecord, stateWith, tasks, TWO } from "./goal-check.fixture.ts";

/**
 * `ran()` asked about one gate's step: a skill call never stands in for the
 * pre-PR runner's record, nor a runner record or a refusal for a skill call,
 * nor one skill's call for another's. Bracketed numbers are the
 * proposal-stage `/zombies` ideas.
 */

afterAll(cleanup);

const C = "c".repeat(40);
const TOP = "/repo";
const line = (gate: string, rule: string | undefined, decision: string) =>
	JSON.stringify({ gate, decision, rule, project: TOP, commit: C });
const skill = (rule: string) => line("skill", rule, "called");
const runner = (rule: string | undefined, decision = "pass") => line("pre-pr", rule, decision);

describe("a reader counts a record only for its own gate and step", () => {
	// spec: gate-ledger/a-skill-record-at-the-tip
	test("a skill record is no runner record, with or without a rule asked [25]", () => {
		const ledger = [skill("zombies"), skill("diff-budget")].join("\n");
		expect([ran(C, TOP, undefined, ledger), ran(C, TOP, "pass", ledger, "diff-budget")]).toEqual([false, false]);
	});

	// spec: gate-ledger/a-diff-budget-record-among-skill-records
	test("a passing record of every runner step is found among skill records [27]", () => {
		const ledger = [skill("zombies"), ...RUNNER_STEPS.map((rule) => runner(rule)), skill("triage")].join("\n");
		expect(passed(C, TOP, ledger)).toBe(true);
		// A skill call named after a step does not stand in for that step's runner record.
		const short = [skill("zombies"), runner("diff-budget"), skill("project-checks")].join("\n");
		expect(passed(C, TOP, short)).toBe(false);
	});

	// spec: gate-ledger/another-skill-s-record
	test("a triage call is no zombies call [28a]", () => {
		const ledger = skill("triage");
		expect([ran(C, TOP, undefined, ledger, "zombies", "skill"), ran(C, TOP, undefined, ledger, "triage", "skill")]).toEqual([false, true]);
	});

	// spec: gate-ledger/a-refusal-at-the-commit
	test.each(["finish", "command-guard"])("a %s block is neither a skill call nor a runner record [28]", (gate) => {
		const ledger = [line(gate, "zombies", "block"), line(gate, "diff-budget", "block")].join("\n");
		expect([
			ran(C, TOP, undefined, ledger, "zombies", "skill"),
			ran(C, TOP, undefined, ledger),
			ran(C, TOP, undefined, ledger, "diff-budget"),
		]).toEqual([false, false, false]);
	});

	test("a runner record is no skill call", () => {
		expect(ran(C, TOP, undefined, runner("diff-budget"), "diff-budget", "skill")).toBe(false);
	});

	test("with no decision asked, a failing runner record of the step is found [29]", () => {
		expect(ran(C, TOP, undefined, runner("diff-budget", "fail"), "diff-budget")).toBe(true);
	});

	test("a runner record with no rule is no diff-budget record [31]", () => {
		expect(ran(C, TOP, "pass", runner(undefined), "diff-budget")).toBe(false);
	});
});

describe("passed(): a pass of every runner step for the commit here", () => {
	const other = (key: string, value: string) =>
		JSON.stringify({ gate: "pre-pr", decision: "pass", rule: "diff-budget", project: TOP, commit: C, [key]: value });
	const both = RUNNER_STEPS.map((rule) => runner(rule)).join("\n");

	test("a pass of each step is a passing run", () => {
		expect(passed(C, TOP, both)).toBe(true);
	});

	// spec: pre-pr-runner/another-step-s-record
	test.each(RUNNER_STEPS)("%s's pass alone is none", (rule) => {
		expect(passed(C, TOP, runner(rule))).toBe(false);
	});

	test.each(RUNNER_STEPS)("a fail of %s beside the other's pass is none", (rule) => {
		const ledger = RUNNER_STEPS.map((r) => runner(r, r === rule ? "fail" : "pass")).join("\n");
		expect(passed(C, TOP, ledger)).toBe(false);
	});

	test("an earlier pass at the commit still counts after a later fail of that step (design.md D2)", () => {
		expect(passed(C, TOP, [both, runner("project-checks", "fail")].join("\n"))).toBe(true);
	});

	test("another commit's or another project's passes are none", () => {
		const elsewhere = RUNNER_STEPS.flatMap((rule) => [
			other("commit", "d".repeat(40)).replace("diff-budget", rule),
			other("project", "/other").replace("diff-budget", rule),
		]).join("\n");
		expect(passed(C, TOP, elsewhere)).toBe(false);
	});

	test("an undefined top is none", () => {
		expect(passed(C, undefined, both)).toBe(false);
	});
});

// spec: gate-ledger/a-skill-record-at-the-tip
test("the goal check is open on a zombies call at HEAD with no runner record [26]", () => {
	const dir = tasks(TWO);
	const call = { ...runRecord(dir)[0], gate: "skill", decision: "called", rule: "zombies" };
	const r = run(dir, ["apply", "demo", "2"], { state: stateWith(call) });
	expect([r.code, r.last]).toEqual([1, expect.stringContaining("no passing pre-PR run record for")]);
});
