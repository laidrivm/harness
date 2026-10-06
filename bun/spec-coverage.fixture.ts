/**
 * What the coverage check's test files build a case out of: a throwaway
 * repository holding the spec files and test sources one case needs, all
 * tracked, because the sweep lists its files through `git ls-files`.
 *
 * Its own module because the cases split across files by what they exercise
 * and every one of them fabricates the same shape of repository. A copy per
 * file would drift in what it writes — the requirement heading, the tracking —
 * while each file still passed.
 *
 * `afterAll` is not registered here: a lifecycle hook belongs to the file it
 * runs for, so each test file registers `cleanup` itself.
 *
 * The list of fabricated directories is module state, shared by every file
 * importing this — which is safe because Bun runs one test file to completion
 * before loading the next, measured rather than assumed: two files sharing a
 * module print `B body, B afterAll, A body, A afterAll`. So one file's
 * `cleanup` cannot reach a directory another is still using. Were that
 * ordering to change, or were a case to fabricate at collection time rather
 * than inside a `test`, this would need an instance per file.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { check } from "./spec-coverage.ts";
import type { Criterion } from "./spec-criteria.ts";

const made: string[] = [];

/** Removes every repository fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** A tracked temporary directory with no repository in it. */
export function emptyDir(prefix = "spec-coverage-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	made.push(dir);
	return dir;
}

/** A throwaway repository holding `files`, all tracked. */
export function fabricate(files: Record<string, string>): string {
	const dir = emptyDir();
	const git = (...args: string[]) => {
		const run = Bun.spawnSync(["git", ...args], { cwd: dir });
		if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	};
	git("init", "-b", "main");
	for (const [path, text] of Object.entries(files)) {
		const full = join(dir, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
	git("add", "-A");
	return dir;
}

/** A spec file carrying `scenarios` under one requirement. */
export const spec = (...scenarios: string[]) =>
	`# capability\n\n### Requirement: A thing holds\n\n${scenarios
		.map((s) => `#### Scenario: ${s}\n\n- **WHEN** a\n- **THEN** b\n`)
		.join("\n")}`;

export const ids = (list: Criterion[]) => list.map((c) => c.id);

/** A repository holding one capability's `scenarios` and one test file. */
export const world = (source: string, ...scenarios: string[]) =>
	fabricate({
		"openspec/specs/capability/spec.md": spec(...scenarios),
		"src/thing.test.ts": source,
	});

export const cited = (dir: string) => [...check(dir).cited].sort();
export const problems = (dir: string) => check(dir).problems;
