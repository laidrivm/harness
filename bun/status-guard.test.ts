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

const CREATE = "mcp__claude_ai_Notion__notion-create-pages";
const create = (pages: unknown, input: object = {}, tool_name = CREATE) => ({
	tool_name,
	tool_input: { parent: { data_source_id: "0" }, pages, ...input },
	cwd: "/tmp",
});
const at = (Status: unknown) => ({ properties: { title: "A card", Status } });

describe("a card created past idea is refused", () => {
	// spec: work-status/a-card-created-past-idea
	test.each([
		// Each event is built inside its case, so a throw in a builder fails the case rather than dropping the table.
		["one page at approved", () => create([at("approved")]), 0],
		["idea then exploring", () => create([at("idea"), at("exploring")]), 1],
		["two pages both past idea", () => create([at("approved"), at("exploring")]), 0],
		["Idea", () => create([at("Idea")]), 0],
		["a leading space", () => create([at(" idea")]), 0],
		["an empty string", () => create([at("")]), 0],
		["a REST-shaped select", () => create([at({ select: { name: "approved" } })]), 0],
		["idea in an array, named back as the plain string", () => create([at(["idea"])]), 0],
		["another server name", () => create([at("approved")], {}, "mcp__notion__notion-create-pages"), 0],
		["pages as a JSON string", () => create(JSON.stringify([at("approved")])), 0],
		["properties as a JSON string", () => create([{ properties: JSON.stringify({ Status: "approved" }) }]), 0],
	])("%s", (_, event, index) => {
		const run = guard(event());
		expect(run.code).toBe(2);
		expect(run.err).toContain(`pages[${index}]`);
		expect(run.err).toContain('`idea`, written as the plain string "idea"');
		expect(run.err).toContain("bun bun/work.ts status");
		expect(run.err).not.toContain("no Status");
		expect(run.ledger).toEqual([{ decision: "block", rule: "mcp-status" }]);
	});
});

describe("a card created at idea or with no status passes, recording nothing", () => {
	// spec: work-status/a-card-created-at-idea-or-with-no-status
	test.each([
		["idea", () => create([at("idea")])],
		["null", () => create([at(null)])],
		["no Status", () => create([{ properties: { title: "A card" } }])],
		["no properties", () => create([{ content: "A body" }])],
		["a page parent with only title", () => create([{ properties: { title: "A page" } }], { parent: { page_id: "0" } })],
		["another server name at idea", () => create([at("idea")], {}, "mcp__notion__notion-create-pages")],
		["an empty pages", () => create([])],
		["pages as a string that does not parse", () => create("[{")],
		["pages as an object", () => create(at("approved"))],
		["an entry that is null", () => create([null])],
		["an entry that is a string", () => create(["approved"])],
		["properties as a number", () => create([{ properties: 1 }])],
		["properties as a string that does not parse", () => create([{ properties: '{"Status":' }])],
		["no tool_input", () => ({ tool_name: CREATE })],
		["a top-level properties with Status and none in pages", () => create([at("idea")], { properties: { Status: "approved" } })],
		["pages at approved with no tool_name, read as an update", () => ({ tool_input: { pages: [at("approved")] } })],
	])("%s", (_, event) => {
		expect(guard(event())).toEqual({ code: 0, err: "", ledger: [] });
	});
});
