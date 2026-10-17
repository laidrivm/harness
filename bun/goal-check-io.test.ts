import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git, repo } from "./diff-budget.fixture.ts";
import {
	CHANGE,
	head,
	ledger,
	out,
	pr,
	proposal,
	prs,
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
		["answering with no JSON", { answer: "not json", code: 0 }],
	])("gh %s is open, naming the unreadable state", (_, gh) => {
		const r = run(proposal(), ["propose", "demo"], { gh });
		expect(r.last).toContain("pull request's state could not be read");
	});

	// spec: stage-goal/a-read-that-fails-and-then-succeeds
	test.each([
		[1, "[7]"],
		[2, "[8]"],
	])("gh failing %i time(s) %s, then answering, is met", (fails) => {
		const dir = proposal();
		const gh = { ...prs(pr(head(dir), "OPEN")), fails };
		expect(run(dir, ["propose", "demo"], { gh }).code).toBe(0);
	});

	// spec: stage-goal/the-pull-request-cannot-be-read
	test.each([
		// A fourth try would answer, so a fourth would be seen.
		["failing three times [9]", { ...prs(), fails: 3 }],
		["answering {} [14]", { answer: "{}", code: 0 }],
	])("gh %s is open after three tries, not four", (_, gh) => {
		const r = run(proposal(), ["propose", "demo"], { gh });
		expect([r.last, r.calls]).toEqual([
			expect.stringContaining("pull request's state could not be read"),
			3,
		]);
	});

	// spec: stage-goal/a-proposal-ready-for-review
	test("a first try that answers is met after one call [10]", () => {
		const r = run(proposal(), ["propose", "demo"]);
		expect([r.code, r.calls]).toEqual([0, 1]);
	});

	// A limit of 1000, not 500: a stub killed under load before it logs its call is one call short.
	// spec: stage-goal/a-read-that-never-answers
	test.each([
		["hangs [3]", false],
		["hangs ignoring SIGTERM [5]", true],
	])("gh that %s on every try is open after three calls", (_, stubborn) => {
		const dir = proposal();
		const gh = { ...prs(pr(head(dir), "OPEN")), fails: 3, hang: true, stubborn };
		const r = run(dir, ["propose", "demo"], { gh, env: { HARNESS_GH_TIMEOUT_MS: "1000" } });
		expect([r.last, r.calls]).toEqual([expect.stringContaining("state could not be read"), 3]);
	}, 15_000);

	// spec: stage-goal/a-read-that-hangs-and-then-answers
	test.each([
		["a first try that hangs is met after two calls [4]", { fails: 1, hang: true }, "1000", 2],
		["a try answering inside the limit is met after one call [1]", { delay: 0.2 }, "2000", 1],
	])("%s", (_, stub, limit, calls) => {
		const dir = proposal();
		const gh = { ...prs(pr(head(dir), "OPEN")), ...stub };
		const r = run(dir, ["propose", "demo"], { gh, env: { HARNESS_GH_TIMEOUT_MS: limit } });
		expect([r.code, r.calls]).toEqual([0, calls]);
	}, 15_000);

	// spec: stage-goal/the-pull-request-is-behind
	test("a pull request behind HEAD is open [27]", () => {
		const dir = proposal();
		const gh = prs(pr(out(dir, "rev-parse", "main"), "OPEN"));
		const r = run(dir, ["propose", "demo"], { gh });
		expect(r.last).toContain(`not ${head(dir).slice(0, 7)}`);
	});

	// spec: stage-goal/the-pull-request-is-behind
	test("no pull request at all is open [1] [28]", () => {
		const r = run(proposal(), ["propose", "demo"], { gh: prs() });
		expect(r.last).toContain("no open or merged pull request for feature");
	});

	// spec: stage-goal/the-pull-request-has-merged
	test("a merged pull request at HEAD is met [2]", () => {
		const dir = proposal();
		const r = run(dir, ["propose", "demo"], { gh: prs(pr(head(dir), "MERGED")) });
		expect([r.code, r.last]).toEqual([0, `goal met: propose demo at ${head(dir).slice(0, 7)}`]);
	});

	// spec: stage-goal/the-pull-request-has-merged
	test("one commit read open, then merged, is met both times [15]", () => {
		const dir = proposal();
		const state = stateWith(runRecord(dir));
		const codes = ["OPEN", "MERGED"].map(
			(s) => run(dir, ["propose", "demo"], { gh: prs(pr(head(dir), s)), state }).code,
		);
		expect([codes, records(state).map((r) => r.decision)]).toEqual([
			[0, 0],
			["met", "met"],
		]);
	});

	// spec: stage-goal/a-proposal-ready-for-review
	test("a closed pull request at HEAD beside an open one at HEAD is met [4]", () => {
		const dir = proposal();
		const gh = prs(pr(head(dir), "CLOSED"), pr(head(dir), "OPEN"));
		expect(run(dir, ["propose", "demo"], { gh }).code).toBe(0);
	});

	// spec: stage-goal/the-pull-request-is-behind
	test.each([
		["a merged one at an earlier commit, none at HEAD [5]", ["MERGED"]],
		["a closed one at HEAD, an open one earlier [6]", ["CLOSED", "OPEN"]],
	])("%s is open, naming the earlier head", (_, states) => {
		const dir = proposal();
		const main = out(dir, "rev-parse", "main");
		// The closed one, where there is one, sits at HEAD and comes first.
		const gh = prs(...states.map((s) => pr(s === "CLOSED" ? head(dir) : main, s)));
		const r = run(dir, ["propose", "demo"], { gh });
		expect(r.last).toContain(
			`the pull request's head is ${main.slice(0, 7)}, not ${head(dir).slice(0, 7)}`,
		);
	});

	// spec: stage-goal/the-pull-request-was-closed-unmerged
	test.each([
		["closed unmerged [13]", "CLOSED"],
		["with no state [12]", undefined],
	])("the only pull request at HEAD, %s, is open", (_, state) => {
		const dir = proposal();
		const r = run(dir, ["propose", "demo"], { gh: prs(pr(head(dir), state)) });
		expect([r.code, r.last]).toEqual([
			1,
			expect.stringContaining("no open or merged pull request for feature"),
		]);
	});

	// spec: stage-goal/the-pull-request-was-closed-unmerged
	test("a null record is no pull request, and the check still prints its line", () => {
		const r = run(proposal(), ["propose", "demo"], { gh: { answer: "[null]", code: 0 } });
		expect([r.code, r.last]).toEqual([
			1,
			expect.stringContaining("no open or merged pull request for feature"),
		]);
	});

	// spec: stage-goal/the-pull-request-is-behind
	test("a detached HEAD is open and names no branch", () => {
		const dir = proposal();
		git(dir, "checkout", "-q", "--detach");
		expect(run(dir, ["propose", "demo"]).last).toContain("HEAD names no branch");
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

	// spec: stage-goal/a-met-stage
	test("the record names the checkout read, not CLAUDE_PROJECT_DIR", () => {
		const dir = tasks(TWO);
		const env = { CLAUDE_PROJECT_DIR: emptyDir("goal-check-other-") };
		const r = run(dir, ["apply", "demo", "2"], { env });
		const top = out(dir, "rev-parse", "--show-toplevel");
		expect(records(r.state).map((x) => x.project)).toEqual([top]);
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
