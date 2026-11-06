#!/usr/bin/env bun
/**
 * The mutation step `openspec/specs/mutation-floor/spec.md` sets out. Each
 * module `stryker.config.json`'s `mutate` lists is mutated alone, each mutant
 * judged by the tests of `bun/<name>*.test.ts` that reached it in the dry run,
 * and its results stored as `mutation/<name>.json`; a
 * run mutates only the listed modules those results no longer cover, then
 * merges every stored file into the report `bun/mutation-floor.ts` counts.
 *
 * `bun bun/mutation-run.ts [--all] [--force] [bun/<name>.ts…]`: `--all` runs
 * every listed module, each incrementally, so an interrupted baseline resumes;
 * `--force` re-runs each one whole; named modules narrow the run.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, posix } from "node:path";
import { unlocal } from "./git-local.ts";
import { load, RUNNERS, storedFiles, type Tree, unsaved } from "./mutation-checkout.ts";
import { REPORT } from "./mutation-floor.ts";
import { merge, reusable, type Stored, trim } from "./mutation-stored.ts";
import { root } from "./root.ts";

/** `retest`: its test files changed, so the survivors no test covered are run again (see `reusable`). */
export type Run = { module: string; force: boolean; retest?: boolean };

/** Every tracked `bun/<name>.ts` that is neither a test nor a fixture. */
export const modules = (tracked: string[]) =>
	tracked.filter((path) => /^bun\/[^/]+\.ts$/.test(path) && !/\.(test|fixture)\.ts$/.test(path));

const stem = (module: string) => module.slice(0, -".ts".length);
const storedPath = (module: string) => `mutation/${stem(module).slice("bun/".length)}.json`;
const moduleOf = (stored: string) => `bun/${stored.slice("mutation/".length, -".json".length)}.ts`;

/** The test files `bun test bun/<name>` runs: those whose path begins with it. */
export const testsOf = (module: string, tracked: string[]) =>
	tracked.filter((path) => path.startsWith(stem(module)) && path.endsWith(".test.ts"));

const transpiler = new Bun.Transpiler({ loader: "ts" });

/**
 * What the module's results were measured against and Stryker cannot see change: by `HEAD`'s blob id, the fixtures
 * its tests import (one level, Bun's own parse, so an import a comment names is not one), `bunfig.toml` and what it
 * preloads; the versions of the runner and of Stryker, either of which can change a verdict; and, as text, the
 * Stryker options and limits it ran under, which decide what reads as `Timeout`. The test files themselves are out:
 * the stored file holds their sources, which Stryker diffs to re-run only the mutants a changed test reaches.
 */
export function fingerprint(module: string, tree: Tree): Record<string, string> {
	const fixtures = testsOf(module, tree.tracked).flatMap((test) =>
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
	const paths = [...new Set([...fixtures, ...shared])].sort();
	return {
		...Object.fromEntries(paths.map((path) => [path, tree.blobs[path] ?? "absent"])),
		...Object.fromEntries(RUNNERS.map((name) => [name, tree.versions[name] ?? "absent"])),
		"stryker options": JSON.stringify({ ...tree.options, ...limits }),
	};
}

/**
 * A mutant's limit is timeoutFactor × the dry run + timeoutMS, the dry run timed alone. Left at Stryker's 1.5 and
 * 5000 ms with a worker per core but one, 11 copies of a suite ran up to 5 times slower than that sample, and most
 * mutants read as Timeout; three times the sample plus 10 s is the margin. Stryker's 5-minute dry run stopped
 * `bun/board-loop.ts`, whose suite waits out real timers and took 313–330 s on a laptop at load 2–4; `bun/work.ts`'s,
 * the next slowest, 161 s. 15 is 2.7 times the worst.
 */
export const limits = { dryRunTimeoutMinutes: 15, timeoutFactor: 3, timeoutMS: 10000 };

/**
 * A third of the machine's cores, leaving room for the agents beside it: 4 on the 12-core laptop the baseline ran on.
 * Not in the fingerprint, unlike `limits`: it is the machine's, so a CI runner would otherwise re-run every module, and
 * it moves results only through load, which decision 8 measured as moving none on the list.
 */
const concurrency = Math.max(1, Math.floor(availableParallelism() / 3));

/**
 * The Stryker configuration one module runs under: the options `load` read, not the file again, so the fingerprint
 * names what every module ran under, plus the module, the test files `bun test bun/<name>` would match, and
 * `bun.timeout`, the runner's wall-clock limit on the dry run's `bun test` process, from the same limit Stryker's own
 * dry run has. A `dry` run stops after Stryker's initial test run.
 */
export const configuration = (tree: Tree, module: string, work: string, dry: boolean) => ({
	...tree.options,
	mutate: [module],
	bun: { testFiles: testsOf(module, tree.tracked).sort(), timeout: limits.dryRunTimeoutMinutes * 60_000 },
	incrementalFile: work,
	...limits,
	concurrency,
	dryRunOnly: dry,
});

const same = (a: Record<string, string> | undefined, b: Record<string, string>) =>
	a !== undefined && Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => a[k] === v);

/**
 * The modules to run, the ones the list leaves out, and what fails the run
 * before anything is mutated: a listed module nothing could judge, a stored
 * file nothing could still have written, one that is not a set of results or
 * holds another module's, and a module whose tests are not `HEAD`'s.
 */
export function plan(tree: Tree, flags = { all: false, force: false }) {
	const problems: string[] = [];
	const runs: Run[] = [];
	const skipped: string[] = [];
	const read: Record<string, Stored> = {};
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
		// A module's run mutates that module alone, so any other source is results the floor would count twice or unjudged.
		const own = moduleOf(path);
		for (const source of Object.keys(files))
			if (source !== own) problems.push(`${path} holds ${source}, not ${own} — delete the stored file`);
	}
	const tested = new Set(modules(tree.tracked).filter((module) => testsOf(module, tree.tracked).length));
	for (const module of tree.listed.filter((m) => !tested.has(m)))
		problems.push(`stryker.config.json's mutate lists ${module}, which is not a tracked module a test file matches`);
	for (const path of Object.keys(read)) {
		const module = moduleOf(path);
		if (!tree.tracked.includes(module)) problems.push(`${path}: ${module} is not tracked — delete the stored file`);
		else if (!tested.has(module))
			problems.push(`${path}: no test file matches ${stem(module)} — delete the stored file`);
		else if (!tree.listed.includes(module))
			problems.push(`${path}: ${module} is not listed in stryker.config.json's mutate — delete the stored file`);
	}
	for (const module of modules(tree.tracked)) {
		if (!tree.listed.includes(module)) {
			skipped.push(module);
			continue;
		}
		if (!tested.has(module)) continue; // listed and untested: a problem above, not a module the list leaves out
		const print = fingerprint(module, tree);
		const tests = testsOf(module, tree.tracked);
		// The module and its tests too: its results would otherwise describe a source `HEAD` does not hold.
		const dirty = [module, ...tests, ...Object.keys(print)].filter((path) => tree.dirty.includes(path));
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
		// A test edited, added or deleted: Stryker diffs the stored tests and re-runs only the mutants they reach.
		const had = Object.entries(stored.testFiles ?? {}).map(([path, file]) => [path, file.source ?? ""]);
		const retest = !same(
			Object.fromEntries(had),
			Object.fromEntries(tests.map((path) => [path, tree.text[path] ?? ""])),
		);
		if (force || flags.all || retest || stored.files[module]?.source !== tree.text[module])
			runs.push({ module, force, ...(retest && { retest }) });
	}
	// Stryker copies the working tree, not `HEAD`, so an edit or an untracked file anywhere judges mutants on code no
	// clone holds. The stored files are exempt: Stryker leaves `mutation/` out, and a resumed run finds its own there.
	const stray = tree.dirty.filter((path) => !path.startsWith("mutation/"));
	if (runs.length && stray.length)
		problems.push(`commit or remove ${stray.join(", ")} first — Stryker copies the working tree, not HEAD`);
	return { runs, skipped, problems };
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
 * resumes by module, never from a leftover copy: one could hold results the stored file has since replaced. A `dry`
 * run stops after Stryker's initial test run, which writes no incremental file, so it neither copies nor stores one.
 * Returns how Stryker failed, or `""` when it did not.
 */
function stryker(tree: Tree, top: string, job: Run, print: Record<string, string>, dry = false): string {
	const { module, force } = job;
	const tmp = join(top, ".stryker-tmp");
	const name = stem(module).slice("bun/".length);
	const [config, work] = [join(tmp, `${name}.config.json`), join(tmp, `${name}.incremental.json`)];
	const stored = join(top, storedPath(module));
	mkdirSync(tmp, { recursive: true });
	rmSync(work, { force: true });
	if (!force && !dry && existsSync(stored)) {
		const results: Stored = JSON.parse(readFileSync(stored, "utf8"));
		writeFileSync(work, JSON.stringify(job.retest ? reusable(results) : results));
	}
	writeFileSync(config, JSON.stringify(configuration(tree, module, work, dry)));
	const args = ["bunx", "--no-install", "stryker", "run", config, ...(force ? ["--force"] : [])];
	// Without git's local variables: an inherited `GIT_DIR` would point the sandbox's git, and every test's, at the
	// checkout, and the build step's own unset reaches none of the test processes Stryker starts.
	const env = unlocal(process.env);
	const run = Bun.spawnSync(args, { cwd: top, env, stdio: ["inherit", "inherit", "inherit"] });
	rmSync(config, { force: true });
	// A signal leaves no exit code, only its name.
	const failed =
		run.exitCode === 0
			? ""
			: run.exitCode === null
				? `was killed by ${run.signalCode ?? "a signal"}`
				: `exited ${run.exitCode}`;
	if (failed || dry) return failed;
	mkdirSync(dirname(stored), { recursive: true });
	// Through a rename, so a kill mid-write leaves the old stored file rather than a truncated one.
	writeFileSync(`${work}.out`, `${JSON.stringify(trim(JSON.parse(readFileSync(work, "utf8")), print), null, "\t")}\n`);
	renameSync(`${work}.out`, stored);
	rmSync(work);
	return "";
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
	const dry = (chosen.length > 1 ? chosen : []).map((run) => ({ ...run, failed: stryker(tree, root, run, {}, true) }));
	fail(dry.filter(({ failed }) => failed).map(({ module, failed }) => `Stryker's dry run ${failed} on ${module}`));
	for (const run of chosen) {
		const failed = stryker(tree, root, run, fingerprint(run.module, tree));
		if (failed) fail([`Stryker ${failed} on ${run.module}`]);
	}
	fail(
		unsaved(root).map((path) => `${path} differs from HEAD's — commit it, and the same run passes without mutating`),
	);
	// A narrowed run left the other modules unchecked, so a report from it would be a count nobody verified.
	if (named.length) {
		const done = chosen.length
			? `measured ${chosen.map((run) => run.module).join(" ")}`
			: "named modules already current, none mutated";
		console.log(`${done}; no report written — run without names for the one the floor reads`);
		process.exit(0);
	}
	mkdirSync(dirname(REPORT), { recursive: true });
	writeFileSync(REPORT, JSON.stringify(merge(Object.values(storedFiles(root)).map((text) => JSON.parse(text)))));
}
