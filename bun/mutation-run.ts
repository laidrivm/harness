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
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { load, storedFiles, type Tree, unsaved } from "./mutation-checkout.ts";
import { REPORT } from "./mutation-floor.ts";
import { root } from "./root.ts";

export type Mutant = { id: string; mutatorName: string; location: unknown; replacement?: string; status: string };
export type Stored = {
	schemaVersion: string;
	files: Record<string, { source: string; mutants: Mutant[] }>;
	fingerprint: Record<string, string>;
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

/**
 * What Stryker runs per mutant. Its sandbox sits under the checkout and holds no `.git`, so git found the checkout from
 * it, and a mutant that ran `sync.ts`'s main block in a test wrote the checkout's `harness/` and `bunfig.toml`. A
 * repository of the sandbox's own, made by the dry run before any worker starts, stops git at the sandbox.
 */
export const command = (module: string) =>
	`{ test -d .git || { git init -q && git add -A; }; } && bun test ${stem(module)}`;

const same = (a: Record<string, string> | undefined, b: Record<string, string>) =>
	a !== undefined && Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => a[k] === v);

/**
 * The modules to run, the ones the list leaves out, and what fails the run
 * before anything is mutated: a listed module nothing could judge, a stored
 * file nothing could still have written, one that is not a set of results, and
 * a module whose tests are not `HEAD`'s.
 */
export function plan(tree: Tree, flags = { all: false, force: false }) {
	const problems: string[] = [];
	const runs: Run[] = [];
	const skipped: string[] = [];
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
	for (const module of tree.listed.filter((m) => !tested.has(m)))
		problems.push(`stryker.config.json's mutate lists ${module}, which is not a tracked module a test file matches`);
	for (const path of Object.keys(read)) {
		const module = `bun/${path.slice("mutation/".length, -".json".length)}.ts`;
		if (!tree.tracked.includes(module)) problems.push(`${path}: ${module} is not tracked — delete the stored file`);
		else if (!tested.has(module))
			problems.push(`${path}: no test file matches ${stem(module)} — delete the stored file`);
		else if (!tree.listed.includes(module))
			problems.push(`${path}: ${module} is not listed in stryker.config.json's mutate — delete the stored file`);
	}
	for (const module of modules(tree.tracked)) {
		if (!tested.has(module) || !tree.listed.includes(module)) {
			skipped.push(module);
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
	return { runs, skipped, problems };
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

function fail(problems: string[]): void {
	if (!problems.length) return;
	for (const problem of problems) console.error(problem);
	rmSync(REPORT, { force: true }); // a Stryker run's own report covers one module, and no floor may count it
	process.exit(1);
}

/**
 * Stryker on one module, its values in a configuration file (no flag takes the command), its results in a fresh copy
 * of the stored file, so the partial results an interrupt saves over that copy never reach the stored file. A run
 * resumes by module, never from a leftover copy: one could hold results the stored file has since replaced. A `dry`
 * run stops after Stryker's initial test run, which writes no incremental file, so it neither copies nor stores one.
 */
function stryker(top: string, { module, force }: Run, print: Record<string, string>, dry = false): number {
	const { $schema: _, ...shared } = JSON.parse(readFileSync(join(top, "stryker.config.json"), "utf8"));
	const tmp = join(top, ".stryker-tmp");
	const name = stem(module).slice("bun/".length);
	const [config, work] = [join(tmp, `${name}.config.json`), join(tmp, `${name}.incremental.json`)];
	const stored = join(top, storedPath(module));
	mkdirSync(tmp, { recursive: true });
	rmSync(work, { force: true });
	if (!force && !dry && existsSync(stored)) writeFileSync(work, readFileSync(stored));
	const own = {
		mutate: [module],
		commandRunner: { command: command(module) },
		incrementalFile: work,
		// Stryker's 5 stopped `bun/board-loop.ts`: its suite waits out real timers and took 313–330 s on a laptop at
		// load 2–4, in the sandbox as outside it; `bun/work.ts`'s, the next slowest, 161 s. 15 is 2.7 times the worst.
		dryRunTimeoutMinutes: 15,
		// A mutant's limit is timeoutFactor × the dry run + timeoutMS, the dry run timed alone. Left at Stryker's 1.5 and
		// 5000 ms with a worker per core but one, 11 copies of a suite ran up to 5 times slower than that sample, and most
		// mutants read as Timeout. A third of this laptop's 12 cores, and three times the sample plus 10 s, is the margin.
		concurrency: 4,
		timeoutFactor: 3,
		timeoutMS: 10000,
		dryRunOnly: dry,
	};
	writeFileSync(config, JSON.stringify({ ...shared, ...own }));
	const args = ["bunx", "--no-install", "stryker", "run", config, ...(force ? ["--force"] : [])];
	const run = Bun.spawnSync(args, { cwd: top, stdio: ["inherit", "inherit", "inherit"] });
	rmSync(config, { force: true });
	if (run.exitCode !== 0 || dry) return run.exitCode;
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
	const { runs, skipped, problems } = plan(tree, flags);
	if (skipped.length) console.log(`not mutated, not listed in stryker.config.json's mutate: ${skipped.join(" ")}`);
	const known = modules(tree.tracked);
	fail([
		...problems,
		...named.filter((m) => !known.includes(m)).map((m) => `${m} is not a tracked module`),
		...named.filter((m) => skipped.includes(m)).map((m) => `${m} is not listed in stryker.config.json's mutate`),
	]);
	const chosen = named.length ? runs.filter((run) => named.includes(run.module)) : runs;
	if (chosen.length && !Bun.which("node")) fail(["Stryker needs Node on PATH, and none was found"]);
	// Only for several: one module's own run starts with the same dry run, so a sweep would only repeat it.
	const dry = (chosen.length > 1 ? chosen : []).map((run) => ({ ...run, code: stryker(root, run, {}, true) }));
	fail(dry.filter(({ code }) => code !== 0).map(({ module, code }) => `Stryker's dry run exited ${code} on ${module}`));
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
