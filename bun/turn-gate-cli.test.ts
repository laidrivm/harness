import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	cleanup,
	commit,
	DONE,
	end,
	git,
	OPEN,
	prompt,
	repo,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";

/**
 * `turn-gate.ts` as the hooks run it: a spawned process reading the event on
 * stdin, answering by exit code. What it decides is the other two test
 * files'; here is how the decision leaves the process, and that both halves
 * are registered.
 */

afterAll(cleanup);

const script = `${import.meta.dir}/turn-gate.ts`;

/**
 * Runs one half. The environment carries only what the case needs: `TMPDIR`
 * points the mark store at a directory of the case's own.
 */
function run(half: "mark" | "stop", event: unknown, cwd: string, tmp: string) {
	const call = Bun.spawnSync(["bun", script, half], {
		cwd,
		env: { PATH: process.env.PATH, TMPDIR: tmp },
		stdin: Buffer.from(
			typeof event === "string" ? event : JSON.stringify(event),
		),
		stderr: "pipe",
	});
	return { code: call.exitCode, reason: call.stderr.toString() };
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

	test("the reason names running the sequence and writing `BLOCKED` [15]", () => {
		const { dir, tmp } = finished();
		const { reason } = run("stop", end(dir, SILENT), dir, tmp);
		expect(reason).toContain("Run the pre-PR sequence");
		expect(reason).toContain("BLOCKED —");
	});

	// spec: commit-gates/the-turn-reports-its-gates
	test("a reported turn exits 0 with nothing on stderr", () => {
		const { dir, tmp } = finished();
		const message = `${SILENT}\n\nTRIAGE gate: PASS — 1 groups.`;
		expect(run("stop", end(dir, message), dir, tmp)).toEqual({
			code: 0,
			reason: "",
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

describe("the registrations in this repository's settings", () => {
	const hooks = () =>
		JSON.parse(
			readFileSync(`${import.meta.dir}/../.claude/settings.json`, "utf8"),
		).hooks;

	test.each([
		["UserPromptSubmit", "mark"],
		["Stop", "stop"],
	])("%s runs the %s half", (event, half) => {
		const commands = (hooks()[event] ?? []).flatMap(
			(entry: { hooks?: { command?: string }[] }) =>
				(entry.hooks ?? []).map((hook) => hook.command),
		);
		expect(commands).toContain(
			`bun "$CLAUDE_PROJECT_DIR/bun/turn-gate.ts" ${half}`,
		);
	});
});
