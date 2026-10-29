import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	cleanup,
	commit,
	DONE,
	end,
	git,
	OPEN,
	prompt,
	publish,
	repo,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";
import { RUNNER_STEPS } from "./gate-ledger.ts";

/**
 * `turn-gate.ts` as the hooks run it: a spawned process reading the event on
 * stdin, answering by exit code. What it decides is the other two test
 * files'; here is how the decision leaves the process. That both halves are
 * registered is `self-pin.test.ts`'s.
 */

afterAll(cleanup);

const script = `${import.meta.dir}/turn-gate.ts`;

/**
 * Runs one half. The environment carries only what the case needs: `TMPDIR`
 * points the mark store at a directory of the case's own, and
 * `XDG_STATE_HOME` the gate ledger, so a refusal never reaches the user's.
 */
function run(half: "mark" | "stop", event: unknown, cwd: string, tmp: string) {
	const call = Bun.spawnSync(["bun", script, half], {
		stdout: "pipe",
		cwd,
		env: { PATH: process.env.PATH, TMPDIR: tmp, XDG_STATE_HOME: tmp },
		stdin: Buffer.from(
			typeof event === "string" ? event : JSON.stringify(event),
		),
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		reason: call.stderr.toString(),
		out: call.stdout.toString(),
	};
}

/** A marked repository whose turn has committed the last task of its group. */
function finished() {
	const dir = repo({ [TASKS]: OPEN });
	const tmp = store();
	run("mark", prompt(dir), dir, tmp);
	commit(dir, { [TASKS]: DONE });
	return { dir, tmp };
}

describe("how the refusal leaves the process", () => {
	// spec: commit-gates/a-task-group-is-completed-and-the-turn-ends-silently
	test("the 2026-08-19 turn — last task committed, a question at the end — exits exactly 2 [14, 23]", () => {
		const { dir, tmp } = finished();
		expect(run("stop", end(dir, SILENT), dir, tmp).code).toBe(2);
	});

	test("the reason names running the runner and ending on a `BLOCKED` line [15]", () => {
		const { dir, tmp } = finished();
		const { reason } = run("stop", end(dir, SILENT), dir, tmp);
		expect(reason).toContain("pre-pr.ts` with `HEAD` at that commit");
		expect(reason).toContain("a `BLOCKED` line");
	});

	// spec: commit-gates/the-turn-reports-its-gates
	test("a silent turn with a passing run of the tip exits 0 with nothing on stderr", () => {
		const { dir, tmp } = finished();
		mkdirSync(join(tmp, "harness"));
		const pass = (rule: string) =>
			JSON.stringify({ gate: "pre-pr", decision: "pass", rule, project: realpathSync(dir), commit: git(dir, "rev-parse", "HEAD") });
		writeFileSync(join(tmp, "harness", "gates.jsonl"), `${RUNNER_STEPS.map(pass).join("\n")}\n`);
		expect(run("stop", end(dir, SILENT), dir, tmp)).toEqual({
			code: 0,
			reason: "",
			out: "",
		});
	});

	// spec: commit-gates/gate-lines-with-no-run-behind-them
	test("a reported turn without the runner's record exits 2 [35]", () => {
		const { dir, tmp } = finished();
		const message = `${SILENT}\n\nTRIAGE gate: PASS — 1 groups.`;
		expect(run("stop", end(dir, message), dir, tmp).code).toBe(2);
	});

	// spec: commit-gates/a-pull-brings-in-another-pull-request-s-completed-group
	test("the 2026-10-13 turn — a pull on `main` brought in a completed group, no gate line — exits 0 with nothing on stderr [11]", () => {
		const dir = repo({ [TASKS]: OPEN });
		commit(dir, { [TASKS]: DONE });
		publish(dir);
		git(dir, "checkout", "-q", "-b", "main", "HEAD~1");
		const tmp = store();
		run("mark", prompt(dir), dir, tmp);
		git(dir, "merge", "-q", "--ff-only", "origin/main");
		expect(run("stop", end(dir, SILENT), dir, tmp)).toEqual({
			code: 0,
			reason: "",
			out: "",
		});
	});

	test("the mark half prints nothing — its stdout would join every prompt", () => {
		const dir = repo({ [TASKS]: OPEN });
		expect(run("mark", prompt(dir), dir, store())).toEqual({
			code: 0,
			reason: "",
			out: "",
		});
	});
});

describe("what ends the turn because it cannot be read", () => {
	// spec: commit-gates/there-is-no-repository-or-no-branch
	test("a directory outside any repository ends the turn [19]", () => {
		const dir = store(); // an empty directory in the OS temp dir, no repository
		const tmp = store();
		run("mark", prompt(dir), dir, tmp);
		expect(run("stop", end(dir, SILENT), dir, tmp).code).toBe(0);
	});

	test("a detached `HEAD` ends the turn [20]", () => {
		const { dir, tmp } = finished();
		git(dir, "checkout", "--detach");
		expect(run("stop", end(dir, SILENT), dir, tmp).code).toBe(0);
	});

	test("an event that is not JSON ends the turn", () => {
		const { dir, tmp } = finished();
		expect(run("stop", "not json", dir, tmp).code).toBe(0);
	});

	test("an event that is not JSON lets the prompt through", () => {
		const { dir, tmp } = finished();
		expect(run("mark", "not json", dir, tmp).code).toBe(0);
	});
});
