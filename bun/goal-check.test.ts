import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git, repo } from "./diff-budget.fixture.ts";
import {
	archived,
	CHANGE,
	head,
	out,
	prs,
	proposal,
	records,
	run,
	runRecord,
	stateWith,
	THREE,
	TWO,
	tasks,
} from "./goal-check.fixture.ts";
import { reported } from "./turn-gate.ts";

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

	// spec: stage-goal/an-archive
	test("an archive of a longer name that starts with this one is no move", () => {
		const dir = repo(
			{ [`${CHANGE}/proposal.md`]: "# demo\n" },
			{
				[`${CHANGE}/proposal.md`]: null,
				"openspec/changes/archive/2026-10-13-demo-two/proposal.md": "# two\n",
			},
		);
		const r = run(dir, ["archive", "demo"]);
		expect(r.last).toContain("no openspec/changes/archive/<date>-demo/");
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
			runRecord(dir).map((r) => ({ ...r, project: "/elsewhere" })),
			runRecord(dir).map((r) => ({ ...r, gate: "turn-gate" })),
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
		const goal = { ...runRecord(dir, "met")[0], gate: "goal", rule: "apply" };
		const state = stateWith(runRecord(dir), goal);
		const r = run(dir, ["apply", "demo", "1"], { state });
		expect(r.last).toMatch(/^goal open: .*1\. First/);
	});
});

/** These [n] number `github-app-identity`'s `/zombies` ideas. */
describe("the before-push form", () => {
	const BEFORE = ["apply", "demo", "2", "--before-push"];

	// spec: stage-goal/ready-with-no-pull-request
	test("a ready step with no pull request and no gh on PATH is met [1]", () => {
		const r = run(tasks(TWO), BEFORE, { gh: null });
		expect([r.code, r.last]).toEqual([0, expect.stringMatching(/^goal met: apply demo step 2 at \w{7}, before the push$/)]);
	});

	// spec: stage-goal/ready-with-no-pull-request
	test("it makes no gh call, whatever gh would answer [2]", () => {
		const r = run(tasks(TWO), BEFORE, { gh: prs() });
		expect([r.code, r.calls]).toEqual([0, 0]);
	});

	// spec: stage-goal/something-else-missing
	test.each([
		["a detached HEAD [3]", (d: string) => git(d, "switch", "-q", "--detach"), "HEAD names no branch"],
		["a missing record [4]", () => {}, "no passing pre-PR run record for"],
		["a tracked edit [5]", (d: string) => writeFileSync(join(d, CHANGE, "tasks.md"), "edited\n"), "tracked files differ from HEAD"],
		["an index git status cannot read", (d: string) => writeFileSync(join(d, ".git", "index"), "x"), "tracked files differ from HEAD"],
	])("%s is open, naming it", (_, arrange, reason) => {
		const dir = tasks(TWO);
		const state = reason.startsWith("no passing") ? stateWith() : stateWith(runRecord(dir));
		arrange(dir);
		const r = run(dir, BEFORE, { gh: null, state });
		expect([r.code, r.last]).toEqual([1, expect.stringMatching(/^goal open: .*, before the push — /)]);
		expect(r.last).toContain(reason);
	});

	// spec: stage-goal/something-else-missing
	test("an incomplete group is still open before the push", () => {
		const r = run(tasks(TWO), ["apply", "demo", "1", "--before-push"], { gh: null });
		expect([r.code, r.last]).toEqual([1, expect.stringContaining('group "1. First" is not complete')]);
	});

	// spec: stage-goal/the-flag-out-of-place
	test.each([
		["misplaced [6]", ["apply", "demo", "--before-push", "2"]],
		["first [6]", ["--before-push", "apply", "demo", "2"]],
		["doubled [7]", [...BEFORE, "--before-push"]],
		["misspelt [8]", ["apply", "demo", "2", "--before-pushed"]],
		["misspelt on propose [8]", ["propose", "demo", "--beforepush"]],
	])("the flag %s prints the usage, exits 2 and records nothing", (_, args) => {
		const r = run(tasks(TWO), args);
		expect([r.code, r.last, records(r.state)]).toEqual([2, expect.stringMatching(/^usage:/), []]);
	});

	// spec: stage-goal/ready-with-no-pull-request
	test.each([
		["propose [9]", proposal, ["propose", "demo", "--before-push"]],
		["archive [9]", () => archived(), ["archive", "demo", "--before-push"]],
	])("it is accepted on %s", (_, make, args) => {
		expect(run(make(), args, { gh: null }).code).toBe(0);
	});

	// spec: stage-goal/ready-with-no-pull-request
	test("its last line names the form, is no gate line, and records as the full check does [9]", () => {
		const r = run(tasks(TWO), BEFORE, { gh: null });
		expect(r.last).toEndWith(", before the push");
		expect(reported(r.last)).toBe(false);
		expect(records(r.state).map(({ decision, rule }) => [decision, rule])).toEqual([["met", "apply"]]);
	});

	// spec: stage-goal/the-full-check-is-unchanged
	test("without the flag, no pull request is still open", () => {
		const r = run(tasks(TWO), ["apply", "demo", "2"], { gh: prs() });
		expect([r.code, r.last]).toEqual([1, expect.stringContaining("no open or merged pull request for feature")]);
		expect(r.last).not.toContain("before the push");
	});
});

/** On the host: the runner's push clone at the tip, the record in the session user's ledger. */
describe("with a launcher", () => {
	/** A launcher that enters the clone it is handed, as `agent` with `agent`'s state directory, and logs each call. */
	function launcher(state: string) {
		const bin = emptyDir("goal-check-launcher-");
		const log = join(bin, "log");
		writeFileSync(
			join(bin, "as-agent"),
			`#!/bin/sh\necho "$*" >> '${log}'\ncd "$1" || exit 1\nshift\nexport XDG_STATE_HOME='${state}' PATH="$PATH:/usr/bin:/bin"\nexec "$@"\n`,
		);
		chmodSync(join(bin, "as-agent"), 0o755);
		return { path: join(bin, "as-agent"), log };
	}

	// spec: orchestrator/a-commit-with-a-passing-pre-pr-record
	test.each([
		["before the push", ["apply", "demo", "2", "--before-push"], null],
		["after it", ["apply", "demo", "2"], undefined],
	])("%s, the session's clone's record of the tip, read through the launcher, is met", (_, args, gh) => {
		const push = tasks(TWO);
		const session = realpathSync(emptyDir("goal-check-session-"));
		const as = launcher(stateWith(runRecord(push).map((r) => ({ ...r, project: session }))));
		const env = { HARNESS_AS_AGENT: as.path, HARNESS_CLONE: session };
		// The runner's own ledger holds the push clone's record, which must not count.
		const r = run(push, args, { gh, env, state: stateWith(runRecord(push)) });
		expect([r.code, r.last]).toEqual([0, expect.stringMatching(/^goal met: /)]);
		expect(readFileSync(as.log, "utf8")).toContain(`${session} `);
	});

	// spec: orchestrator/a-commit-with-no-pre-pr-record
	test("a record of the push clone in the runner's own ledger does not count", () => {
		const push = tasks(TWO);
		const session = realpathSync(emptyDir("goal-check-session-"));
		const as = launcher(stateWith());
		const r = run(push, ["apply", "demo", "2", "--before-push"], {
			gh: null,
			env: { HARNESS_AS_AGENT: as.path, HARNESS_CLONE: session },
			state: stateWith(runRecord(push)),
		});
		expect([r.code, r.last]).toEqual([1, expect.stringContaining("no passing pre-PR run record for")]);
	});
});
