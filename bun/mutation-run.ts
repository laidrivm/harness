#!/usr/bin/env bun
/**
 * The mutation step `openspec/specs/mutation-floor/spec.md` sets out. Each
 * module `bun/<name>.ts` is mutated alone, judged by `bun test bun/<name>`,
 * and its results stored as `mutation/<name>.json`; a run mutates only the
 * modules those results no longer cover, then merges every stored file into
 * the report `bun/mutation-floor.ts` counts.
 *
 * `bun bun/mutation-run.ts [--all] [--force] [bun/<name>.ts…]`: `--all` runs
 * every module with tests, each incrementally, so an interrupted baseline
 * resumes; `--force` re-runs each one whole; named modules narrow the run.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { REPORT } from "./mutation-floor.ts";
import { root } from "./root.ts";
import { tracked as sweep } from "./tracked.ts";

export type Mutant = { id: string; mutatorName: string; location: unknown; replacement?: string; status: string };
export type Stored = {
	schemaVersion: string;
	files: Record<string, { source: string; mutants: Mutant[] }>;
	fingerprint: Record<string, string>;
};

/**
 * What a plan reads of a checkout: every tracked path, `HEAD`'s blob id of each, the working-tree text of each
 * `bun/*.ts` and `bunfig.toml` and of each `mutation/<name>.json`, and the paths `git status` lists.
 */
export type Tree = {
	tracked: string[];
	blobs: Record<string, string>;
	text: Record<string, string>;
	stored: Record<string, string>;
	dirty: string[];
};

export type Run = { module: string; force: boolean };

/** Every tracked `bun/<name>.ts` that is neither a test nor a fixture. */
export const modules = (tracked: string[]) =>
	tracked.filter((path) => /^bun\/[^/]+\.ts$/.test(path) && !/\.(test|fixture)\.ts$/.test(path));

const stem = (module: string) => module.slice(0, -".ts".length);
const storedPath = (module: string) => `mutation/${stem(module).slice("bun/".length)}.json`;

/** The test files `bun test bun/<name>` runs: those whose path begins with it. */
const testsOf = (module: string, tracked: string[]) =>
	tracked.filter((path) => path.startsWith(stem(module)) && path.endsWith(".test.ts"));

const transpiler = new Bun.Transpiler({ loader: "ts" });

/**
 * What the module's results were measured against, by `HEAD`'s blob id: its
 * tests, the fixtures they import (one level, Bun's own parse, so an import a
 * comment names is not one), `bunfig.toml` and what it preloads. The command
 * runner reports no tests, so Stryker cannot see any of them change.
 */
export function fingerprint(module: string, tree: Tree): Record<string, string> {
	const tests = testsOf(module, tree.tracked);
	const fixtures = tests.flatMap((test) =>
		transpiler
			.scanImports(tree.text[test] ?? "")
			.map(({ path }) => posix.join(posix.dirname(test), path))
			.filter((path) => path.endsWith(".fixture.ts")),
	);
	const bunfig = tree.text["bunfig.toml"];
	const preload: unknown =
		bunfig === undefined ? [] : (Bun.TOML.parse(bunfig) as { test?: { preload?: unknown } }).test?.preload;
	const shared =
		bunfig === undefined ? [] : ["bunfig.toml", ...[preload ?? []].flat().map((path) => posix.normalize(String(path)))];
	const paths = [...new Set([...tests, ...fixtures, ...shared])].sort();
	return Object.fromEntries(paths.map((path) => [path, tree.blobs[path] ?? "absent"]));
}

const same = (a: Record<string, string> | undefined, b: Record<string, string>) =>
	a !== undefined && Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => a[k] === v);

/**
 * The modules to run, the ones no test file matches, and what fails the run
 * before anything is mutated: a stored file nothing could still have written,
 * one that is not a set of results, and a module whose tests are not `HEAD`'s.
 */
export function plan(tree: Tree, flags = { all: false, force: false }) {
	const problems: string[] = [];
	const runs: Run[] = [];
	const untested: string[] = [];
	const read: Record<string, Stored> = {};
	const holder = new Map<string, string>();
	for (const [path, text] of Object.entries(tree.stored)) {
		let value: Stored | undefined;
		try {
			value = JSON.parse(text);
		} catch {}
		const files: unknown = value?.files;
		if (typeof files !== "object" || files === null || Array.isArray(files) || value === undefined) {
			problems.push(`${path} carries no files`);
			continue;
		}
		read[path] = value;
		for (const source of Object.keys(files)) {
			const other = holder.get(source);
			if (other) problems.push(`${other} and ${path} both hold ${source}`);
			else holder.set(source, path);
		}
	}
	const tested = new Set(modules(tree.tracked).filter((module) => testsOf(module, tree.tracked).length));
	for (const path of Object.keys(read)) {
		const module = `bun/${path.slice("mutation/".length, -".json".length)}.ts`;
		if (!tree.tracked.includes(module)) problems.push(`${path}: ${module} is not tracked — delete the stored file`);
		else if (!tested.has(module))
			problems.push(`${path}: no test file matches ${stem(module)} — delete the stored file`);
	}
	for (const module of modules(tree.tracked)) {
		if (!tested.has(module)) {
			untested.push(module);
			continue;
		}
		const print = fingerprint(module, tree);
		// The module too: its results would otherwise describe a source `HEAD` does not hold.
		const dirty = [module, ...Object.keys(print)].filter((path) => tree.dirty.includes(path));
		if (dirty.length) {
			problems.push(`${module}: commit ${dirty.join(", ")} first — results are measured against HEAD's copy`);
			continue;
		}
		const path = storedPath(module);
		const stored = read[path];
		// A stored file that is there but unreadable is already a problem above.
		if (!stored) {
			if (!(path in tree.stored)) runs.push({ module, force: false });
			continue;
		}
		const force = flags.force || !same(stored.fingerprint, print);
		if (force || flags.all || stored.files[module]?.source !== tree.text[module]) runs.push({ module, force });
	}
	return { runs, untested, problems };
}

type Report = { schemaVersion: string; files: Record<string, { source: string; mutants: Mutant[] }> };

/**
 * Stryker's incremental file cut to what its next run reads, as the probe measured, plus `print`. The rest depends
 * on the machine or the order mutants finished in, so a re-run anywhere writes the same bytes.
 */
export function trim(report: Report, print: Record<string, string>): Stored {
	const files: Stored["files"] = {};
	for (const path of Object.keys(report.files).sort()) {
		const { source, mutants } = report.files[path] as Report["files"][string];
		files[path] = {
			source,
			mutants: mutants
				.map(({ id, mutatorName, location, replacement, status }) => ({
					id,
					mutatorName,
					location,
					replacement,
					status,
				}))
				.sort((a, b) => Number(a.id) - Number(b.id)),
		};
	}
	return { schemaVersion: report.schemaVersion, files, fingerprint: print };
}

/** One report holding every stored file's results, for `bun/mutation-floor.ts`. */
export const merge = (stored: Stored[]) => ({
	schemaVersion: stored[0]?.schemaVersion ?? "1.0",
	files: Object.assign({}, ...stored.map((file) => file.files)),
});

const git = (cwd: string, ...args: string[]) => {
	const run = Bun.spawnSync(["git", ...args], { cwd });
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString().trim()}`);
	return run.stdout.toString();
};

/** The paths `git status -z` lists under `pathspec`; a rename's or copy's source follows as an entry of its own. */
function changed(cwd: string, ...pathspec: string[]): string[] {
	const entries = git(cwd, "status", "--porcelain", "-z", "--untracked-files=all", "--", ...pathspec).split("\0");
	const paths: string[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i] ?? "";
		if (!entry) continue;
		paths.push(entry.slice(3));
		if (/[RC]/.test(entry.slice(0, 2))) paths.push(entries[++i] ?? "");
	}
	return paths;
}

/** The stored files under `cwd` that differ from `HEAD`'s, or that `HEAD` lacks. */
export const unsaved = (cwd: string) => changed(cwd, "mutation").sort();

function load(top: string): Tree {
	const { paths: tracked } = sweep(top);
	const blobs: Record<string, string> = {};
	for (const entry of git(top, "ls-tree", "-r", "-z", "--full-tree", "HEAD").split("\0").filter(Boolean)) {
		const [meta = "", path = ""] = entry.split("\t");
		blobs[path] = meta.split(" ")[2] ?? "";
	}
	const text: Record<string, string> = {};
	for (const path of tracked.filter((p) => p === "bunfig.toml" || /^bun\/[^/]+\.ts$/.test(p)))
		if (existsSync(join(top, path))) text[path] = readFileSync(join(top, path), "utf8");
	return { tracked, blobs, text, stored: storedFiles(top), dirty: changed(top) };
}

/** The text of each `mutation/<name>.json` under `top`, by its path. */
function storedFiles(top: string): Record<string, string> {
	const dir = join(top, "mutation");
	const stored: Record<string, string> = {};
	for (const name of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")) : [])
		stored[`mutation/${name}`] = readFileSync(join(dir, name), "utf8");
	return stored;
}

function fail(problems: string[]): void {
	if (!problems.length) return;
	for (const problem of problems) console.error(problem);
	rmSync(REPORT, { force: true }); // a Stryker run's own report covers one module, and no floor may count it
	process.exit(1);
}

/**
 * Stryker on one module, its values in a configuration file (no flag takes the command), its results in a fresh copy
 * of the stored file, so the partial results an interrupt saves over that copy never reach the stored file. A run
 * resumes by module, never from a leftover copy: one could hold results the stored file has since replaced.
 */
function stryker(top: string, { module, force }: Run, print: Record<string, string>): number {
	const { $schema: _, ...shared } = JSON.parse(readFileSync(join(top, "stryker.config.json"), "utf8"));
	const tmp = join(top, ".stryker-tmp");
	const name = stem(module).slice("bun/".length);
	const [config, work] = [join(tmp, `${name}.config.json`), join(tmp, `${name}.incremental.json`)];
	const stored = join(top, storedPath(module));
	mkdirSync(tmp, { recursive: true });
	rmSync(work, { force: true });
	if (!force && existsSync(stored)) writeFileSync(work, readFileSync(stored));
	const own = {
		mutate: [module],
		commandRunner: { command: `bun test ${stem(module)}` },
		incrementalFile: work,
		// Stryker's 5 stopped `bun/board-loop.ts`: its suite waits out real timers and took 313–330 s on a laptop at
		// load 2–4, in the sandbox as outside it; `bun/work.ts`'s, the next slowest, 161 s. 15 is 2.7 times the worst.
		dryRunTimeoutMinutes: 15,
	};
	writeFileSync(config, JSON.stringify({ ...shared, ...own }));
	const args = ["bunx", "--no-install", "stryker", "run", config, ...(force ? ["--force"] : [])];
	const run = Bun.spawnSync(args, { cwd: top, stdio: ["inherit", "inherit", "inherit"] });
	rmSync(config, { force: true });
	if (run.exitCode !== 0) return run.exitCode;
	mkdirSync(dirname(stored), { recursive: true });
	// Through a rename, so a kill mid-write leaves the old stored file rather than a truncated one.
	writeFileSync(`${work}.out`, `${JSON.stringify(trim(JSON.parse(readFileSync(work, "utf8")), print), null, "\t")}\n`);
	renameSync(`${work}.out`, stored);
	rmSync(work);
	return 0;
}

if (import.meta.main) {
	// First, so a run that stops anywhere leaves no report for the floor to count.
	rmSync(REPORT, { force: true });
	const args = process.argv.slice(2);
	const flags = { all: args.includes("--all"), force: args.includes("--force") };
	const named = args.filter((arg) => !arg.startsWith("--"));
	fail(
		args.filter((arg) => arg.startsWith("--") && !["--all", "--force"].includes(arg)).map((a) => `unknown option ${a}`),
	);
	const tree = load(root);
	const { runs, untested, problems } = plan(tree, flags);
	for (const module of untested) console.log(`not mutated, no test file matches it: ${module}`);
	const known = modules(tree.tracked);
	fail([
		...problems,
		...named.filter((m) => !known.includes(m)).map((m) => `${m} is not a tracked module`),
		...named.filter((m) => untested.includes(m)).map((m) => `${m} has no test file to judge its mutants`),
	]);
	const chosen = named.length ? runs.filter((run) => named.includes(run.module)) : runs;
	if (chosen.length && !Bun.which("node")) fail(["Stryker needs Node on PATH, and none was found"]);
	for (const run of chosen) {
		const code = stryker(root, run, fingerprint(run.module, tree));
		if (code !== 0) fail([`Stryker exited ${code} on ${run.module}`]);
	}
	fail(
		unsaved(root).map((path) => `${path} differs from HEAD's — commit it, and the same run passes without mutating`),
	);
	// A narrowed run left the other modules unchecked, so a report from it would be a count nobody verified.
	if (named.length) {
		console.log("named modules measured; no report written — run without names for the one the floor reads");
		process.exit(0);
	}
	mkdirSync(dirname(REPORT), { recursive: true });
	writeFileSync(REPORT, JSON.stringify(merge(Object.values(storedFiles(root)).map((text) => JSON.parse(text)))));
}
