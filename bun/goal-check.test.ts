import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import {
	archived,
	CHANGE,
	head,
	out,
	proposal,
	run,
	runRecord,
	stateWith,
	THREE,
	TWO,
	tasks,
} from "./goal-check.fixture.ts";

/**
 * The goal check's verdict for each stage, and the run record it reads. The
 * line, the exits, the record it writes and the pull request are in
 * `goal-check-io.test.ts`. Bracketed numbers are the proposal-stage `/zombies`
 * ideas.
 */

afterAll(cleanup);

describe("each stage's conditions", () => {
	// spec: stage-goal/a-proposal-ready-for-review
	test("a proposal in HEAD, with its record and pull request, is met [5]", () => {
		const r = run(proposal(), ["propose", "demo"]);
		expect([r.code, r.last]).toEqual([0, expect.stringMatching(/^goal met/)]);
	});

	// spec: stage-goal/an-apply-step
	test("a single-group change with every box ticked is met [6]", () => {
		const dir = tasks("## 1. Only\n\n- [x] 1.1 a\n- [X] 1.2 b\n");
		expect(run(dir, ["apply", "demo", "1"]).code).toBe(0);
	});

	// spec: stage-goal/an-apply-step
	test("step 2 reads the second group in order [12]", () => {
		expect(run(tasks(TWO), ["apply", "demo", "2"]).code).toBe(0);
	});

	// spec: stage-goal/an-apply-step
	test("step 3 of three reads the last group [14]", () => {
		expect(run(tasks(THREE), ["apply", "demo", "3"]).code).toBe(0);
	});

	// spec: stage-goal/an-apply-step
	test("a box inside a fenced block is no task [19]", () => {
		const dir = tasks("## 1. Only\n\n```\n- [ ] example\n```\n- [x] 1.1 a\n");
		expect(run(dir, ["apply", "demo", "1"]).code).toBe(0);
	});

	// spec: stage-goal/an-apply-step
	test("an unticked box leaves the step open, naming its group", () => {
		const r = run(tasks(TWO), ["apply", "demo", "1"]);
		expect([r.code, r.last]).toEqual([1, expect.stringContaining("1. First")]);
	});

	// spec: stage-goal/an-archive
	test("a change moved under archive/ is met [7]", () => {
		expect(run(archived(), ["archive", "demo"]).code).toBe(0);
	});

	// spec: stage-goal/an-archive
	test("an archive checked from a subdirectory is met", () => {
		const below = join(archived(), "openspec");
		expect(run(below, ["archive", "demo"]).code).toBe(0);
	});

	// spec: stage-goal/an-archive
	test("an archive whose change directory is still present is open [20]", () => {
		const r = run(archived(true), ["archive", "demo"]);
		expect(r.last).toContain(`${CHANGE}/ is still in HEAD`);
	});

	// spec: stage-goal/a-step-the-task-list-does-not-have
	test("apply with no tasks.md is open and names it [3]", () => {
		const r = run(proposal(), ["apply", "demo", "1"]);
		expect(r.last).toContain(`no ${CHANGE}/tasks.md in HEAD`);
	});

	// spec: stage-goal/a-step-the-task-list-does-not-have
	test("a group holding no box is open [4]", () => {
		const r = run(tasks("## 1. Empty\n\nprose\n"), ["apply", "demo", "1"]);
		expect(r.last).toContain("1. Empty");
	});

	// spec: stage-goal/a-step-the-task-list-does-not-have
	test("step 4 of three is open and names the missing group [15]", () => {
		const r = run(tasks(THREE), ["apply", "demo", "4"]);
		expect(r.last).toContain("no group 4");
	});
});

describe("the run record", () => {
	// spec: stage-goal/the-run-record-is-for-an-earlier-commit
	test.each([
		["no ledger file [1]", () => emptyDir("goal-check-state-")],
		["an empty ledger [2]", () => stateWith("")],
	])("%s reads as no record", (_, state) => {
		const r = run(proposal(), ["propose", "demo"], { state: state() });
		expect(r.last).toContain("no passing pre-PR run record for");
	});

	// spec: stage-goal/a-proposal-ready-for-review
	test("HEAD's record is found among other projects' and gates' [8]", () => {
		const dir = proposal();
		const state = stateWith(
			{ ...runRecord(dir), project: "/elsewhere" },
			{ ...runRecord(dir), gate: "turn-gate" },
			runRecord(dir),
		);
		expect(run(dir, ["propose", "demo"], { state }).code).toBe(0);
	});

	// spec: stage-goal/the-run-record-is-for-an-earlier-commit
	test.each([
		["an earlier commit [9]", (d: string) => out(d, "rev-parse", "main")],
		["a prefix of HEAD [10]", (d: string) => head(d).slice(0, 7)],
	])("a record for %s does not count", (_, commit) => {
		const dir = proposal();
		const state = stateWith(runRecord(dir, "pass", commit(dir)));
		const r = run(dir, ["propose", "demo"], { state });
		expect(r.last).toContain("no passing pre-PR run record for");
	});

	// spec: stage-goal/a-proposal-ready-for-review
	test("a torn line does not hide the record after it [11]", () => {
		const dir = proposal();
		const state = stateWith('{"gate":"pre-', runRecord(dir));
		expect(run(dir, ["propose", "demo"], { state }).code).toBe(0);
	});

	// spec: stage-goal/the-diff-budget-failed
	test.each([
		["fail [17]", "fail"],
		["error [18]", "error"],
	])("a %s record is no pass", (_, decision) => {
		const dir = proposal();
		const state = stateWith(runRecord(dir, decision));
		const r = run(dir, ["propose", "demo"], { state });
		expect(r.last).toContain("no passing pre-PR run record for");
	});

	// spec: stage-goal/two-targets-at-one-commit
	test("another change's goal record at HEAD leaves the step open", () => {
		const dir = tasks(TWO);
		const goal = { ...runRecord(dir, "met"), gate: "goal", rule: "apply" };
		const state = stateWith(runRecord(dir), goal);
		const r = run(dir, ["apply", "demo", "1"], { state });
		expect(r.last).toMatch(/^goal open: .*1\. First/);
	});
});
