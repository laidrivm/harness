/**
 * The MCP half of the permission policy: the ask entries that stand before
 * every tool that sends or posts as the user, compared whole, and the
 * parenthesised form Claude Code skips when it loads settings.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { settings } from "./settings.ts";
import {
	changed,
	cleanup,
	consumer,
	type Policy,
} from "./settings.fixture.ts";

afterAll(cleanup);

const report = (change: (c: Policy) => void) =>
	settings(consumer(changed(change))).join("\n");

const mcp = (c: Policy) => c.permissions.ask.filter((e) => e.startsWith("mcp__"));
const rest = (c: Policy) =>
	c.permissions.ask.filter((e) => !e.startsWith("mcp__"));
const swap = (from: string, to: string) => (c: Policy) => {
	c.permissions.ask = c.permissions.ask.map((e) => (e === from ? to : e));
};

describe("the MCP ask entries", () => {
	test("settings with none are named, with the four expected [1]", () => {
		expect(report((c) => (c.permissions.ask = rest(c)))).toContain(
			"the mcp__ ask list is not mcp__*__send_message, mcp__*__reply, mcp__*__forward, mcp__*__notion-create-comment",
		);
	});

	test("the four in another order are named [3]", () => {
		const text = report((c) => {
			c.permissions.ask = [...rest(c), ...mcp(c).reverse()];
		});
		expect(text).toContain("the mcp__ ask list is not");
	});

	test("a fifth entry is named [4]", () => {
		const text = report((c) => c.permissions.ask.push("mcp__*__post_message"));
		expect(text).toContain("the mcp__ ask list is not");
	});

	test("an entry naming its server is named [6]", () => {
		const text = report(
			swap("mcp__*__send_message", "mcp__claude_ai_Gmail__send_message"),
		);
		expect(text).toContain("the mcp__ ask list is not");
	});

	test("a tool name one character off is named [7]", () => {
		const text = report(
			swap("mcp__*__notion-create-comment", "mcp__*__notion-create-comments"),
		);
		expect(text).toContain("the mcp__ ask list is not");
	});

	// spec: agent-permissions/an-entry-is-dropped
	test("one of the four moved to deny is named as missing from ask [11]", () => {
		const text = report((c) => {
			c.permissions.ask = c.permissions.ask.filter(
				(e) => e !== "mcp__*__forward",
			);
			c.permissions.deny.push("mcp__*__forward");
		});
		expect(text).toContain("the mcp__ ask list is not");
	});

	test("an extra Bash ask entry yields the Bash message and no mcp__ one [5]", () => {
		const text = report((c) => c.permissions.ask.unshift("Bash(bun x *)"));
		expect(text).toContain("the Bash ask list is not");
		expect(text).not.toContain("mcp__");
	});

	// spec: agent-permissions/a-project-denies-one-of-the-tools-outright
	test("a project's own mcp__ deny entry beside the four asks reports nothing", () => {
		expect(
			report((c) =>
				c.permissions.deny.push("mcp__claude_ai_Gmail__forward"),
			),
		).toBe("");
	});

	test("an allow entry with a literal server prefix reports nothing", () => {
		expect(
			report((c) => c.permissions.allow.push("mcp__design__read_file")),
		).toBe("");
	});
});
