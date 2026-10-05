#!/usr/bin/env bun
/**
 * Fails when a tracked source file carries a linter or type-checker
 * suppression. The rule it replaces has an escape hatch — a suppression is
 * allowed once the user approves it — and a grep cannot see approval, so the
 * approval is a line of this file's allowlist and therefore a line of the diff.
 *
 * Every tracked file is read but prose. Prose names these markers while
 * explaining the rule — all four artefacts of the change introducing this check
 * do — and a check that fails on its own proposal is a check nobody keeps.
 */
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MARKERS = ["biome-ignore", "@ts-expect-error", "@ts-ignore"];

/**
 * Exempt because it is prose, and prose is the only thing here that discusses a
 * suppression without carrying one. Naming the source extensions instead was
 * tried and is a list that grows silently: `.ts`, `.tsx` and `.json` left
 * Biome's own `.js`, `.jsx`, `.mjs` and `.cjs` unscanned, so the first such
 * file to arrive would have been exempt with nobody deciding that.
 */
const PROSE = [".md"];

/**
 * This script and its test, excluded by path rather than by allowlist entry:
 * both must spell the three markers out to do their job, and an entry would
 * pin a count that every added test case then has to re-approve.
 */
const SELF = ["scripts/no-suppressions.ts", "scripts/no-suppressions.test.ts"];

/**
 * Approved suppressions, keyed by `<path> <marker>` and valued by how many
 * occurrences of that marker are approved there, with the reason as a comment
 * beside the entry. The count is what stops a second suppression riding in on
 * the first one's approval; the marker in the key is what stops a suppression
 * of one kind being swapped for another on the first one's approval.
 *
 * The markers are named here only as string literals, never in prose: Biome's
 * `suspicious/noTsIgnore` reads a comment as a directive wherever it sits, and
 * `biome check --write` rewrote this very sentence when it spelled one out.
 */
const APPROVED: Record<string, number> = {};

export type Finding = { path: string; line: number; marker: string };

/**
 * Every suppression in the repository containing `cwd` that `approved` does not
 * admit. Tracked files only, so an ignored or untracked file cannot fail a
 * clone that does not have it.
 *
 * The listing is taken at the repository root, never at `cwd`: `git ls-files`
 * run in a subdirectory reports only what is under it and names it relative to
 * it, so from `scripts/` the check's own two paths stop matching `SELF` and it
 * fails on itself.
 */
export function scan(cwd?: string, approved = APPROVED): Finding[] {
	const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd });
	if (top.exitCode !== 0) throw new Error(top.stderr.toString());
	// Only the terminator git adds, not `trim()`: a repository whose path ends
	// in a space is unusual and not this check's to corrupt.
	const root = top.stdout.toString().replace(/\n$/, "");

	const ls = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
	if (ls.exitCode !== 0) throw new Error(ls.stderr.toString());

	const found: Finding[] = [];
	// `-z` terminates rather than separates, so the last field is empty and
	// would otherwise resolve to the root itself and be read as a directory.
	for (const path of ls.stdout.toString().split("\0").filter(Boolean)) {
		if (PROSE.some((ext) => path.endsWith(ext))) continue;
		if (SELF.includes(path)) continue;
		const full = join(root, path);
		// Regular files only: the entry may be tracked but deleted from the work
		// tree, a symlink whose target is nobody's business here, or a
		// submodule's gitlink, which reads as a directory.
		if (!lstatSync(full, { throwIfNoEntry: false })?.isFile()) continue;
		readFileSync(full, "utf8")
			.split("\n")
			.forEach((text, at) => {
				for (const marker of MARKERS) {
					// Occurrences, not lines: two block comments fit on one line,
					// and counting the line once would let an approval of one
					// admit both.
					const times = text.split(marker).length - 1;
					for (let n = 0; n < times; n++) {
						found.push({ path, line: at + 1, marker });
					}
				}
			});
	}

	return [...Map.groupBy(found, ({ path, marker }) => `${path} ${marker}`)]
		.filter(([key, list]) => list.length > (approved[key] ?? 0))
		.flatMap(([, list]) => list);
}

if (import.meta.main) {
	const unapproved = scan();
	for (const { path, line, marker } of unapproved) {
		console.error(`${path}:${line}: ${marker}`);
	}
	if (unapproved.length) process.exit(1);
}
