/**
 * `notion-guard.ts` as the hook runs it: a spawned process reading the event
 * on stdin, answering by exit code, in a directory holding no `.env` and with
 * only `PATH` and a home and ledger of the case's own in its environment, so
 * nothing reaches the user's own ledger.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = `${import.meta.dir}/notion-guard.ts`;
let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "harness-notion-guard-"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The guard's verdict on `stdin`, exactly as given, its ledger in `state`. */
function run(stdin: string, state = join(dir, "state")) {
	const call = Bun.spawnSync(["bun", script], {
		cwd: dir,
		env: { PATH: process.env.PATH, HOME: dir, XDG_STATE_HOME: state },
		stdin: Buffer.from(stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		out: call.stdout.toString(),
		reason: call.stderr.toString(),
	};
}

/** An update-page event carrying `input` beside a page id. */
const update = (input: object) =>
	JSON.stringify({
		tool_name: "mcp__claude_ai_Notion__notion-update-page",
		tool_input: { page_id: "0", ...input },
	});

const STATUS = { Status: "done" };
const EDIT = [{ old_str: "a", new_str: "b" }];

describe("calls that go through", () => {
	// spec: task-board/a-content-edit-alone
	test.each([
		["no properties [1]", {}],
		["an empty properties [2]", { properties: {} }],
		["a null properties [3]", { properties: null }],
		["an empty array as properties", { properties: [] }],
	])("a content edit with %s", (_, extra) => {
		const input = { command: "update_content", content_updates: EDIT };
		expect(run(update({ ...input, ...extra })).code).toBe(0);
	});

	// spec: task-board/properties-on-their-own
	test("update_properties with properties [5]", () => {
		const input = { command: "update_properties", properties: STATUS };
		expect(run(update(input)).code).toBe(0);
	});

	test("icon and cover beside update_content [11]", () => {
		const input = {
			command: "update_content",
			content_updates: EDIT,
			icon: "🚀",
			cover: "none",
		};
		expect(run(update(input)).code).toBe(0);
	});
});

describe("calls that would lose their properties", () => {
	// spec: task-board/properties-beside-a-content-edit
	test.each([
		["update_content [4]", { command: "update_content" }],
		["insert_content [6]", { command: "insert_content" }],
		["replace_content [7]", { command: "replace_content" }],
		["apply_template [8]", { command: "apply_template" }],
		["no command [9]", {}],
		["a misspelt Update_Properties [12]", { command: "Update_Properties" }],
	])("properties under %s exit 2", (_, input) => {
		expect(run(update({ ...input, properties: STATUS })).code).toBe(2);
	});

	test("properties given as a string exit 2 [10]", () => {
		const input = { command: "update_content", properties: "Status: done" };
		expect(run(update(input)).code).toBe(2);
	});

	test("the reason names update_properties, and stdout is empty [13, 14]", () => {
		const input = { command: "update_content", properties: STATUS };
		const { out, reason } = run(update(input));
		expect(reason).toContain("`update_properties`");
		expect(out).toBe("");
	});
});

describe("events the guard cannot read", () => {
	// spec: task-board/an-event-the-hook-cannot-read
	test.each([
		["stdin that is not JSON [19]", "{ not json"],
		["stdin holding JSON null", "null"],
	])("%s lets the call through", (_, stdin) => {
		expect(run(stdin).code).toBe(0);
	});

	test("an event with no tool_input lets the call through [20]", () => {
		const event = { tool_name: "mcp__notion__notion-update-page" };
		expect(run(JSON.stringify(event)).code).toBe(0);
	});
});

describe("the gate ledger", () => {
	const refused = update({ command: "update_content", properties: STATUS });
	const ledger = (state: string) => join(state, "harness", "gates.jsonl");

	test("a refusal appends one notion-properties-dropped record [25]", () => {
		const state = mkdtempSync(join(dir, "state-"));
		run(refused, state);
		const records = readFileSync(ledger(state), "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		expect(records).toEqual([
			expect.objectContaining({
				gate: "notion-guard",
				decision: "block",
				rule: "notion-properties-dropped",
			}),
		]);
	});

	test("a call let through leaves the ledger absent", () => {
		const state = mkdtempSync(join(dir, "state-"));
		run(update({ command: "update_properties", properties: STATUS }), state);
		expect(existsSync(ledger(state))).toBe(false);
	});

	test("an unwritable ledger still refuses, with its reason [24]", () => {
		// A file where the state directory should be: no permission bit to
		// flip, so the case holds when the suite runs as root.
		const state = join(mkdtempSync(join(dir, "state-")), "file");
		writeFileSync(state, "");
		const { code, reason } = run(refused, state);
		expect({ code, reason }).toEqual({
			code: 2,
			reason: expect.stringContaining("`update_properties`"),
		});
	});
});
