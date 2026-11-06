/** Which modules `bun/mutation-run.ts` runs, and what fails a run first; what it stores is in `mutation-run-stored.test.ts`. */
import { describe, expect, test } from "bun:test";
import type { Tree } from "./mutation-checkout.ts";
import { base, commit, current, versions } from "./mutation-run.fixture.ts";
import { fingerprint, modules, plan } from "./mutation-run.ts";

const runs = (t: Tree) => plan(t).runs;
const named = (t: Tree) => runs(t).map((run) => run.module);

describe("which modules there are", () => {
	test("tests, fixtures and files outside bun/ are not modules", () => {
		expect(modules(["bun/a.ts", "bun/a.test.ts", "bun/a.fixture.ts", "bun/a.sh", "orchestrator/b.ts"])).toEqual([
			"bun/a.ts",
		]);
	});

	// spec: mutation-floor/a-module-the-list-does-not-name
	test("a module the list does not name is named and not run, though a test matches it", () => {
		const { runs, skipped, problems } = plan({ ...base, listed: ["bun/board.ts"] });
		expect(runs).toEqual([{ module: "bun/board.ts", force: false }]);
		expect(skipped).toContain("bun/command-parse.ts");
		expect(problems).toEqual([]);
	});

	// spec: mutation-floor/a-listed-module-no-test-file-matches
	test("a listed module that no test file matches, or that is not tracked, fails naming it", () => {
		expect(plan({ ...base, listed: ["bun/board.ts", "bun/root.ts", "bun/gone.ts"] }).problems).toEqual([
			"stryker.config.json's mutate lists bun/root.ts, which is not a tracked module a test file matches",
			"stryker.config.json's mutate lists bun/gone.ts, which is not a tracked module a test file matches",
		]);
	});

	test("a listed module that no test file matches is not reported as one the list leaves out", () => {
		expect(plan({ ...base, listed: ["bun/root.ts"] }).skipped).not.toContain("bun/root.ts");
	});

	test("a test file the list names is not a module, and fails naming it", () => {
		expect(plan({ ...base, listed: ["bun/board.test.ts"] }).problems).toEqual([
			"stryker.config.json's mutate lists bun/board.test.ts, which is not a tracked module a test file matches",
		]);
	});

	test("an empty list mutates nothing and leaves every module out", () => {
		const { runs, skipped, problems } = plan({ ...base, listed: [] });
		expect([runs, skipped.length, problems]).toEqual([[], 7, []]);
	});
});

describe("what a run mutates", () => {
	test("current stored results, or a change to a script that is not a module, run nothing", () => {
		expect(plan(current())).toEqual({ runs: [], skipped: ["bun/root.ts"], problems: [] });
		expect(runs(commit(current(), "bun/diff-budget.sh", "exit 1\n"))).toEqual([]);
	});

	// spec: mutation-floor/the-module-s-source-changed
	test("a source that differs from its stored copy runs that module incrementally", () => {
		expect(runs(commit(current(), "bun/command-parse.ts", "export const c = 2;\n"))).toEqual([
			{ module: "bun/command-parse.ts", force: false },
		]);
	});

	// spec: mutation-floor/a-test-file-changed
	test("a changed test runs the modules whose filter matches it incrementally, and no other", () => {
		const incremental = [
			{ module: "bun/pre-pr.ts", force: false },
			{ module: "bun/pre-pr-steps.ts", force: false },
		];
		expect(runs(commit(current(), "bun/pre-pr-steps.test.ts", "test('c', () => {});\n"))).toEqual(incremental);
	});

	// spec: mutation-floor/a-test-file-deleted
	test("a test file deleted, added or renamed runs the modules whose filter matches it incrementally", () => {
		const incremental = [
			{ module: "bun/pre-pr.ts", force: false },
			{ module: "bun/pre-pr-steps.ts", force: false },
		];
		expect(runs(commit(current(), "bun/pre-pr-steps.test.ts"))).toEqual(incremental);
		expect(runs(commit(current(), "bun/pre-pr-steps-x.test.ts", "x\n"))).toEqual(incremental);
		const renamed = commit(commit(current(), "bun/pre-pr-steps.test.ts"), "bun/pre-pr-steps-x.test.ts", "x\n");
		expect(runs(renamed)).toEqual(incremental);
	});

	// spec: mutation-floor/a-fixture-another-module-s-tests-import
	test("a changed fixture forces the modules whose tests import it", () => {
		expect(named(commit(current(), "bun/command-guard.fixture.ts", "export const run = 2;\n"))).toEqual([
			"bun/command-parse.ts",
			"bun/command-guard.ts",
		]);
	});

	test("an import a comment names is not one, and a preload given as one string is one", () => {
		const t = commit(base, "bun/board.test.ts", '// import { x } from "./command-guard.fixture.ts";\n');
		expect(Object.keys(fingerprint("bun/board.ts", t))).not.toContain("bun/command-guard.fixture.ts");
		const one = commit(base, "bunfig.toml", '[test]\npreload = "./bun/guard.ts"\n');
		expect(Object.keys(fingerprint("bun/board.ts", one))).toContain("bun/guard.ts");
	});

	test.each(["bunfig.toml", "bun/guard.ts"])("a committed change to %s forces every module", (path) => {
		const all = runs(commit(current(), path, "[test]\n"));
		expect([all.length, all.every((run) => run.force)]).toEqual([6, true]);
	});

	// spec: mutation-floor/stryker-s-options-changed
	test.each([
		["Stryker's shared options", { options: { testRunner: "bun", ignoreStatic: true } }],
		["the runner's version", { versions: { ...versions, "@hughescr/stryker-bun-runner": "1.6.1" } }],
		["Stryker's version", { versions: { ...versions, "@stryker-mutator/core": "10.0.1" } }],
	])("a change to %s forces every module", (_, change) => {
		const all = runs({ ...current(), ...change });
		expect([all.length, all.every((run) => run.force)]).toEqual([6, true]);
	});

	// spec: mutation-floor/a-new-module-has-no-stored-file
	test("a new module runs whole once listed", () => {
		const t = commit(commit(current(), "bun/new.ts", "export const n = 1;\n"), "bun/new.test.ts", "x\n");
		expect(runs(t)).toEqual([]);
		expect(runs({ ...t, listed: [...t.listed, "bun/new.ts"] })).toEqual([{ module: "bun/new.ts", force: false }]);
	});

	// spec: mutation-floor/a-module-with-tests-and-no-stored-file
	test("a module with tests and no stored file runs although nothing under bun/ changed", () => {
		const t = current();
		const { "mutation/board.json": _, ...rest } = t.stored;
		expect(named({ ...t, stored: rest })).toEqual(["bun/board.ts"]);
	});

	// spec: mutation-floor/a-run-asked-for-every-module
	test("--all runs every module with tests, each incrementally", () => {
		const all = (force: boolean) => plan(current(), { all: true, force }).runs.map((run) => run.force);
		expect([all(false), all(true)]).toEqual([Array(6).fill(false), Array(6).fill(true)]);
	});
});

describe("what fails the run before it mutates", () => {
	// spec: mutation-floor/a-listed-module-s-file-left-uncommitted
	test.each(["bun/board.ts", "bun/board.test.ts", "bun/command-guard.fixture.ts", "bunfig.toml"])(
		"a dirty %s",
		(path) => {
			const { problems } = plan({ ...current(), dirty: [path] });
			expect(problems.length).toBeGreaterThan(0);
			expect(problems.every((problem) => problem.includes(path))).toBe(true);
		},
	);

	// spec: mutation-floor/a-stored-file-outliving-its-module
	// spec: mutation-floor/a-stored-file-whose-module-lost-its-last-test
	test.each([
		["bun/board.ts", "bun/board.ts is not tracked"],
		["bun/board.test.ts", "no test file matches bun/board"],
	])("a stored file whose %s is deleted", (path, why) => {
		expect(plan(commit(current(), path)).problems).toEqual([
			"stryker.config.json's mutate lists bun/board.ts, which is not a tracked module a test file matches",
			`mutation/board.json: ${why} — delete the stored file`,
		]);
	});

	// spec: mutation-floor/a-checkout-with-uncommitted-files
	test("an edited or untracked file outside mutation/ fails a run that would mutate, and only one", () => {
		const t = commit(current(), "bun/board.ts", "export const e = 2;\n");
		const stray = "commit or remove notes.ts first — Stryker copies the working tree, not HEAD";
		expect(plan({ ...t, dirty: ["notes.ts", "mutation/board.json"] }).problems).toEqual([stray]);
		expect(plan({ ...current(), dirty: ["notes.ts"] }).problems).toEqual([]);
	});

	// spec: mutation-floor/a-stored-file-whose-module-left-the-list
	test("a stored file whose module left the list", () => {
		const t = current();
		expect(plan({ ...t, listed: t.listed.filter((m) => m !== "bun/board.ts") }).problems).toEqual([
			"mutation/board.json: bun/board.ts is not listed in stryker.config.json's mutate — delete the stored file",
		]);
	});

	// spec: mutation-floor/a-stored-file-holding-results-of-another-module
	test("a stored file without files, or holding a source other than its own module's", () => {
		const t = current();
		const board = t.stored["mutation/board.json"] ?? "";
		for (const text of ["{}", "not JSON"])
			expect(plan({ ...t, stored: { ...t.stored, "mutation/board.json": text } }).problems).toEqual([
				"mutation/board.json carries no files",
			]);
		const both = JSON.stringify({ files: { ...JSON.parse(board).files, "bun/guard.ts": { source: "", mutants: [] } } });
		for (const text of [board, both])
			expect(plan({ ...t, stored: { ...t.stored, "mutation/guard.json": text } }).problems).toEqual([
				"mutation/guard.json holds bun/board.ts, not bun/guard.ts — delete the stored file",
			]);
		expect(plan({ ...t, stored: { ...t.stored, "mutation/old.json": board } }).problems).toContain(
			"mutation/old.json holds bun/board.ts, not bun/old.ts — delete the stored file",
		);
	});
});
