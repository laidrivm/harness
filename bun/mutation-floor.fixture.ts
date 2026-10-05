/**
 * What the mutation floor's test files build a case out of: a Stryker report
 * on disk, and the object shape one is made of.
 *
 * Its own module because the cases split across three files by what they
 * exercise and every one of them builds a report. A copy per file would drift
 * in the shape it writes — the key the check reads a mutant's status from —
 * while each file still passed.
 *
 * The list of fabricated directories is module state, shared by every file
 * importing this, which is safe on the same terms as
 * `spec-coverage.fixture.ts` records: Bun runs one test file to completion
 * before loading the next, and no case fabricates at collection time.
 * `afterAll` stays with each test file, where a lifecycle hook belongs.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The check and what it imports, for the cases that stand a copy of it beside
 * a tree of their own rather than running it against this repository. Keyed by
 * the name each must be written under, because the copy resolves `./scan.ts`
 * exactly as the original does.
 */
export const modules: Record<string, string> = Object.fromEntries(
	["mutation-floor.ts", "root.ts", "scan.ts"].map((name) => [
		name,
		readFileSync(join(import.meta.dir, name), "utf8"),
	]),
);

const made: string[] = [];

/** Removes every directory fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** A tracked temporary directory, for a case that lays out its own tree. */
export function emptyDir(prefix = "mutation-floor-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	made.push(dir);
	return dir;
}

/** A file holding `text`, in a directory removed when the suite ends. */
export function fabricate(text: string): string {
	const file = join(emptyDir(), "mutation.json");
	writeFileSync(file, text);
	return file;
}

/** A report whose one file carries `statuses`, one mutant each. */
export const report = (...statuses: string[]) => ({
	files: {
		"src/model.ts": { mutants: statuses.map((status) => ({ status })) },
	},
});
