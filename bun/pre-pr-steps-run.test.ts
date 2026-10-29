import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git, lines, repo, script } from "./diff-budget.fixture.ts";
import { checks, records, run } from "./pre-pr.fixture.ts";
import { CODE_REVIEW, PROJECT_CHECKS, TRIAGE, WARM, ZOMBIES } from "./pre-pr-steps.ts";

/**
 * The runner's last line, the steps the branch requires, spawned in a
 * fabricated repository. A case about the pull request's state gives the
 * repository an `origin` and puts a stub `gh` first on `PATH`; no other case
 * has an `origin`, so none reads GitHub. Bracketed numbers are the
 * proposal-stage `/zombies` ideas.
 */

afterAll(cleanup);

const DOCS = `PRE-PR steps: ${[PROJECT_CHECKS, TRIAGE, CODE_REVIEW].join(", ")}`;
const CODE = `PRE-PR steps: ${[PROJECT_CHECKS, ZOMBIES, TRIAGE, CODE_REVIEW].join(", ")}`;
const EVERY = `PRE-PR steps: ${[PROJECT_CHECKS, ZOMBIES, WARM, TRIAGE, CODE_REVIEW].join(", ")}`;
const ALONE = `PRE-PR steps: ${PROJECT_CHECKS}`;

const last = (out: string) => out.trimEnd().split("\n").at(-1);
const steps = (dir: string, env = {}, args: string[] = []) => last(run(dir, env, args).out);

/** `dir` with an `origin` on GitHub, and an environment whose `gh` answers `answer` with `code`. */
function github(dir: string, answer: unknown[], code = 0) {
	git(dir, "remote", "add", "origin", "https://github.com/o/r.git");
	const bin = emptyDir("pre-pr-steps-bin-");
	writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s' '${JSON.stringify(answer)}'\nexit ${code}\n`, { mode: 0o755 });
	return { PATH: `${bin}:${process.env.PATH}` };
}
/** A pull request of `feature` as the REST endpoint lists it. */
const pull = (state: string, extra: Record<string, unknown> = {}) => ({
	number: 1,
	state,
	merged_at: null,
	head: { sha: "s", repo: { id: 1 } },
	base: { repo: { id: 1 } },
	...extra,
});
const code = () => repo({}, { "a.ts": lines(3) });

describe("the last line", () => {
	// spec: pre-pr-runner/a-record-of-one-step-only
	test("the project checks' record carries the id the function names for them [16]", () => {
		expect(records(run(code()).state).map((r) => r.rule)).toContain(PROJECT_CHECKS);
	});

	test("it opens `PRE-PR steps:` [17]", () => {
		expect(steps(code())).toBe(CODE);
	});

	test("it opens a line of its own after checks whose output ends with no newline", () => {
		expect(steps(repo({ "package.json": checks("printf done") }, { "a.ts": lines(3) }))).toBe(CODE);
	});

	test("the exit status is the one the steps alone give [18]", () => {
		expect(run(code()).code).toBe(0);
		expect(run(repo({ "package.json": checks("false") }, { "a.ts": lines(3) })).code).toBe(1);
	});

	// spec: pre-pr-runner/a-source-file-moved-to-markdown
	test("a `.ts` file renamed to `.md` names `zombies` with `diff.renames=true` [22]", () => {
		const dir = repo({ "a.ts": lines(5) }, { "a.ts": null, "a.md": lines(5) });
		git(dir, "config", "diff.renames", "true");
		expect(steps(dir)).toBe(CODE);
	});

	// spec: pre-pr-runner/a-nested-manifest
	test("a `package.json` under a non-ASCII directory names `warm` with `core.quotePath=true`", () => {
		const dir = repo({}, { "über/package.json": "{}\n" });
		git(dir, "config", "core.quotePath", "true");
		expect(steps(dir)).toBe(EVERY);
	});

	test("a `.ts` file outside the subdirectory it starts in names `zombies` with `diff.relative=true`", () => {
		const dir = repo({}, { "a.ts": lines(3), "docs/a.md": lines(3) });
		git(dir, "config", "diff.relative", "true");
		expect(steps(join(dir, "docs"))).toBe(CODE);
	});

	// spec: pre-pr-runner/markdown-alone
	test("a documentation branch with no pull request names its steps [29]", () => {
		expect(steps(repo({}, { "README.md": lines(3) }))).toBe(DOCS);
	});
});

describe("the base", () => {
	/** A branch of one `.ts` file whose `origin/main` already holds it, `origin/HEAD` pointing there unless `unset`. */
	const tracked = (unset = false) => {
		const dir = code();
		git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
		if (!unset) git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
		return dir;
	};
	const base = (dir: string) => Bun.spawnSync(["bash", join(import.meta.dir, "diff-base.sh")], { cwd: dir }).stdout.toString();
	const budget = (dir: string) => Bun.spawnSync(["bash", script], { cwd: dir, env: { ...process.env, PR_BODY: "" } }).stdout.toString();

	test("`diff-base.sh` prints `origin/main` where `origin/HEAD` points there [19]", () => {
		expect(base(tracked())).toBe("origin/main\n");
	});

	test("`diff-base.sh` prints `main` where `origin/HEAD` is unset [20]", () => {
		expect(base(tracked(true))).toBe("main\n");
	});

	test("`diff-budget.sh` with no argument measures from that base [21]", () => {
		expect([budget(tracked()), budget(tracked(true))]).toEqual([
			expect.stringContaining("— 0 lines"),
			expect.stringContaining("— 3 lines"),
		]);
	});

	// spec: pre-pr-runner/no-base-passed
	test("with no base passed, the budget and the path read both use the resolved one", () => {
		const result = run(tracked());
		expect([result.out, last(result.out)]).toEqual([expect.stringContaining("— 0 lines"), DOCS]);
	});

	// spec: pre-pr-runner/a-base-passed
	test("a base `B` passed to the runner is the one the budget and the path read use [28]", () => {
		const dir = code();
		git(dir, "branch", "B");
		const result = run(dir, {}, ["B"]);
		expect([result.out, last(result.out)]).toEqual([expect.stringContaining("— 0 lines"), DOCS]);
	});

	// spec: pre-pr-runner/a-diff-it-cannot-read
	test("an unresolvable base names every step and exits 2 [27]", () => {
		const result = run(code(), {}, ["nope"]);
		expect([result.code, last(result.out)]).toEqual([2, EVERY]);
	});

	test("a base opening with `-` is no option: it names every step and writes no file", () => {
		const dir = code();
		const result = run(dir, {}, ["--output=x"]);
		const files = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: dir }).stdout.toString();
		expect([result.code, last(result.out), files]).toEqual([2, EVERY, ""]);
	});

	test("a repository with no commit names every step", () => {
		const dir = emptyDir("pre-pr-steps-bare-");
		git(dir, "init", "-q");
		expect(steps(dir)).toBe(EVERY);
	});
});

describe("the pull request's state", () => {
	// spec: pre-pr-runner/the-pull-request-cannot-be-read
	test("a `gh` that exits non-zero reads as not open [23]", () => {
		const dir = code();
		expect(steps(dir, github(dir, [pull("open")], 1))).toBe(CODE);
	});

	test("a detached `HEAD` reads as not open [24]", () => {
		const dir = code();
		const env = github(dir, [pull("open")]);
		git(dir, "checkout", "-q", "--detach");
		expect(steps(dir, env)).toBe(CODE);
	});

	// spec: pre-pr-runner/a-merged-pull-request
	test.each([
		["merged", { merged_at: "2026-10-27T00:00:00Z" }],
		["closed", {}],
	])("a %s pull request reads as not open [25]", (_, extra) => {
		const dir = code();
		expect(steps(dir, github(dir, [pull("closed", extra)]))).toBe(CODE);
	});

	test("a closed pull request beside an open one reads as open", () => {
		const dir = code();
		expect(steps(dir, github(dir, [pull("closed"), pull("open", { number: 2 })]))).toBe(ALONE);
	});

	test("an open draft reads as open [26]", () => {
		const dir = code();
		expect(steps(dir, github(dir, [pull("open", { draft: true })]))).toBe(ALONE);
	});

	// spec: pre-pr-runner/a-code-branch-with-its-pull-request-open
	test("a code branch with its pull request open names the project checks alone [30]", () => {
		const dir = code();
		expect(steps(dir, github(dir, [pull("open")]))).toBe(ALONE);
	});
});
