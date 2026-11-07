/**
 * What `bun/mutation-run.ts` reads of a checkout, apart from the plan that rules on it so both stay under the cap.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tracked as sweep } from "./tracked.ts";

/**
 * What a plan reads of a checkout: every tracked path, `HEAD`'s blob id of each, the working-tree text of each
 * `bun/*.ts` and `bunfig.toml` and of each `mutation/<name>.json`, the paths `git status` lists, and the modules
 * `stryker.config.json`'s `mutate` lists — the one list of what is mutated, which the floor counts through the stored
 * files it allows — and the file's other options, which every module runs under.
 */
export type Tree = {
	tracked: string[];
	blobs: Record<string, string>;
	text: Record<string, string>;
	stored: Record<string, string>;
	dirty: string[];
	listed: string[];
	options: Record<string, unknown>;
	/** The versions `package.json` pins of the runner and of Stryker, so a scratch clone without `node_modules` reads them. */
	versions: Record<string, string>;
};

/** The packages whose version decides a mutant's verdict, and so re-runs every module when it moves. */
export const RUNNERS = ["@hughescr/stryker-bun-runner", "@stryker-mutator/core"];

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

export function load(top: string): Tree {
	const { paths: tracked } = sweep(top);
	const blobs: Record<string, string> = {};
	for (const entry of git(top, "ls-tree", "-r", "-z", "--full-tree", "HEAD").split("\0").filter(Boolean)) {
		const [meta = "", path = ""] = entry.split("\t");
		blobs[path] = meta.split(" ")[2] ?? "";
	}
	const text: Record<string, string> = {};
	for (const path of tracked.filter((p) => p === "bunfig.toml" || /^bun\/[^/]+\.ts$/.test(p)))
		if (existsSync(join(top, path))) text[path] = readFileSync(join(top, path), "utf8");
	const { $schema: _, mutate, ...options } = JSON.parse(readFileSync(join(top, "stryker.config.json"), "utf8"));
	if (!Array.isArray(mutate) || !mutate.every((m) => typeof m === "string"))
		throw new Error("stryker.config.json's mutate must list the modules the run mutates");
	const manifest = join(top, "package.json");
	const pins = existsSync(manifest) ? (JSON.parse(readFileSync(manifest, "utf8")).devDependencies ?? {}) : {};
	const versions = Object.fromEntries(RUNNERS.filter((name) => name in pins).map((name) => [name, String(pins[name])]));
	return { tracked, blobs, text, stored: storedFiles(top), dirty: changed(top), listed: mutate, options, versions };
}

/** The text of each `mutation/<name>.json` under `top`, by its path. */
export function storedFiles(top: string): Record<string, string> {
	const dir = join(top, "mutation");
	const stored: Record<string, string> = {};
	for (const name of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")) : [])
		stored[`mutation/${name}`] = readFileSync(join(dir, name), "utf8");
	return stored;
}
