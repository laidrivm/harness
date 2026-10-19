/**
 * The flake watch's boundaries: what counts as the same tree between a failing
 * run and a passing one, and what output counts as a test run at all. What it
 * names and records is `flake-watch.test.ts`'s.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./command-guard.fixture.ts";
import {
	cleanup,
	failed,
	failing,
	hint,
	PASSING,
	passed,
	play,
	repo,
} from "./flake-watch.fixture.ts";

afterAll(cleanup);

const write = (dir: string, path: string, text: string) => () =>
	writeFileSync(join(dir, path), text);

describe("the same tree", () => {
	// spec: flaky-tests/an-edit-between-the-two-runs
	test.each([
		["a tracked file edited [12]", [], "a.txt"],
		["an untracked file created [13]", [], "new.test.ts"],
		["an untracked file's content changed [14]", ["new.test.ts"], "new.test.ts"],
	])("%s between the runs gives no hint", (_, first, edited) => {
		const dir = repo();
		const before = first.map((path) => write(dir, path, "one\n"));
		const steps = [...before, failed(dir), write(dir, edited, "two\n"), passed(dir)];
		expect(play(steps)).toBe("");
	});

	test("an ignored file changed between the runs still gives the hint [15]", () => {
		const dir = repo();
		const steps = [failed(dir), write(dir, "db.log", "x\n"), passed(dir)];
		expect(hint(play(steps))).toContain("grp > flips");
	});

	// spec: flaky-tests/a-commit-between-the-two-runs
	test("a commit between the runs gives no hint [16]", () => {
		const dir = repo();
		const commit = () => git(dir, "commit", "-q", "--allow-empty", "-m", "x");
		expect(play([failed(dir), commit, passed(dir)])).toBe("");
	});

	test("staging a tracked edit between the runs still gives the hint", () => {
		const dir = repo();
		const steps = [
			write(dir, "a.txt", "two\n"),
			failed(dir),
			() => git(dir, "add", "a.txt"),
			passed(dir),
		];
		expect(hint(play(steps))).toContain("grp > flips");
	});

	// spec: flaky-tests/the-same-command-from-another-directory
	test("the same command from another directory of the tree gives no hint [17]", () => {
		const dir = repo();
		mkdirSync(join(dir, "sub"));
		expect(play([failed(dir), passed(join(dir, "sub"))])).toBe("");
	});

	test("fail on tree T, pass on U, then pass on T gives no hint [23]", () => {
		const dir = repo();
		const steps = [
			failed(dir),
			write(dir, "a.txt", "two\n"),
			passed(dir),
			write(dir, "a.txt", "one\n"),
			passed(dir),
		];
		expect(play(steps)).toBe("");
	});

	test("a fail on T, an edit, then a fail and a pass on the new tree name the new fail only", () => {
		const dir = repo();
		const steps = [
			failed(dir, failing("a")),
			write(dir, "a.txt", "two\n"),
			failed(dir, failing("b")),
			passed(dir),
		];
		expect(hint(play(steps))).toContain(": b.");
	});

	// spec: flaky-tests/the-pass-after-a-hint
	test("a third, passing run after the hint gives no second hint [21]", () => {
		const dir = repo();
		expect(play([failed(dir), passed(dir), passed(dir)])).toBe("");
	});
});

describe("what output is a test run", () => {
	// spec: flaky-tests/a-run-whose-names-were-cut-off
	test("a `2 fail` summary with no `(fail)` line names the run, saying the names were not in the output [18]", () => {
		const dir = repo();
		const error = "Exit code 1\n 0 pass\n 2 fail\nRan 2 tests across 1 file.";
		expect(hint(play([failed(dir, error), passed(dir)]))).toContain(
			"(the failing names were not in the output)",
		);
	});

	test.each([
		["a ` 10 fail` summary [19]", "Exit code 1\n 3 pass\n 10 fail"],
		["a `(fail)` line beside ` 0 fail` [20]", `${failing("grp > flips")}\n 0 fail`],
	])("%s is failing", (_, error) => {
		const dir = repo();
		expect(hint(play([failed(dir, error), passed(dir)]))).toContain("flake-watch:");
	});

	// spec: flaky-tests/a-run-whose-every-test-was-skipped
	test("a failing run followed by an all-skipped one names no flaky test [87]", () => {
		const dir = repo();
		const skipped = PASSING.replace(" 1 pass", " 0 pass");
		expect(play([failed(dir), passed(dir, skipped)])).toBe("");
	});

	test("a test name containing ` [` loses only its trailing duration [22]", () => {
		const dir = repo();
		const error = failing("grp > reads [a] list");
		expect(hint(play([failed(dir, error), passed(dir)]))).toContain(
			": grp > reads [a] list.",
		);
	});
});
