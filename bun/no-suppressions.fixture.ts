/**
 * What the suppression scan's cases build a repository out of: a throwaway
 * tree with tracked and untracked files, and the consumer manifest holding the
 * allowlist.
 *
 * Moved out of `no-suppressions.test.ts` to keep that file under its cap. The
 * list of fabricated directories is module state, safe on the terms
 * `mutation-floor.fixture.ts` records; `afterAll(cleanup)` stays with the test
 * file.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const made: string[] = [];

/** Removes every directory fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** A tracked temporary directory, for a case that lays out no repository. */
export function emptyDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	made.push(dir);
	return dir;
}

function write(dir: string, files: Record<string, string>): void {
	for (const [path, text] of Object.entries(files)) {
		const full = join(dir, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
}

/** A throwaway repository holding `tracked`, plus `untracked` left unadded. */
export function fabricate(
	tracked: Record<string, string>,
	untracked: Record<string, string> = {},
): string {
	const dir = emptyDir("no-suppressions-");
	const git = (...args: string[]) => {
		const run = Bun.spawnSync(["git", ...args], { cwd: dir });
		if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	};
	git("init", "-b", "main");
	write(dir, tracked);
	git("add", "-A");
	// Untracked, so the scan never reads it: the consumer's empty allowlist —
	// unless the case tracks a manifest of its own, which this must not replace.
	write(dir, {
		...("package.json" in tracked ? {} : { "package.json": manifest({}) }),
		...untracked,
	});
	return dir;
}

/** A consumer manifest whose allowlist holds `entries` as they are given. */
export const allowlist = (entries: Record<string, unknown>): string =>
	JSON.stringify({ harness: { suppressions: entries } }, null, 2);

/** A consumer manifest approving `counts`, keyed by `<path> <marker>`. */
export function manifest(counts: Record<string, number>): string {
	return allowlist(
		Object.fromEntries(
			Object.entries(counts).map(([key, count]) => [key, { count, why: "x" }]),
		),
	);
}
