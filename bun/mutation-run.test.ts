import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tree } from "./mutation-checkout.ts";
import { loadReport, survivors } from "./mutation-floor.ts";
import { fingerprint, merge, modules, plan, type Stored, testsOf, trim } from "./mutation-run.ts";

const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
const scratch = () => {
	const dir = mkdtempSync(join(tmpdir(), "mutation-run-"));
	made.push(dir);
	return dir;
};

const mutant = (id: string, status: string) => ({
	id,
	mutatorName: "BooleanLiteral",
	location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
	replacement: "false",
	status,
});

/** A checkout whose working tree, index and `HEAD` all hold `files`, every module a test matches on the list. */
const tree = (files: Record<string, string>): Tree => {
	const paths = Object.keys(files);
	return {
		tracked: paths,
		blobs: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, Bun.hash(text).toString()])),
		text: files,
		stored: {},
		dirty: [],
		listed: modules(paths).filter((m) => testsOf(m, paths).length),
		options: { testRunner: "command" },
	};
};

/** `t` with `path` committed as `text`, or deleted where `text` is undefined; the list stays as it was. */
function commit(t: Tree, path: string, text?: string): Tree {
	const files = { ...t.text };
	if (text === undefined) delete files[path];
	else files[path] = text;
	return { ...tree(files), stored: t.stored, listed: t.listed, options: t.options };
}

/** `t` with every module that has tests measured against it, one survivor each. */
function measured(t: Tree): Tree {
	const stored: Record<string, string> = {};
	for (const module of plan(t, { all: true, force: false }).runs.map((run) => run.module)) {
		const report = {
			schemaVersion: "1.0",
			files: { [module]: { source: t.text[module] ?? "", mutants: [mutant("0", "Survived")] } },
		};
		stored[`mutation/${module.slice(4, -3)}.json`] = JSON.stringify(trim(report, fingerprint(module, t)));
	}
	return { ...t, stored };
}

const runs = (t: Tree) => plan(t).runs;
const named = (t: Tree) => runs(t).map((run) => run.module);

const base = tree({
	"bunfig.toml": '[test]\npreload = ["./bun/guard.ts"]\n',
	"bun/guard.ts": "export {};\n",
	"bun/guard.test.ts": "test('a', () => {});\n",
	"bun/pre-pr.ts": "export const a = 1;\n",
	"bun/pre-pr.test.ts": "test('a', () => {});\n",
	"bun/pre-pr-steps.ts": "export const b = 1;\n",
	"bun/pre-pr-steps.test.ts": "test('b', () => {});\n",
	"bun/pre-pr-steps-run.test.ts": "test('b', () => {});\n",
	"bun/command-parse.ts": "export const c = 1;\n",
	"bun/command-parse.test.ts": 'import { run } from "./command-guard.fixture.ts";\n',
	"bun/command-guard.ts": "export const d = 1;\n",
	"bun/command-guard.test.ts": 'import { run } from "./command-guard.fixture.ts";\n',
	"bun/command-guard.fixture.ts": "export const run = 1;\n",
	"bun/board.ts": "export const e = 1;\n",
	"bun/board.test.ts": "test('e', () => {});\n",
	"bun/root.ts": "export const root = '.';\n",
	"bun/diff-budget.sh": "exit 0\n",
});
const current = () => measured(base);

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
	test("a changed test forces the modules whose filter matches it, and no other", () => {
		const forced = [
			{ module: "bun/pre-pr.ts", force: true },
			{ module: "bun/pre-pr-steps.ts", force: true },
		];
		expect(runs(commit(current(), "bun/pre-pr-steps.test.ts", "test('c', () => {});\n"))).toEqual(forced);
		expect(runs(commit(current(), "bun/pre-pr-steps.test.ts"))).toEqual(forced);
		const renamed = commit(commit(current(), "bun/pre-pr-steps.test.ts"), "bun/pre-pr-steps-x.test.ts", "x\n");
		expect(runs(renamed)).toEqual(forced);
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
	test("a change to Stryker's shared options forces every module, and the fingerprint names the command", () => {
		const t = current();
		const all = runs({ ...t, options: { ...t.options, ignoreStatic: true } });
		expect([all.length, all.every((run) => run.force)]).toEqual([6, true]);
		expect(fingerprint("bun/board.ts", t)["stryker command"]).toEndWith("bun test bun/board");
		expect(JSON.parse(fingerprint("bun/board.ts", t)["stryker options"] ?? "")).toMatchObject({ timeoutFactor: 3 });
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
				"mutation/guard.json holds bun/board.ts, not bun/guard.ts",
			]);
		expect(plan({ ...t, stored: { ...t.stored, "mutation/old.json": board } }).problems).toContain(
			"mutation/old.json holds bun/board.ts, not bun/old.ts",
		);
	});
});

describe("what a stored file holds", () => {
	// spec: mutation-floor/the-same-results-written-in-another-checkout
	test("only the fields an incremental run reads, mutants in id order, whatever the machine", () => {
		const from = (root: string, reason: string) => ({
			schemaVersion: "1.0",
			projectRoot: root,
			config: { configFile: `${root}/stryker.config.json` },
			testFiles: { "": { tests: [{ id: "0", name: "All tests" }] } },
			files: {
				"bun/a.ts": {
					language: "typescript",
					source: "a",
					mutants: [
						{ ...mutant("10", "Killed"), statusReason: reason, killedBy: ["0"], coveredBy: [], testsCompleted: 1 },
						{ ...mutant("9", "Survived"), static: false },
					],
				},
			},
		});
		const one = trim(from("/home/a", "at /home/a/x.ts:1"), { "bun/a.test.ts": "1" });
		expect(one).toEqual({
			schemaVersion: "1.0",
			files: { "bun/a.ts": { source: "a", mutants: [mutant("9", "Survived"), mutant("10", "Killed")] } },
			fingerprint: { "bun/a.test.ts": "1" },
		});
		expect(JSON.stringify(trim(from("/Users/b", "at /Users/b/x.ts:2"), { "bun/a.test.ts": "1" }))).toBe(
			JSON.stringify(one),
		);
	});

	// spec: mutation-floor/unchanged-modules-counted-from-their-stored-results
	test("the merge mutation-floor reads sums every stored file's survivors", () => {
		const file = (path: string, ...statuses: string[]): Stored => ({
			schemaVersion: "1.0",
			files: { [path]: { source: "x", mutants: statuses.map((status, i) => mutant(String(i), status)) } },
			fingerprint: {},
		});
		const report = join(scratch(), "mutation.json");
		const merged = merge([file("bun/a.ts", "Survived", "Killed"), file("bun/b.ts", "Survived")]);
		writeFileSync(report, JSON.stringify(merged));
		expect(survivors(loadReport(report))).toBe(2);
	});
});
