import { afterAll, describe, expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, gate, lines, repo } from "./diff-budget.fixture.ts";
import { RUNNER_STEPS } from "./gate-ledger.ts";
import { checks, head, records, run } from "./pre-pr.fixture.ts";

/**
 * The runner's second step, the project checks named by `harness.bumpTest`:
 * that it always runs, how its exit sets the runner's and its record's, and
 * the trees a run leaves no record for. Bracketed numbers are the
 * proposal-stage `/zombies` ideas.
 */

afterAll(cleanup);

/** A branch within budget whose manifest names `command` as its checks. */
const within = (command?: string, base: Record<string, string> = {}) =>
	repo({ "package.json": checks(command), ...base }, { "a.ts": lines(3) });
const over = (command: string) =>
	repo({ "package.json": checks(command) }, { "a.ts": lines(800) });
const outcomes = (state: string) => records(state).map((r) => [r.rule, r.decision]);

describe("the project checks", () => {
	// spec: pre-pr-runner/a-passing-run
	test("with nothing past the base, both steps record `pass` [1]", () => {
		const { state } = run(repo({}, {}));
		expect(outcomes(state)).toEqual([["diff-budget", "pass"], ["project-checks", "pass"]]);
	});

	// spec: pre-pr-runner/a-branch-within-budget pre-pr-runner/a-passing-run
	test("within budget and passing, it exits 0 and both records name the full HEAD [3]", () => {
		const dir = within("true");
		const result = run(dir);
		expect(result.code).toBe(0);
		expect(records(result.state).map((r) => [r.rule, r.commit])).toEqual([
			["diff-budget", head(dir)],
			["project-checks", head(dir)],
		]);
	});

	// spec: pre-pr-runner/failing-project-checks
	test("their output passes through unchanged, after the budget's line [4]", () => {
		const dir = within("printf 'checks said %s\\n' hi; printf 'to stderr\\n' >&2; exit 1");
		const result = run(dir);
		expect([result.code, result.out, result.err]).toEqual([1, `${gate(dir).line}\nchecks said hi\n`, "to stderr\n"]);
	});

	// spec: pre-pr-runner/a-failing-run
	test("failing checks within budget record `pass` then `fail`", () => {
		expect(outcomes(run(within("false")).state)).toEqual([["diff-budget", "pass"], ["project-checks", "fail"]]);
	});

	test("run from a subdirectory, they run from the top level [13]", () => {
		const dir = repo({ "package.json": checks("pwd -P") }, { "src/a.ts": lines(3) });
		expect(run(join(dir, "src")).out.split("\n")).toContain(realpathSync(dir));
	});

	// spec: pre-pr-runner/a-branch-over-budget
	test("over budget and failing, it exits 1 with two `fail` records [5]", () => {
		const result = run(over("false"));
		expect([result.code, outcomes(result.state)]).toEqual([1, [["diff-budget", "fail"], ["project-checks", "fail"]]]);
	});

	// spec: pre-pr-runner/a-branch-over-budget
	test("over budget, the checks still run [7]", () => {
		const result = run(over("echo the checks ran"));
		expect([result.code, result.out]).toEqual([1, expect.stringContaining("the checks ran")]);
	});

	// spec: pre-pr-runner/a-base-it-cannot-resolve
	test("an unresolvable base exits 2, the budget `error` and the checks `pass` [6]", () => {
		const result = run(within("true"), {}, ["nope"]);
		expect([result.code, outcomes(result.state)]).toEqual([2, [["diff-budget", "error"], ["project-checks", "pass"]]]);
	});

	// spec: pre-pr-runner/project-checks-that-exit-otherwise pre-pr-runner/an-unmeasured-run
	test("checks that exit 3 make the run exit 2 and record `error` [11]", () => {
		const result = run(within("exit 3"));
		expect([result.code, records(result.state)[1]?.decision]).toEqual([2, "error"]);
	});

	// spec: pre-pr-runner/no-command-named pre-pr-runner/an-unmeasured-run
	test.each([
		["an absent key [2]", checks(), "harness.bumpTest"],
		["an empty key [9]", checks(""), "harness.bumpTest"],
		["a whitespace key [10]", checks("   "), "harness.bumpTest"],
		["a package.json that is not JSON [18]", "{ not json", "package.json is not JSON"],
	])("%s runs no command, names what it read, exits 2, and records `error`", (_, manifest, named) => {
		const result = run(repo({ "package.json": manifest }, { "a.ts": lines(3) }));
		expect([result.code, result.err, records(result.state)[1]?.decision]).toEqual([
			2,
			expect.stringContaining(named),
			"error",
		]);
	});
});

describe("the records of a run", () => {
	test("two runs at one commit leave four records [8]", () => {
		const dir = within("true");
		const { state } = run(dir);
		run(dir, { XDG_STATE_HOME: state });
		expect(records(state)).toHaveLength(4);
	});

	// spec: pre-pr-runner/a-run-stopped-before-its-records
	test("checks that kill the runner leave no record, the budget's included [12]", () => {
		const result = run(within("kill $PPID"));
		expect([result.code, records(result.state)]).toEqual([null, []]);
	});

	// spec: pre-pr-runner/a-record-of-one-step-only
	test("each record holds the six keys and the commit, its rule one of RUNNER_STEPS in order [14]", () => {
		const all = records(run(within("true")).state);
		expect(all.map((r) => r.rule)).toEqual([...RUNNER_STEPS]);
		for (const record of all)
			expect(Object.keys(record).sort()).toEqual(["at", "commit", "decision", "gate", "project", "rule", "session"]);
	});
});

describe("a tree the commit does not hold", () => {
	// spec: pre-pr-runner/an-untracked-scratch-file
	test("an untracked file runs both steps, records nothing, and is named [15]", () => {
		const dir = within("echo the checks ran");
		writeFileSync(join(dir, "scratch.txt"), "notes");
		const result = run(dir);
		expect(records(result.state)).toEqual([]);
		expect(result.out).toContain("DIFF gate:");
		expect(result.out).toContain("the checks ran");
		expect(result.out).toMatch(/no run record[^\n]*\n\?\? scratch\.txt\n/);
	});

	// spec: pre-pr-runner/an-uncommitted-edit
	test("an unstaged edit records nothing and is named [17]", () => {
		const dir = within("true");
		writeFileSync(join(dir, "a.ts"), lines(4));
		const result = run(dir);
		expect([records(result.state), result.out]).toEqual([[], expect.stringContaining(" M a.ts\n")]);
	});

	// spec: pre-pr-runner/an-ignored-file
	test("an ignored file alone still records [16]", () => {
		const dir = within("true", { ".gitignore": "scratch.txt\n" });
		writeFileSync(join(dir, "scratch.txt"), "notes");
		expect(records(run(dir).state)).toHaveLength(2);
	});

	// spec: pre-pr-runner/a-check-that-writes-into-the-tree
	test.each([
		["leaves an untracked file", "echo x > left.txt", "?? left.txt"],
		["edits a tracked file", "echo x >> a.ts", " M a.ts"],
	])("a check that %s leaves no record and names the file", (_, command, named) => {
		const result = run(within(command));
		expect([records(result.state), result.out]).toEqual([[], expect.stringContaining(`${named}\n`)]);
	});

	test("a check that deletes the untracked file found before it still leaves no record, naming the file", () => {
		const dir = within("rm scratch.txt");
		writeFileSync(join(dir, "scratch.txt"), "notes");
		const result = run(dir);
		expect([records(result.state), result.out]).toEqual([[], expect.stringContaining("?? scratch.txt\n")]);
	});

	test("a check that writes only an ignored file records", () => {
		const dir = within("mkdir -p out && echo x > out/x", { ".gitignore": "out/\n" });
		expect(records(run(dir).state)).toHaveLength(2);
	});

	// spec: pre-pr-runner/a-commit-made-during-the-run
	test("a check that commits leaves no record", () => {
		const result = run(within("git -c user.email=t@e -c user.name=T commit -q --allow-empty -m moved"));
		expect([records(result.state), result.out]).toEqual([[], expect.stringContaining("no run record")]);
	});
});
