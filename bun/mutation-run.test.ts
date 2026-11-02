import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReport, survivors } from "./mutation-floor.ts";
import { fingerprint, merge, modules, plan, type Stored, type Tree, trim } from "./mutation-run.ts";

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

/** A checkout whose working tree, index and `HEAD` all hold `files`. */
const tree = (files: Record<string, string>): Tree => ({
	tracked: Object.keys(files),
	blobs: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, Bun.hash(text).toString()])),
	text: files,
	stored: {},
	dirty: [],
});

/** `t` with `path` committed as `text`, or deleted where `text` is undefined. */
function commit(t: Tree, path: string, text?: string): Tree {
	const files = { ...t.text };
	if (text === undefined) delete files[path];
	else files[path] = text;
	return { ...tree(files), stored: t.stored };
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

	// spec: mutation-floor/a-module-no-test-file-matches
	test("a module no test file matches is named and not run", () => {
		const { runs, untested } = plan(base);
		expect(untested).toEqual(["bun/root.ts"]);
		expect(runs.map((run) => run.module)).not.toContain("bun/root.ts");
	});
});

describe("what a run mutates", () => {
	test("current stored results run nothing", () => {
		expect(plan(current())).toEqual({ runs: [], untested: ["bun/root.ts"], problems: [] });
	});

	test("a change to a script that is not a module runs nothing", () => {
		expect(runs(commit(current(), "bun/diff-budget.sh", "exit 1\n"))).toEqual([]);
	});

	// spec: mutation-floor/the-module-s-source-changed
	test("a source that differs from its stored copy runs that module incrementally", () => {
		expect(runs(commit(current(), "bun/command-parse.ts", "export const c = 2;\n"))).toEqual([
			{ module: "bun/command-parse.ts", force: false },
		]);
	});

	test("a fingerprint stored in another key order runs nothing", () => {
		const t = current();
		const path = "mutation/board.json";
		const stored: Stored = JSON.parse(t.stored[path] ?? "");
		const reversed = Object.fromEntries(Object.entries(stored.fingerprint).reverse());
		expect(
			runs({ ...t, stored: { ...t.stored, [path]: JSON.stringify({ ...stored, fingerprint: reversed }) } }),
		).toEqual([]);
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

	test("an import named in a comment is not one", () => {
		const t = commit(base, "bun/board.test.ts", '// import { x } from "./command-guard.fixture.ts";\n');
		expect(Object.keys(fingerprint("bun/board.ts", t))).not.toContain("bun/command-guard.fixture.ts");
	});

	test("a committed change to bunfig.toml or its preload forces every module", () => {
		for (const [path, text] of [
			["bunfig.toml", "[test]\n"],
			["bun/guard.ts", "export const g = 1;\n"],
		] as const) {
			const all = runs(commit(current(), path, text));
			expect(all.length).toBe(6);
			expect(all.every((run) => run.force)).toBe(true);
		}
	});

	test("a preload given as one string is fingerprinted too", () => {
		const t = commit(base, "bunfig.toml", '[test]\npreload = "./bun/guard.ts"\n');
		expect(Object.keys(fingerprint("bun/board.ts", t))).toContain("bun/guard.ts");
	});

	// spec: mutation-floor/a-new-module-has-no-stored-file
	test("a new module runs whole", () => {
		const t = commit(commit(current(), "bun/new.ts", "export const n = 1;\n"), "bun/new.test.ts", "x\n");
		expect(runs(t)).toEqual([{ module: "bun/new.ts", force: false }]);
	});

	// spec: mutation-floor/a-module-with-tests-and-no-stored-file
	test("a module with tests and no stored file runs although nothing under bun/ changed", () => {
		const t = current();
		const { "mutation/board.json": _, ...rest } = t.stored;
		expect(named({ ...t, stored: rest })).toEqual(["bun/board.ts"]);
	});

	// spec: mutation-floor/a-run-asked-for-every-module
	test("--all runs every module with tests, each incrementally", () => {
		const all = plan(current(), { all: true, force: false }).runs;
		expect(all.length).toBe(6);
		expect(all.every((run) => !run.force)).toBe(true);
		expect(plan(current(), { all: true, force: true }).runs.every((run) => run.force)).toBe(true);
	});
});

describe("what fails the run before it mutates", () => {
	test.each(["bun/board.ts", "bun/board.test.ts", "bun/command-guard.fixture.ts", "bunfig.toml"])(
		"a dirty %s",
		(path) => {
			const { problems } = plan({ ...current(), dirty: [path] });
			expect(problems.length).toBeGreaterThan(0);
			expect(problems.every((problem) => problem.includes(path))).toBe(true);
		},
	);

	// spec: mutation-floor/a-stored-file-outliving-its-module
	test("a stored file of an untracked module", () => {
		expect(plan(commit(current(), "bun/board.ts")).problems).toEqual([
			"mutation/board.json: bun/board.ts is not tracked — delete the stored file",
		]);
	});

	// spec: mutation-floor/a-stored-file-whose-module-lost-its-last-test
	test("a stored file whose module has no test file left", () => {
		expect(plan(commit(current(), "bun/board.test.ts")).problems).toEqual([
			"mutation/board.json: no test file matches bun/board — delete the stored file",
		]);
	});

	test("a stored file without files, and two naming one path", () => {
		const t = current();
		const board = t.stored["mutation/board.json"] ?? "";
		for (const text of ["{}", "not JSON"])
			expect(plan({ ...t, stored: { ...t.stored, "mutation/board.json": text } }).problems).toEqual([
				"mutation/board.json carries no files",
			]);
		expect(plan({ ...t, stored: { ...t.stored, "mutation/old.json": board } }).problems).toContain(
			"mutation/board.json and mutation/old.json both hold bun/board.ts",
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
			framework: { name: "StrykerJS", version: "10.0.0" },
			thresholds: { high: 80, low: 60, break: null },
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
		writeFileSync(
			report,
			JSON.stringify(merge([file("bun/a.ts", "Survived", "Killed"), file("bun/b.ts", "Survived")])),
		);
		expect(survivors(loadReport(report))).toBe(2);
	});
});
