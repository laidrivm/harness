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
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { git } from "./turn-gate.fixture.ts";

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

/** A repository with one commit and no remote. */
function decoy(): string {
	const dir = scratch("git-env-decoy-");
	git(dir, "init", "-q", "-b", "main");
	git(dir, "commit", "-q", "--allow-empty", "-m", "decoy");
	return dir;
}

/** What a stray write would change: the decoy's config, HEAD, every ref and what its index stages. */
function snapshot(dir: string): string[] {
	return [
		readFileSync(join(dir, ".git", "config"), "utf8"),
		readFileSync(join(dir, ".git", "HEAD"), "utf8"),
		git(dir, "for-each-ref"),
		git(dir, "diff", "--cached", "--name-status"),
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

/** The tools `gates.sh` runs only where they are installed. */
const OPTIONAL = ["actionlint", "gitleaks"];

/**
 * Runs the hook from a directory holding only `.githooks/gates.sh` and
 * `bun/diff-base.sh`, with stubs first on `PATH` for every program the two
 * start — `bun`, `bunx`, and of `OPTIONAL` those `tools` names, exiting as
 * given — and the real `OPTIONAL` tools off it. Returns one call per stub
 * run: its name and arguments, then its environment. Each stub also writes a
 * config key as a fixture would: with no inherited `GIT_DIR` the ceiling stops
 * git finding any repository, so the write fails harmlessly; with one, it
 * lands in the decoy. `bash bun/diff-budget.sh` finds no script there, and the
 * hook's `|| true` absorbs it.
 */
function hook(env: Record<string, string>, tools: Record<string, number> = {}): { code: number; calls: string[][] } {
	const dir = scratch("git-env-hook-");
	const stub = join(dir, "stub");
	mkdirSync(stub);
	const record = join(dir, "record");
	writeFileSync(record, "");
	for (const [name, code] of Object.entries({ bun: 0, bunx: 0, ...tools })) {
		writeFileSync(
			join(stub, name),
			[
				"#!/bin/sh",
				`echo "${name} $*" >> "$RECORD"`,
				'env >> "$RECORD"',
				'echo --- >> "$RECORD"',
				`GIT_CEILING_DIRECTORIES=${dir} git config probe.written yes 2>/dev/null || true`,
				`exit ${code}`,
				"",
			].join("\n"),
		);
		chmodSync(join(stub, name), 0o755);
	}
	const work = join(dir, "work");
	for (const path of [".githooks/gates.sh", "bun/diff-base.sh"]) {
		mkdirSync(dirname(join(work, path)), { recursive: true });
		if (existsSync(join(ROOT, path))) copyFileSync(join(ROOT, path), join(work, path));
	}
	const path = (process.env.PATH ?? "").split(":").filter((d) => !OPTIONAL.some((t) => existsSync(join(d, t))));
	const run = Bun.spawnSync(["bash", HOOK], {
		cwd: work,
		// Not the runner's base, should the suite run under one: `env` alone sets it.
		env: { ...process.env, HARNESS_BASE: undefined, PATH: [stub, ...path].join(":"), RECORD: record, ...env },
		timeout: 20_000,
	});
	const calls = readFileSync(record, "utf8")
		.split("---\n")
		.filter((block) => block !== "")
		.map((block) => block.split("\n"));
	return { code: run.exitCode ?? -1, calls };
}

/** The first line of each call: the stub's name and its arguments, less the space a call with none leaves. */
const started = (calls: string[][]) => calls.map(([line = ""]) => line.trimEnd());

/** The names among `names` that some recorded call still carried. */
function carried(calls: string[][], names: string[]): string[] {
	return names.filter((name) => calls.some((lines) => lines.some((l) => l.startsWith(`${name}=`))));
}

/** What the hook starts with no optional tool installed: the draft check, then `gates.sh`'s gates in order. */
const GATES = [
	"bun bun/push-draft.ts",
	"bun bun/check-yaml.ts",
	"bun bun/no-suppressions.ts",
	"bunx --no-install biome ci .",
	"bunx --no-install tsc --noEmit",
	"bun test",
];
const BUNS = GATES.length;

describe("the pre-push hook", () => {
	// spec: commit-gates/a-tool-the-machine-does-not-have
	test("with no repository variable set and no optional tool it runs the draft check and the gates and exits 0 [1]", () => {
		const { code, calls } = hook({});
		expect([code, started(calls)]).toEqual([0, GATES]);
	});

	// spec: commit-gates/a-tool-the-machine-has-reporting-a-finding commit-gates/a-gate-the-runner-s-checks-run-too
	test.each(["gitleaks", "actionlint", "bunx"])(
		"a %s that reports a finding fails the hook before the suite",
		(tool) => {
			const { code, calls } = hook({}, { [tool]: 1 });
			expect([code === 0, started(calls).includes("bun test")]).toEqual([false, false]);
		},
	);

	// spec: commit-gates/a-secret-that-is-already-in-the-base-branch
	test.each([
		["no HARNESS_BASE", {}, "main"],
		["HARNESS_BASE set", { HARNESS_BASE: "origin/feat/x" }, "origin/feat/x"],
	])("with %s, gitleaks scans from the base diff-base.sh prints to HEAD", (_, env, base) => {
		const { code, calls } = hook(env, { gitleaks: 0, actionlint: 0 });
		const scan = started(calls).filter((line) => line.startsWith("gitleaks ") || line.startsWith("actionlint"));
		// The suite runs without it: its cases read `diff-base.sh` with no base set.
		const suite = calls.filter(([line]) => line?.trimEnd() === "bun test");
		expect([code, scan, suite.length, carried(suite, ["HARNESS_BASE"])]).toEqual([
			0,
			["actionlint", `gitleaks git . --log-opts=${base}..HEAD -v --redact --no-banner`],
			1,
			[],
		]);
	});

	// spec: commit-gates/a-push-from-a-worktree
	test("a linked worktree's GIT_DIR reaches no command it starts [2]", () => {
		const repo = decoy();
		const tree = join(scratch("git-env-tree-"), "wt");
		git(repo, "worktree", "add", "-q", tree);
		const { calls } = hook({ GIT_DIR: join(repo, ".git", "worktrees", "wt") });
		expect([calls.length, carried(calls, ["GIT_DIR"])]).toEqual([BUNS, []]);
	});

	// spec: commit-gates/every-variable-on-git-s-list
	test("none of a decoy's variables reaches a command it starts [3]", () => {
		const env = decoyEnv(decoy());
		const { calls } = hook(env);
		expect([calls.length, carried(calls, Object.keys(env))]).toEqual([BUNS, []]);
	});

	// spec: commit-gates/every-variable-on-git-s-list
	test("GIT_PREFIX set empty reaches no command it starts [4]", () => {
		const { calls } = hook({ GIT_PREFIX: "" });
		expect([calls.length, carried(calls, ["GIT_PREFIX"])]).toEqual([BUNS, []]);
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
		expect([code === 0, err.includes("GIT_DIR"), err.includes("GIT_INDEX_FILE")]).toEqual([false, true, true]);
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
		expect([code === 0, err.includes("git rev-parse --local-env-vars"), RAN.test(err)]).toEqual([false, true, false]);
	}, 90_000);

	/** A `PATH` holding only a `git` that runs `body`. */
	const stubGit = (body: string): string => {
		const dir = scratch("git-env-stubgit-");
		writeFileSync(join(dir, "git"), `#!/bin/sh\n${body}\n`);
		chmodSync(join(dir, "git"), 0o755);
		return dir;
	};

	// spec: commit-gates/the-list-cannot-be-read
	test("a git that fails the read refuses, naming its exit code", () => {
		const { code, err } = suite({ PATH: stubGit("exit 3") });
		expect([code === 0, err.includes("exited 3"), RAN.test(err)]).toEqual([false, true, false]);
	}, 90_000);

	// spec: commit-gates/the-list-cannot-be-read
	test("a read that prints no variable refuses rather than passing on an empty list", () => {
		const { code, err } = suite({ PATH: stubGit("exit 0") });
		expect([code === 0, err.includes("printed no variable"), RAN.test(err)]).toEqual([false, true, false]);
	}, 90_000);
});
