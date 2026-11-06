/** What `bun/mutation-run.ts` hands Stryker and stores of its results; which modules it runs is in `mutation-run.test.ts`. */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "./mutation-checkout.ts";
import { loadReport, survivors } from "./mutation-floor.ts";
import { base, mutant } from "./mutation-run.fixture.ts";
import { configuration, fingerprint } from "./mutation-run.ts";
import { merge, type Stored, trim } from "./mutation-stored.ts";
import { root } from "./root.ts";

const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe("what Stryker is handed", () => {
	test("a module runs under the bun runner with per-test coverage, its own test files and the dry run's limit", () => {
		const config = configuration(load(root), "bun/sync-settings.ts", "work.json", false);
		expect(config).toMatchObject({
			testRunner: "bun",
			appendPlugins: ["@hughescr/stryker-bun-runner"],
			coverageAnalysis: "perTest",
			buildCommand: "bun bun/mutation-sandbox.ts",
			mutate: ["bun/sync-settings.ts"],
			bun: { testFiles: ["bun/sync-settings-package.test.ts", "bun/sync-settings.test.ts"], timeout: 900000 },
			incrementalFile: "work.json",
			dryRunOnly: false,
		});
		expect(Object.keys(config)).not.toContain("commandRunner");
	});
});

describe("what a stored file holds", () => {
	/** Stryker's incremental file as `root`'s machine writes it, reasons and timings included. */
	const from = (root: string, reason: string, killedBy: string[]) => ({
		schemaVersion: "1.0",
		projectRoot: root,
		config: { configFile: `${root}/stryker.config.json` },
		testFiles: {
			"bun/a.test.ts": {
				source: "test('b'); test('a');",
				tests: [
					{ id: "1", name: "b", location: { start: { line: 1, column: 1 } }, startPosition: 3 },
					{ id: "0", name: "a", location: { start: { line: 1, column: 12 } } },
				],
			},
		},
		files: {
			"bun/a.ts": {
				language: "typescript",
				source: "a",
				mutants: [
					{ ...mutant("10", "Killed"), statusReason: reason, killedBy: ["1", "0"], coveredBy: ["1", "0"] },
					{ ...mutant("9", "Survived"), static: false, killedBy, coveredBy: ["0"], testsCompleted: 1 },
				],
			},
		},
	});

	// spec: mutation-floor/the-same-results-written-in-another-checkout
	// spec: mutation-floor/what-a-stored-file-holds-of-tests
	test("only what an incremental run reads, sorted, whatever the machine or the order mutants finished in", () => {
		const one = trim(from("/home/a", "at /home/a/x.ts:1", []), { "bunfig.toml": "1" });
		expect(one).toEqual({
			schemaVersion: "1.0",
			testFiles: {
				"bun/a.test.ts": {
					source: "test('b'); test('a');",
					tests: [
						{ id: "0", name: "a", location: { start: { line: 1, column: 12 } } },
						{ id: "1", name: "b", location: { start: { line: 1, column: 1 } } },
					],
				},
			},
			files: {
				"bun/a.ts": {
					source: "a",
					mutants: [
						{ ...mutant("9", "Survived"), coveredBy: ["0"] },
						{ ...mutant("10", "Killed"), coveredBy: ["0", "1"], killedBy: ["0", "1"] },
					],
				},
			},
			fingerprint: { "bunfig.toml": "1" },
		});
		// A reused result carries an empty `killedBy` where a fresh one leaves it out.
		const other = trim(from("/Users/b", "at /Users/b/x.ts:2", undefined as unknown as string[]), {
			"bunfig.toml": "1",
		});
		expect(JSON.stringify(other)).toBe(JSON.stringify(one));
	});

	test("the fingerprint names no test file and no command, and names the runner's and Stryker's versions", () => {
		const print = fingerprint("bun/command-guard.ts", base);
		expect(Object.keys(print).filter((key) => key.endsWith(".test.ts") || key.includes("command"))).toEqual([
			"bun/command-guard.fixture.ts",
		]);
		expect(print).toMatchObject({ "@hughescr/stryker-bun-runner": "1.6.0", "@stryker-mutator/core": "10.0.0" });
		expect(JSON.parse(print["stryker options"] ?? "")).toMatchObject({ timeoutFactor: 3 });
	});

	test("load reads both versions from package.json's pins", () => {
		const pins = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devDependencies;
		expect(load(root).versions).toEqual({
			"@hughescr/stryker-bun-runner": pins["@hughescr/stryker-bun-runner"],
			"@stryker-mutator/core": pins["@stryker-mutator/core"],
		});
	});

	// spec: mutation-floor/a-mutant-no-test-reaches
	test("a mutant no test reached is stored as NoCoverage with no covering or killing test", () => {
		const uncovered = { ...mutant("0", "NoCoverage"), coveredBy: [], killedBy: [], static: false };
		const report = { schemaVersion: "1.0", files: { "bun/a.ts": { source: "a", mutants: [uncovered] } } };
		expect(trim(report, {}).files["bun/a.ts"]?.mutants).toEqual([{ ...mutant("0", "NoCoverage"), coveredBy: [] }]);
	});

	// spec: mutation-floor/a-module-its-tests-reach-only-through-a-child-process
	test("a stored file whose mutants a spawned process alone reached counts every one as a survivor", () => {
		const spawned: Stored = {
			schemaVersion: "1.0",
			testFiles: { "bun/a.test.ts": { source: "spawn('bun', ['bun/a.ts'])", tests: [{ id: "0", name: "a" }] } },
			files: { "bun/a.ts": { source: "a", mutants: ["0", "1"].map((id) => mutant(id, "NoCoverage")) } },
			fingerprint: {},
		};
		const dir = mkdtempSync(join(tmpdir(), "mutation-run-"));
		made.push(dir);
		writeFileSync(join(dir, "mutation.json"), JSON.stringify(merge([spawned])));
		expect(survivors(loadReport(join(dir, "mutation.json")))).toBe(2);
	});

	// spec: mutation-floor/unchanged-modules-counted-from-their-stored-results
	test("the merge mutation-floor reads sums every stored file's survivors", () => {
		const file = (path: string, ...statuses: string[]): Stored => ({
			schemaVersion: "1.0",
			testFiles: {},
			files: { [path]: { source: "x", mutants: statuses.map((status, i) => mutant(String(i), status)) } },
			fingerprint: {},
		});
		const dir = mkdtempSync(join(tmpdir(), "mutation-run-"));
		made.push(dir);
		const report = join(dir, "mutation.json");
		writeFileSync(
			report,
			JSON.stringify(merge([file("bun/a.ts", "Survived", "Killed"), file("bun/b.ts", "Survived")])),
		);
		expect(survivors(loadReport(report))).toBe(2);
	});
});
