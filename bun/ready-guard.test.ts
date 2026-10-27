/**
 * The ready guard, spawned as Claude Code runs a `PreToolUse` hook: the event
 * on standard input, a state directory of its own for the ledger.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { records } from "./goal-check.fixture.ts";

afterAll(cleanup);

const script = join(import.meta.dir, "ready-guard.ts");

function guard(event: unknown) {
	const state = emptyDir("ready-guard-state-");
	const run = Bun.spawnSync([process.execPath, script], {
		stdin: Buffer.from(typeof event === "string" ? event : JSON.stringify(event)),
		env: { PATH: process.env.PATH, HOME: emptyDir("ready-guard-home-"), XDG_STATE_HOME: state },
	});
	const ledger = records(state, "ready-guard").map(({ decision, rule }) => ({ decision, rule }));
	return { code: run.exitCode, err: run.stderr.toString(), ledger };
}

const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command }, cwd: "/tmp" });

describe("refused, naming bun bun/work.ts finish", () => {
	// spec: work-finish/a-hand-run-ready
	// spec: work-finish/a-hand-run-create
	test.each([
		["gh pr ready 7", "hand-ready"],
		["gh pr ready 7 --undo=false", "hand-ready"],
		["gh pr ready 7 --undo --undo=false", "hand-ready"],
		["gh pr ready 7 --undo; gh pr ready 8", "hand-ready"],
		["gh -R o/r pr ready 7", "hand-ready"],
		["cd x && gh pr ready 7", "hand-ready"],
		["/usr/bin/gh pr ready 7", "hand-ready"],
		["gh pr create --draft --title t --body-file b", "hand-create"],
	])("%s", (command, rule) => {
		const run = guard(bash(command));
		expect(run.code).toBe(2);
		expect(run.err).toContain("bun bun/work.ts finish");
		expect(run.ledger).toEqual([{ decision: "block", rule }]);
	});
});

describe("allowed, recording nothing", () => {
	// spec: work-finish/a-hand-run-undo
	// spec: work-finish/a-ready-handed-to-a-shell
	test.each([
		"gh pr ready 7 --undo",
		"gh pr ready --undo 7",
		"gh pr ready 7 --undo=true",
		"gh pr view 7",
		"echo gh pr ready 7",
		"sh -c 'gh pr ready 7'",
		"eval 'gh pr ready 7'",
		"bun bun/work.ts finish --card aaaabbbbccccddddeeeeffff00001111",
		"echo 'unclosed",
	])("%s", (command) => {
		expect(guard(bash(command))).toEqual({ code: 0, err: "", ledger: [] });
	});

	test.each([
		["a non-Bash event", { tool_name: "Edit", tool_input: { command: "gh pr ready 7" } }],
		["an event that is not JSON", "not json"],
		["a Bash event with no command", { tool_name: "Bash", tool_input: {} }],
	])("%s", (_, event) => {
		expect(guard(event)).toEqual({ code: 0, err: "", ledger: [] });
	});
});
