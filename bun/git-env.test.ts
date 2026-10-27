/**
 * The two halves that keep git's repository variables — the ones
 * `git rev-parse --local-env-vars` names — away from the suite's fixtures:
 * the pre-push hook drops them, and the suite, started at the root, refuses
 * to run while any is set (`bunfig.toml` preloads `git-env-guard.ts`).
 *
 * Every decoy here has no remote, so a regression has nowhere to push.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const HOOK = join(ROOT, ".githooks", "pre-push");
const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	made.push(dir);
	return dir;
}

function git(dir: string, ...args: string[]): string {
	const run = Bun.spawnSync(
		["git", "-c", "user.name=decoy", "-c", "user.email=decoy@example.invalid", ...args],
		{ cwd: dir, timeout: 10_000 },
	);
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	return run.stdout.toString();
}

/** A repository with one commit and no remote. */
function decoy(): string {
	const dir = scratch("git-env-decoy-");
	git(dir, "init", "-q", "-b", "main");
	git(dir, "commit", "-q", "--allow-empty", "-m", "decoy");
	return dir;
}

/** What a stray write would change: the decoy's config, HEAD and every ref. */
function snapshot(dir: string): string[] {
	return [
		readFileSync(join(dir, ".git", "config"), "utf8"),
		readFileSync(join(dir, ".git", "HEAD"), "utf8"),
		git(dir, "for-each-ref"),
	];
}

/** Git's variables set to `dir`'s repository, as a hook run there would carry them. */
function decoyEnv(dir: string): Record<string, string> {
	return {
		GIT_DIR: join(dir, ".git"),
		GIT_INDEX_FILE: join(dir, ".git", "index"),
		GIT_CONFIG_COUNT: "0",
		GIT_OBJECT_DIRECTORY: join(dir, ".git", "objects"),
	};
}

/**
 * Runs the hook from an empty directory with a stub `bun` first on `PATH`
 * that records its environment, and returns one environment per call the
 * stub received. `bash bun/diff-budget.sh` finds no script there, and the
 * hook's `|| true` absorbs it.
 */
function hook(env: Record<string, string>): { code: number; calls: string[][] } {
	const dir = scratch("git-env-hook-");
	const stub = join(dir, "stub");
	mkdirSync(stub);
	const record = join(dir, "record");
	writeFileSync(record, "");
	writeFileSync(join(stub, "bun"), '#!/bin/sh\nenv >> "$RECORD"\necho --- >> "$RECORD"\n');
	chmodSync(join(stub, "bun"), 0o755);
	const work = join(dir, "work");
	mkdirSync(work);
	const run = Bun.spawnSync(["bash", HOOK], {
		cwd: work,
		env: { ...process.env, PATH: `${stub}:${process.env.PATH}`, RECORD: record, ...env },
		timeout: 20_000,
	});
	const calls = readFileSync(record, "utf8")
		.split("---\n")
		.filter((block) => block !== "")
		.map((block) => block.split("\n"));
	return { code: run.exitCode ?? -1, calls };
}

/** The names among `names` that some recorded call still carried. */
function carried(calls: string[][], names: string[]): string[] {
	return names.filter((name) => calls.some((lines) => lines.some((l) => l.startsWith(`${name}=`))));
}

describe("the pre-push hook", () => {
	// spec: commit-gates/a-push-from-a-worktree
	test("with no repository variable set it runs the suite and exits 0 [1]", () => {
		const { code, calls } = hook({});
		expect([code, calls.length]).toEqual([0, 1]);
	});

	// spec: commit-gates/a-push-from-a-worktree
	test("a linked worktree's GIT_DIR reaches no command it starts [2]", () => {
		const repo = decoy();
		const tree = join(scratch("git-env-tree-"), "wt");
		git(repo, "worktree", "add", "-q", tree);
		const { calls } = hook({ GIT_DIR: join(repo, ".git", "worktrees", "wt") });
		expect([calls.length, carried(calls, ["GIT_DIR"])]).toEqual([1, []]);
	});

	// spec: commit-gates/every-variable-on-git-s-list
	test("none of a decoy's variables reaches a command it starts [3]", () => {
		const env = decoyEnv(decoy());
		const { calls } = hook(env);
		expect([calls.length, carried(calls, Object.keys(env))]).toEqual([1, []]);
	});

	// spec: commit-gates/every-variable-on-git-s-list
	test("GIT_PREFIX set empty reaches no command it starts [4]", () => {
		const { calls } = hook({ GIT_PREFIX: "" });
		expect([calls.length, carried(calls, ["GIT_PREFIX"])]).toEqual([1, []]);
	});

	// spec: commit-gates/every-variable-on-git-s-list
	test("the decoy's refs and config are as they were [5]", () => {
		const dir = decoy();
		const before = snapshot(dir);
		hook(decoyEnv(dir));
		expect(snapshot(dir)).toEqual(before);
	});
});

/**
 * Starts `bun test bun/tracked.test.ts` from the repository's root, where
 * `bunfig.toml` is read, with `env` over this process's environment.
 */
function suite(env: Record<string, string>): { code: number; err: string } {
	const run = Bun.spawnSync([process.execPath, "test", "bun/tracked.test.ts"], {
		cwd: ROOT,
		env: { ...process.env, ...env },
		timeout: 60_000,
	});
	return { code: run.exitCode ?? -1, err: run.stderr.toString() };
}

/** bun's summary line, printed only once a test file has run. */
const RAN = /Ran \d+ tests?/;

describe("the suite under git's repository variables", () => {
	// spec: commit-gates/a-suite-started-under-a-decoy-repository
	test("GIT_DIR naming a decoy refuses, naming GIT_DIR [6]", () => {
		const { code, err } = suite({ GIT_DIR: join(decoy(), ".git") });
		expect([code === 0, err.includes("GIT_DIR")]).toEqual([false, true]);
	}, 90_000);

	// spec: commit-gates/a-suite-started-under-a-decoy-repository
	test("that run runs no test and leaves the decoy as it was [7]", () => {
		const dir = decoy();
		const before = snapshot(dir);
		const { err } = suite({ GIT_DIR: join(dir, ".git") });
		expect([RAN.test(err), snapshot(dir)]).toEqual([false, before]);
	}, 90_000);

	// spec: commit-gates/a-suite-started-under-a-decoy-repository
	test("GIT_DIR and GIT_INDEX_FILE together are both named [8]", () => {
		const dir = decoy();
		const { code, err } = suite({
			GIT_DIR: join(dir, ".git"),
			GIT_INDEX_FILE: join(dir, ".git", "index"),
		});
		expect([code === 0, err.includes("GIT_DIR"), err.includes("GIT_INDEX_FILE")]).toEqual([
			false,
			true,
			true,
		]);
	}, 90_000);

	// spec: commit-gates/a-variable-set-but-empty
	test("GIT_PREFIX set empty refuses, naming it [9]", () => {
		const { code, err } = suite({ GIT_PREFIX: "" });
		expect([code === 0, err.includes("GIT_PREFIX"), RAN.test(err)]).toEqual([false, true, false]);
	}, 90_000);

	// spec: commit-gates/a-git-variable-outside-the-list
	test("GIT_EDITOR alone runs the file and exits 0 [10]", () => {
		const { code, err } = suite({ GIT_EDITOR: "true" });
		expect([code, RAN.test(err)]).toEqual([0, true]);
	}, 90_000);

	// spec: commit-gates/the-list-cannot-be-read
	test("a PATH with no git refuses, naming the failed read [11]", () => {
		const { code, err } = suite({ PATH: scratch("git-env-nopath-") });
		expect([code === 0, err.includes("git rev-parse --local-env-vars"), RAN.test(err)]).toEqual([
			false,
			true,
			false,
		]);
	}, 90_000);
});
