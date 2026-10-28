/**
 * The status guard, spawned as Claude Code runs a `PreToolUse` hook: the event
 * on standard input, a state directory of its own for the ledger.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { records } from "./goal-check.fixture.ts";

afterAll(cleanup);

const script = join(import.meta.dir, "status-guard.ts");

function guard(event: unknown) {
	const state = emptyDir("status-guard-state-");
	const run = Bun.spawnSync([process.execPath, script], {
		stdin: Buffer.from(typeof event === "string" ? event : JSON.stringify(event)),
		cwd: emptyDir("status-guard-cwd-"), // no .env there for bun to load
		env: { PATH: process.env.PATH, HOME: emptyDir("status-guard-home-"), XDG_STATE_HOME: state },
	});
	const ledger = records(state, "status-guard").map(({ decision, rule }) => ({ decision, rule }));
	return { code: run.exitCode, err: run.stderr.toString(), ledger };
}

const update = (input: object) => ({
	tool_name: "mcp__claude_ai_Notion__notion-update-page",
	tool_input: { page_id: "0", ...input },
	cwd: "/tmp",
});

describe("a Status write through the connector is refused", () => {
	// spec: work-status/a-status-set-through-the-connector
	test.each([
		["update_properties with Status", { command: "update_properties", properties: { Status: "done" } }],
		["update_content with Status beside Assign", { command: "update_content", properties: { Assign: [], Status: "applied" } }],
		["a Status cleared to null", { command: "update_properties", properties: { Status: null } }],
	])("%s", (_, input) => {
		const run = guard(update(input));
		expect(run.code).toBe(2);
		expect(run.err).toContain("bun bun/work.ts status");
		expect(run.ledger).toEqual([{ decision: "block", rule: "mcp-status" }]);
	});
});

describe("allowed, recording nothing", () => {
	// spec: work-status/assign-alone
	test.each([
		["Assign alone", { command: "update_properties", properties: { Assign: [] } }],
		["no properties", { command: "update_content" }],
		["an empty properties", { command: "update_properties", properties: {} }],
		["properties as a string", { command: "update_properties", properties: "Status" }],
	])("%s", (_, input) => {
		expect(guard(update(input))).toEqual({ code: 0, err: "", ledger: [] });
	});

	// spec: work-status/an-event-it-cannot-read
	test.each([
		["an event that is not JSON", "not json"],
		["an event with no tool_input", { tool_name: "mcp__claude_ai_Notion__notion-update-page" }],
	])("%s", (_, event) => {
		expect(guard(event)).toEqual({ code: 0, err: "", ledger: [] });
	});
});
