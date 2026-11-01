#!/usr/bin/env bun
/**
 * Fails when a tracked source file carries a linter or type-checker
 * suppression. The rule it replaces has an escape hatch — a suppression is
 * allowed once the user approves it — and a grep cannot see approval, so the
 * approval is an entry of the consumer's `harness.suppressions` and therefore a
 * line of the diff.
 *
 * Every tracked file is read but prose, the check's own script and test, and
 * the root manifest the approvals live in. Prose names these markers while
 * explaining the rule — all four artefacts of the change introducing this check
 * do — and a check that fails on its own proposal is a check nobody keeps.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { read } from "./config.ts";
import { unreadable } from "./floor.ts";
import { tracked } from "./tracked.ts";

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
 * pin a count that every added test case then has to re-approve. Named from
 * where they sit relative to `root`, which in a consumer is a path git does not
 * track and so never matches.
 */
const self = (root: string) =>
	["no-suppressions.ts", "no-suppressions.test.ts"].map((name) => relative(root, join(import.meta.dir, name)));

/**
 * The root manifest, where `harness.suppressions` lives: every approval's key
 * names its marker, so scanning the file counts each approval as a suppression
 * of its own. Nothing in it can suppress anything — `read` parses it with
 * `JSON.parse`, which rejects a comment, so a marker can only sit in a string.
 * Root-relative, the way `git ls-files` names it from the root, so a workspace
 * manifest below the root holds no allowlist and is still scanned.
 */
const MANIFEST = "package.json";

/**
 * The consumer's `harness.suppressions`, each entry keyed by `<path> <marker>`
 * and holding how many occurrences of that marker are approved there and why.
 * Returns the readable entries' counts as `approved`, and in `problems` one
 * line per field an entry gets wrong, naming its key — such an entry approves
 * nothing. The count is what stops a second suppression riding in on the
 * first one's approval; the marker in the key is what stops a suppression of
 * one kind being swapped for another on the first one's approval.
 *
 * The markers are named here only as string literals, never in prose: Biome's
 * `suspicious/noTsIgnore` reads a comment as a directive wherever it sits, and
 * `biome check --write` rewrote this very sentence when it spelled one out.
 */
export function allowlist(root: string): {
	approved: Record<string, number>;
	problems: string[];
} {
	const value: unknown = read(root, "suppressions");
	// Named as a whole rather than read character by character or by index.
	// `instanceof` narrows without a `null` test, which `read` makes dead by
	// throwing on `null` first.
	if (!(value instanceof Object) || Array.isArray(value))
		return {
			approved: {},
			problems: ["harness.suppressions is not an object of approvals"],
		};
	const approved: Record<string, number> = {};
	const problems: string[] = [];
	for (const [key, entry] of Object.entries(value)) {
		const faults = unreadable(`harness.suppressions[${JSON.stringify(key)}]`, "count", entry?.count, entry?.why);
		// An entry the check cannot read approves nothing: a count of `NaN`,
		// which no length exceeds, would otherwise approve every occurrence.
		// Its faults are returned rather than thrown, so `check.ts` still
		// reports every other gate.
		if (faults.length) problems.push(...faults);
		else approved[key] = entry.count;
	}
	return { approved, problems };
}

export type Finding = { path: string; line: number; marker: string };

/**
 * Every suppression in the repository containing `cwd` that `approved` does not
 * admit. Tracked files only, so an untracked file cannot fail a clone that
 * does not have it; a tracked file is read even where an ignore rule matches
 * it, since every clone has it.
 *
 * The sweep's regular files, rooted at the repository root rather than at
 * `cwd`, so from a subdirectory the check's own two paths still match and it
 * does not fail on itself.
 */
export function scan(cwd?: string, approved?: Record<string, number>): Finding[] {
	const { root, files } = tracked(cwd);
	return sweep(root, files, approved ?? allowlist(root).approved);
}

/** The suppressions among `files` at `root` that `allowed` does not admit. */
function sweep(root: string, files: string[], allowed: Record<string, number>): Finding[] {
	const own = self(root);

	const found: Finding[] = [];
	for (const path of files) {
		if (PROSE.some((ext) => path.endsWith(ext))) continue;
		if (own.includes(path) || path === MANIFEST) continue;
		readFileSync(join(root, path), "utf8")
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
		.filter(([key, list]) => list.length > (allowed[key] ?? 0))
		.flatMap(([, list]) => list);
}

/**
 * What the gate reports for the repository containing `cwd`: each allowlist
 * entry it cannot read, then each unapproved suppression — what `check.ts` and
 * the script both print, from one listing of the tree and one read of the
 * allowlist, both at the repository root.
 */
export function report(cwd?: string): string[] {
	const { root, files } = tracked(cwd);
	const { approved, problems } = allowlist(root);
	return [...problems, ...sweep(root, files, approved).map(({ path, line, marker }) => `${path}:${line}: ${marker}`)];
}

if (import.meta.main) {
	const problems = report();
	for (const problem of problems) console.error(problem);
	if (problems.length) process.exit(1);
}
