import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git, lines, repo } from "./diff-budget.fixture.ts";
import { checks, records, run } from "./pre-pr.fixture.ts";
import { CODE_REVIEW, PROJECT_CHECKS, TRIAGE, WARM, ZOMBIES } from "./pre-pr-steps.ts";

/**
 * `pre-pr.ts --steps`: the runner's last line alone, from the same base and
 * pull request state as a full run, with no step run and no record written.
 * The project checks are a command that leaves a file, so a case sees that
 * they never started.
 */

afterAll(cleanup);

const DOCS = `PRE-PR steps: ${[PROJECT_CHECKS, TRIAGE, CODE_REVIEW].join(", ")}`;
const CODE = `PRE-PR steps: ${[PROJECT_CHECKS, ZOMBIES, TRIAGE, CODE_REVIEW].join(", ")}`;
const ALONE = `PRE-PR steps: ${PROJECT_CHECKS}`;
const EVERY = `PRE-PR steps: ${[PROJECT_CHECKS, ZOMBIES, WARM, TRIAGE, CODE_REVIEW].join(", ")}`;

/**
 * A code branch, `B` a branch at its head, and the file its project checks
 * would leave outside the tree, so a run of them would still be recorded.
 */
function code() {
	const mark = join(emptyDir("pre-pr-steps-list-mark-"), "ran");
	const dir = repo({ "package.json": checks(`touch '${mark}'`) }, { "a.ts": lines(3) });
	git(dir, "branch", "B");
	return { dir, mark };
}

describe("--steps", () => {
	// spec: pre-pr-runner/the-list-alone
	test("on a code branch it prints the one line, runs no step, and exits 0", () => {
		const { dir, mark } = code();
		const result = run(dir, {}, ["--steps", "main"]);
		expect([result.code, result.out, result.err, existsSync(mark)]).toEqual([0, `${CODE}\n`, "", false]);
	});

	// spec: pre-pr-runner/the-list-against-a-base
	test.each([
		["--steps B", ["--steps", "B"]],
		["B --steps", ["B", "--steps"]],
	])("%s reads the diff against B", (_, args) => {
		expect(run(code().dir, {}, args).out).toBe(`${DOCS}\n`);
	});

	// spec: pre-pr-runner/the-list-against-a-base
	test("alone, it reads the diff against the base diff-base.sh prints", () => {
		const { dir } = code();
		git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
		git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
		expect(run(dir, {}, ["--steps"]).out).toBe(`${DOCS}\n`);
	});

	// spec: pre-pr-runner/the-list-writes-no-record
	test("on a clean tree the ledger gains no line, where a full run gains two", () => {
		const { dir } = code();
		expect([records(run(dir, {}, ["--steps"]).state), records(run(dir).state).length]).toEqual([[], 2]);
	});

	test("a base it cannot resolve names every step and still exits 0", () => {
		const result = run(code().dir, {}, ["--steps", "nope"]);
		expect([result.code, result.out]).toEqual([0, `${EVERY}\n`]);
	});

	test("a dirty tree still prints the list and exits 0", () => {
		const { dir } = code();
		writeFileSync(join(dir, "a.ts"), lines(4));
		const result = run(dir, {}, ["--steps", "main"]);
		expect([result.code, result.out]).toEqual([0, `${CODE}\n`]);
	});

	test("with the pull request open the list is the project checks alone", () => {
		const { dir } = code();
		git(dir, "remote", "add", "origin", "https://github.com/o/r.git");
		const bin = emptyDir("pre-pr-steps-list-bin-");
		const open = [
			{ number: 1, state: "open", merged_at: null, head: { sha: "s", repo: { id: 1 } }, base: { repo: { id: 1 } } },
		];
		writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s' '${JSON.stringify(open)}'\n`, { mode: 0o755 });
		expect(run(dir, { PATH: `${bin}:${process.env.PATH}` }, ["--steps", "main"]).out).toBe(`${ALONE}\n`);
	});
});
