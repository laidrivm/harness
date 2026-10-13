/**
 * The question gate's registration as the check pins it, over a consumer
 * whose settings hold nothing but `PermissionRequest` groups: the rest of the
 * policy is `settings.test.ts`'s, and only this registration's message is read
 * here. Then the harness's own registration, which no check reads. That
 * `sync.ts` writes it into a consumer is `sync-settings.test.ts`'s loop over
 * every hook the harness registers [24].
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUESTION_GATE, QUESTION_MATCHER } from "./bootstrap.ts";
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
	const dir = mkdtempSync(join(tmpdir(), "harness-settings-question-"));
	made.push(dir);
	mkdirSync(join(dir, ".claude"));
	const config = { hooks: { PermissionRequest: groups } };
	writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify(config));
	writeFileSync(join(dir, "bunfig.toml"), "");
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	return settings(dir).some((problem) =>
		problem.includes(
			"the PermissionRequest hook is not the harness question gate",
		),
	);
}

describe("the registration", () => {
	test("as bootstrap.ts holds it is not named", () => {
		expect(named([group(QUESTION_MATCHER, QUESTION_GATE)])).toBe(false);
	});

	// spec: agent-permissions/the-hook-in-a-consumer
	test.each([
		["missing [23]", []],
		[
			"under another matcher",
			[group("mcp__claude_ai_Notion__notion-create-comment", QUESTION_GATE)],
		],
		[
			"with another command",
			[group(QUESTION_MATCHER, 'bun "$CLAUDE_PROJECT_DIR/bun/question-gate.ts"')],
		],
	])("%s is named", (_, groups) => {
		expect(named(groups)).toBe(true);
	});

	// The harness is no consumer, so the check never reads its own settings,
	// and a matcher drifting there would stop the gate without a word.
	test("in the harness's own settings runs its gate under the matcher [25]", () => {
		const own = JSON.parse(
			readFileSync(`${import.meta.dir}/../.claude/settings.json`, "utf8"),
		) as { hooks: { PermissionRequest: object[] } };
		expect(own.hooks.PermissionRequest).toEqual([
			group(QUESTION_MATCHER, 'bun "$CLAUDE_PROJECT_DIR/bun/question-gate.ts"'),
		]);
	});
});

describe("the matcher [22]", () => {
	test.each([
		["the claude.ai server", "mcp__claude_ai_Notion__notion-create-comment"],
		["the notion server", "mcp__notion__notion-create-comment"],
	])("matches the tool under %s", (_, tool) => {
		expect(new RegExp(QUESTION_MATCHER).test(tool)).toBe(true);
	});

	test.each([
		["a longer tool name", "mcp__notion__notion-create-comments"],
		["a sibling tool", "mcp__notion__notion-get-comments"],
	])("does not match %s", (_, tool) => {
		expect(new RegExp(QUESTION_MATCHER).test(tool)).toBe(false);
	});
});
