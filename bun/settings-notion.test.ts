/**
 * The Notion update guard's registration as the check pins it, over a
 * consumer whose settings hold nothing but `PreToolUse` groups: the rest of
 * the policy is `settings.test.ts`'s, and only this registration's message is
 * read here.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOTION_GUARD, NOTION_MATCHER } from "./bootstrap.ts";
import { settings } from "./settings.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const group = (matcher: string, command: string) => ({
	matcher,
	hooks: [{ type: "command", command }],
});

/** Whether the check names the registration in a consumer holding `groups`. */
function named(groups: object[]): boolean {
	const dir = mkdtempSync(join(tmpdir(), "harness-settings-notion-"));
	made.push(dir);
	mkdirSync(join(dir, ".claude"));
	const config = { hooks: { PreToolUse: groups } };
	writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify(config));
	writeFileSync(join(dir, "bunfig.toml"), "");
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	return settings(dir).some((problem) =>
		problem.includes(
			"the PreToolUse hook is not the harness Notion update guard",
		),
	);
}

describe("the registration", () => {
	test("as bootstrap.ts holds it is not named", () => {
		expect(named([group(NOTION_MATCHER, NOTION_GUARD)])).toBe(false);
	});

	// spec: task-board/a-consumer-without-the-registration
	test("missing is named [22]", () => {
		expect(named([])).toBe(true);
	});

	test("with a command ending its guard in || exit 2 is named [21]", () => {
		const command = NOTION_GUARD.replace('bun "$g";', 'bun "$g" || exit 2;');
		expect(command).not.toBe(NOTION_GUARD);
		expect(named([group(NOTION_MATCHER, command)])).toBe(true);
	});

	test("under another matcher is named [23]", () => {
		const matcher = "mcp__claude_ai_Notion__notion-update-page";
		expect(named([group(matcher, NOTION_GUARD)])).toBe(true);
	});
});

describe("the matcher", () => {
	// spec: task-board/another-server-name
	test.each([
		["the claude.ai server [15]", "mcp__claude_ai_Notion__notion-update-page"],
		["the notion server [16]", "mcp__notion__notion-update-page"],
	])("matches the tool under %s", (_, tool) => {
		expect(new RegExp(NOTION_MATCHER).test(tool)).toBe(true);
	});

	test.each([
		["a longer tool name [17]", "mcp__notion__notion-update-pages"],
		["a sibling tool [18]", "mcp__notion__notion-update-data-source"],
	])("does not match %s", (_, tool) => {
		expect(new RegExp(NOTION_MATCHER).test(tool)).toBe(false);
	});
});
