import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git, put, repo } from "./diff-budget.fixture.ts";
import { head, ledger } from "./pre-pr.fixture.ts";

/**
 * The pre-push hook's skip, `bun bun/push-proven.ts`, spawned as the hook
 * spawns it: in a fabricated repository, the ref-update records on standard
 * input, and `XDG_STATE_HOME` a directory of the case's own holding the
 * ledger lines it names. Exit 0 is the skip; any other runs the gates.
 */

afterAll(cleanup);

const script = join(import.meta.dir, "push-proven.ts");
const ZERO = "0".repeat(40);
const OLD = "b".repeat(40);

/** One ref-update record, pushing `sha` to `remote`. */
const update = (sha: string, remote = "refs/heads/feature") => `refs/heads/feature ${sha} ${remote} ${OLD}\n`;
const deletion = (remote: string) => `(delete) ${ZERO} ${remote} ${OLD}\n`;

/** A pre-PR runner record as `pre-pr.ts` writes it, from the checkout at `top`. */
const record = (top: string, commit: string, decision = "pass", rule = "project-checks", gate = "pre-pr") =>
	JSON.stringify({ at: "2026-11-02T00:00:00.000Z", gate, decision, rule, project: top, session: null, commit });

type Case = { dir: string; stdin: string; lines?: string[]; state?: string };

function push(c: Case) {
	const state = c.state ?? emptyDir("push-proven-state-");
	if (c.lines) {
		mkdirSync(join(state, "harness"), { recursive: true });
		writeFileSync(ledger(state), `${c.lines.join("\n")}\n`);
	}
	const run = Bun.spawnSync(["bun", script], {
		cwd: c.dir,
		stdin: Buffer.from(c.stdin),
		env: { PATH: process.env.PATH, HOME: emptyDir("push-proven-home-"), XDG_STATE_HOME: state },
	});
	return { code: run.exitCode, err: run.stderr.toString(), state };
}

/** A fabricated repository on `feature`, its real top level, `HEAD`, and `main`'s commit below it. */
function checkout() {
	const dir = repo({}, { "a.txt": "one\n" });
	return { dir, top: realpathSync(dir), sha: head(dir), main: rev(dir, "main") };
}
const rev = (dir: string, name: string) =>
	Bun.spawnSync(["git", "rev-parse", name], { cwd: dir }).stdout.toString().trim();

const skipped = (sha: string) =>
	expect.stringContaining(`gates skipped — a passing pre-PR record of project-checks names ${sha.slice(0, 7)}`);
const running = expect.stringContaining("pre-push: running the gates — ");

describe("a push the runner proved", () => {
	// spec: commit-gates/a-head-the-runner-passed
	// spec: gate-ledger/a-push-of-a-commit-the-runner-passed
	test("a passing project-checks record of the pushed sha here skips, writing nothing", () => {
		const { dir, top, sha } = checkout();
		const run = push({ dir, stdin: update(sha), lines: [record(top, sha)] });
		expect([run.code, run.err]).toEqual([0, skipped(sha)]);
		expect(readFileSync(ledger(run.state), "utf8").split("\n").filter(Boolean)).toHaveLength(1);
	});

	test("two proven records skip, the line naming both", () => {
		const { dir, top, sha, main } = checkout();
		const lines = [record(top, sha), record(top, main)];
		const run = push({ dir, stdin: update(sha) + update(main, "refs/heads/main"), lines });
		expect([run.code, run.err]).toEqual([0, skipped(sha)]);
		expect(run.err).toContain(main.slice(0, 7));
	});

	test("a proven sha beside a branch deletion skips", () => {
		const { dir, top, sha } = checkout();
		const run = push({ dir, stdin: update(sha) + deletion("refs/heads/old"), lines: [record(top, sha)] });
		expect(run.code).toBe(0);
	});

	// spec: commit-gates/a-push-of-a-commit-other-than-head
	test("a proven sha other than HEAD skips", () => {
		const { dir, top, main } = checkout();
		const run = push({ dir, stdin: update(main), lines: [record(top, main)] });
		expect([run.code, run.err]).toEqual([0, skipped(main)]);
	});

	// spec: commit-gates/a-torn-line-beside-a-pass
	test("a proven sha beside a torn ledger line skips", () => {
		const { dir, top, sha } = checkout();
		const run = push({ dir, stdin: update(sha), lines: ['{"gate":"pre-pr","deci', record(top, sha)] });
		expect(run.code).toBe(0);
	});

	// spec: commit-gates/a-dirty-tree-over-a-proven-head
	test("a proven HEAD with a tracked file edited skips", () => {
		const { dir, top, sha } = checkout();
		put(dir, { "a.txt": "edited\n" });
		const run = push({ dir, stdin: update(sha), lines: [record(top, sha)] });
		expect(run.code).toBe(0);
	});
});

describe("a push the gates judge", () => {
	// spec: commit-gates/a-head-the-runner-did-not-pass
	test("no record exits 1, naming the sha", () => {
		const { dir, sha } = checkout();
		const run = push({ dir, stdin: update(sha), lines: [] });
		expect([run.code, run.err]).toEqual([1, running]);
		expect(run.err).toContain(sha.slice(0, 7));
	});

	// spec: commit-gates/another-step-s-pass-at-the-commit
	test("a passing diff-budget, a failing project-checks and a draft-check block exit 1", () => {
		const { dir, top, sha } = checkout();
		const lines = [
			record(top, sha, "pass", "diff-budget"),
			record(top, sha, "fail"),
			record(top, sha, "block", "ready", "push-draft"),
		];
		expect(push({ dir, stdin: update(sha), lines }).code).toBe(1);
	});

	// spec: commit-gates/a-pass-and-a-later-failure-of-one-commit
	test.each([
		["a pass, then a fail", ["pass", "fail"]],
		["a fail, then a pass", ["fail", "pass"]],
		["a pass and an error", ["pass", "error"]],
	])("%s exits 1", (_, decisions) => {
		const { dir, top, sha } = checkout();
		const run = push({ dir, stdin: update(sha), lines: decisions.map((d) => record(top, sha, d)) });
		expect([run.code, run.err]).toEqual([1, running]);
	});

	// spec: commit-gates/two-refs-one-unproven
	test("two records, one proven, exit 1", () => {
		const { dir, top, sha, main } = checkout();
		const run = push({ dir, stdin: update(sha) + update(main, "refs/heads/main"), lines: [record(top, sha)] });
		expect([run.code, run.err]).toEqual([1, running]);
		expect(run.err).toContain(main.slice(0, 7));
	});

	// spec: commit-gates/a-push-that-only-deletes
	test.each([
		["only a deletion", deletion("refs/heads/old")],
		["empty input", ""],
		["one blank line", "\n"],
	])("%s exits 1", (_, stdin) => {
		const { dir, top, sha } = checkout();
		expect(push({ dir, stdin, lines: [record(top, sha)] }).code).toBe(1);
	});

	// spec: commit-gates/a-tag
	test("an annotated tag exits 1", () => {
		const { dir, top, sha } = checkout();
		git(dir, "tag", "-a", "v1", "-m", "v1");
		const object = rev(dir, "v1");
		const stdin = `refs/tags/v1 ${object} refs/tags/v1 ${ZERO}\n`;
		expect(push({ dir, stdin, lines: [record(top, sha), record(top, object)] }).code).toBe(1);
	});

	// spec: commit-gates/a-tag
	test("a lightweight tag whose sha is a proven commit exits 1", () => {
		const { dir, top, sha } = checkout();
		const run = push({ dir, stdin: `refs/tags/v1 ${sha} refs/tags/v1 ${ZERO}\n`, lines: [record(top, sha)] });
		expect([run.code, run.err]).toEqual([1, running]);
	});

	// spec: commit-gates/a-tag
	test("a proven branch beside a tag deletion exits 1", () => {
		const { dir, top, sha } = checkout();
		const run = push({ dir, stdin: update(sha) + deletion("refs/tags/v1"), lines: [record(top, sha)] });
		expect([run.code, run.err]).toEqual([1, running]);
	});

	// spec: commit-gates/another-checkout-of-the-same-commit
	test("a record naming another top level exits 1", () => {
		const { dir, sha } = checkout();
		const run = push({ dir, stdin: update(sha), lines: [record(realpathSync(emptyDir()), sha)] });
		expect(run.code).toBe(1);
	});

	test("a top level git cannot read exits 1", () => {
		const dir = emptyDir("push-proven-norepo-");
		const sha = "c".repeat(40);
		expect(push({ dir, stdin: update(sha), lines: [record(realpathSync(dir), sha)] }).code).toBe(1);
	});

	// spec: commit-gates/a-ledger-the-hook-cannot-read
	test("an absent ledger exits 1", () => {
		const { dir, sha } = checkout();
		expect(push({ dir, stdin: update(sha) }).code).toBe(1);
	});

	// spec: commit-gates/a-ledger-the-hook-cannot-read
	test("a directory in the ledger's place exits 1", () => {
		const { dir, sha } = checkout();
		const state = emptyDir("push-proven-state-");
		mkdirSync(ledger(state), { recursive: true });
		expect(push({ dir, stdin: update(sha), state }).code).toBe(1);
	});
});
