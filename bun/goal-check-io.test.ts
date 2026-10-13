import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git, repo } from "./diff-budget.fixture.ts";
import {
	CHANGE,
	head,
	ledger,
	out,
	proposal,
	records,
	run,
	runRecord,
	stateWith,
	TWO,
	tasks,
} from "./goal-check.fixture.ts";
import { reported } from "./turn-gate.ts";

/**
 * The goal check's pull request and tree conditions, the line it prints, its
 * exits, and the record it writes. The stages and the run record it reads are
 * in `goal-check.test.ts`. Bracketed numbers are the proposal-stage `/zombies`
 * ideas.
 */

afterAll(cleanup);

describe("the pull request and the tree", () => {
	// spec: stage-goal/the-pull-request-cannot-be-read
	test.each([
		["absent [25]", null],
		["failing [26]", { answer: "", code: 1 }],
	])("gh %s is open, naming the unreadable state", (_, gh) => {
		const r = run(proposal(), ["propose", "demo"], { gh });
		expect(r.last).toContain("pull request's state could not be read");
	});

	// spec: stage-goal/the-pull-request-is-behind
	test("a pull request behind HEAD is open [27]", () => {
		const dir = proposal();
		const answer = JSON.stringify([{ headRefOid: out(dir, "rev-parse", "main") }]);
		const r = run(dir, ["propose", "demo"], { gh: { answer, code: 0 } });
		expect(r.last).toContain(`not ${head(dir).slice(0, 7)}`);
	});

	// spec: stage-goal/the-pull-request-is-behind
	test("no open pull request, a closed or merged one at HEAD, is open [28]", () => {
		const gh = { answer: "[]", code: 0 };
		const r = run(proposal(), ["propose", "demo"], { gh });
		expect(r.last).toContain("no open pull request for feature");
	});

	// spec: stage-goal/uncommitted-work
	test.each([
		["unstaged [29]", false],
		["staged [30]", true],
	])("an %s edit to a tracked file is open", (_, stage) => {
		const dir = proposal();
		writeFileSync(join(dir, CHANGE, "proposal.md"), "# edited\n");
		if (stage) git(dir, "add", "-A");
		expect(run(dir, ["propose", "demo"]).last).toContain("differ from HEAD");
	});

	// spec: stage-goal/a-proposal-ready-for-review
	test("an untracked file alone does not block met [31]", () => {
		const dir = proposal();
		writeFileSync(join(dir, "scratch.txt"), "x\n");
		expect(run(dir, ["propose", "demo"]).code).toBe(0);
	});
});

describe("the line, the exits and the record", () => {
	// spec: stage-goal/the-line-the-turn-gate-reads
	test.each([
		["met", "2"],
		["open", "1"],
	])("the turn gate reads the %s line as no report [21]", (verdict, step) => {
		const r = run(tasks(TWO), ["apply", "demo", step]);
		expect([r.last.startsWith(`goal ${verdict}`), reported(r.last)]).toEqual([
			true,
			false,
		]);
	});

	// spec: stage-goal/a-proposal-ready-for-review
	test("an open line names every missing condition [22]", () => {
		const r = run(repo({}, {}), ["propose", "demo"], {
			gh: { answer: "[]", code: 0 },
			state: stateWith(),
		});
		expect(r.last.split("; ")).toHaveLength(3);
	});

	// spec: stage-goal/a-malformed-call
	test.each([
		["an unknown stage [32]", ["ship", "demo"]],
		["no change [33]", ["propose"]],
		["apply with no step", ["apply", "demo"]],
		["a step of 0 [16]", ["apply", "demo", "0"]],
		["a non-numeric step [16]", ["apply", "demo", "two"]],
		["a change that is a path", ["propose", "../demo"]],
		["a step on another stage", ["propose", "demo", "1"]],
	])("%s exits 2 and records nothing", (_, args) => {
		const r = run(tasks(TWO), args);
		expect([r.code, records(r.state)]).toEqual([2, []]);
	});

	// spec: stage-goal/a-malformed-call
	test("a run outside a repository exits 2 and records nothing [34]", () => {
		const state = stateWith();
		const r = run(emptyDir("goal-check-bare-"), ["propose", "demo"], {
			gh: null,
			state,
		});
		expect([r.code, records(state)]).toEqual([2, []]);
	});

	// spec: stage-goal/a-met-stage
	test("a met stage records gate, stage, decision and commit [24]", () => {
		const dir = tasks(TWO);
		const r = run(dir, ["apply", "demo", "2"]);
		expect(records(r.state)).toEqual([
			{
				at: expect.any(String),
				gate: "goal",
				decision: "met",
				rule: "apply",
				project: out(dir, "rev-parse", "--show-toplevel"),
				session: "s-1",
				commit: head(dir),
			},
		]);
	});

	// spec: stage-goal/two-runs
	test("an open run, then a met one, records open then met [13]", () => {
		const dir = proposal();
		const state = stateWith();
		run(dir, ["propose", "demo"], { state });
		ledger(state, runRecord(dir));
		run(dir, ["propose", "demo"], { state });
		expect(records(state).map((r) => r.decision)).toEqual(["open", "met"]);
	});

	// spec: stage-goal/an-unwritable-ledger
	test("an unwritable state directory changes neither line nor exit [35]", () => {
		const dir = tasks(TWO);
		const file = join(emptyDir("goal-check-state-"), "not-a-dir");
		writeFileSync(file, "");
		const before = run(dir, ["apply", "demo", "1"], { state: stateWith() });
		const after = run(dir, ["apply", "demo", "1"], { state: file });
		expect([after.code, after.last]).toEqual([1, before.last]);
		expect(before.last).toStartWith("goal open:");
	});
});
