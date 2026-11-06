/**
 * What `bun/mutation-run.ts` stores of a module's Stryker results as `mutation/<name>.json`, and the report it merges
 * them into; apart from the run so both stay under the cap.
 */

export type Mutant = {
	id: string;
	mutatorName: string;
	location: unknown;
	replacement?: string;
	status: string;
	coveredBy?: string[];
	killedBy?: string[];
};
type Test = { id: string; name: string; location?: unknown };
type TestFiles = Record<string, { source?: string; tests: Test[] }>;
export type Stored = {
	schemaVersion: string;
	testFiles: TestFiles;
	files: Record<string, { source: string; mutants: Mutant[] }>;
	fingerprint: Record<string, string>;
};

/** Test files' sources and tests, the ids, names and locations Stryker's differ matches tests by, in path order. */
const keepTests = (testFiles: TestFiles = {}): TestFiles =>
	Object.fromEntries(
		Object.keys(testFiles)
			.sort()
			.map((path) => {
				const { source, tests } = testFiles[path] as TestFiles[string];
				const kept = tests.map(({ id, name, location }) => ({ id, name, location }));
				return [path, { source, tests: kept.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true })) }];
			}),
	);

type Report = {
	schemaVersion: string;
	testFiles?: TestFiles;
	files: Record<string, { source: string; mutants: Mutant[] }>;
};

/**
 * Stryker's incremental file cut to what its next run reads, as the probes measured, plus `print`. The rest depends
 * on the machine or the order mutants finished in, so a re-run anywhere writes the same bytes: the covering and
 * killing tests are sorted, and an empty `killedBy`, which a reused result carries and a fresh one leaves out, dropped.
 */
export function trim(report: Report, print: Record<string, string>): Stored {
	const files: Stored["files"] = {};
	for (const path of Object.keys(report.files).sort()) {
		const { source, mutants } = report.files[path] as Report["files"][string];
		files[path] = {
			source,
			mutants: mutants
				.map(({ id, mutatorName, location, replacement, status, coveredBy, killedBy }) => ({
					id,
					mutatorName,
					location,
					replacement,
					status,
					...(coveredBy && { coveredBy: [...coveredBy].sort() }),
					...(killedBy?.length ? { killedBy: [...killedBy].sort() } : {}),
				}))
				.sort((a, b) => Number(a.id) - Number(b.id)),
		};
	}
	return { schemaVersion: report.schemaVersion, testFiles: keepTests(report.testFiles), files, fingerprint: print };
}

/**
 * What a run whose tests changed hands Stryker to reuse: every result but a survivor. Stryker 10's differ reuses a
 * survivor that gained no covering test, and it reads a test as changed only where the edit falls between its start
 * and the next test's: a static mutant has no covering test to compare, and an edit to setup above the first test
 * changes none, so a test that now kills either would leave the floor counting it. Left out, Stryker runs each again
 * as a new mutant, against the tests that cover it.
 */
export const reusable = (stored: Stored): Stored => ({
	...stored,
	files: Object.fromEntries(
		Object.entries(stored.files).map(([path, file]) => [
			path,
			{ ...file, mutants: file.mutants.filter((m) => m.status !== "Survived") },
		]),
	),
});

/** One report holding every stored file's results, for `bun/mutation-floor.ts`. */
export const merge = (stored: Stored[]) => ({
	schemaVersion: stored[0]?.schemaVersion ?? "1.0",
	files: Object.assign({}, ...stored.map((file) => file.files)),
});
