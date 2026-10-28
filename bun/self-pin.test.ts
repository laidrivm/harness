/**
 * The harness's own sessions run its gates from its pin: the tracked
 * `.claude/settings.json` registers every hook a consumer gets, in the
 * consumer's text, and none that runs a script from the working tree, so an
 * edit to a gate holds no session until it merges and the pin moves past it.
 * The pin itself is a development dependency, which a consumer never installs.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOOKS, MARK, registration } from "./bootstrap.ts";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { syncSettings } from "./sync-settings.ts";

afterAll(cleanup);

type Entry = { matcher?: string; hooks?: { command?: string }[] };

const tracked = (path: string) =>
	JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const hooks = (): Record<string, Entry[]> =>
	tracked(".claude/settings.json").hooks ?? {};

/** A settings tree's hooks of `event` under `matcher`, an absent one included. */
const under = (all: Record<string, Entry[]>, event: string, matcher?: string) =>
	(all[event] ?? []).filter((entry) => entry.matcher === matcher).flatMap((entry) => entry.hooks ?? []);

// The pinned copy, with no mark: the harness keeps this hook to itself (judgement-step-record D5).
const SKILL_RECORD = {
	type: "command",
	command: 'g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/skill-record.ts"; if [ -f "$g" ]; then bun "$g"; fi',
};
const SKILL_EVENTS = [
	["PostToolUse", "Skill"],
	["UserPromptExpansion", undefined],
] as const;

/** `syncSettings` run over a tree holding `settings`, or none; the hooks it leaves. */
function synced(settings?: string): Record<string, Entry[]> {
	const root = emptyDir("self-pin-sync-");
	mkdirSync(join(root, ".claude"));
	if (settings) copyFileSync(settings, join(root, ".claude/settings.json"));
	syncSettings(root);
	return JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8")).hooks ?? {};
}

describe("the skill-call hook the harness keeps to itself", () => {
	// spec: harness-updates/the-skill-call-hook-s-registration
	test.each(SKILL_EVENTS)("is registered under %s, in the foreground with no if [32, 33, 34]", (event, matcher) => {
		// The whole hook object: an `if`, `async`, `asyncRewake`, `shell` or `args` would change whether it runs or blocks.
		expect(under(hooks(), event, matcher)).toContainEqual(SKILL_RECORD);
		expect(SKILL_RECORD.command.endsWith(MARK)).toBe(false);
	});

	test("no HOOKS entry names its script [35]", () => {
		expect(HOOKS.filter((hook) => hook.command.includes("skill-record.ts"))).toEqual([]);
	});

	// spec: harness-updates/the-harness-s-own-settings-are-synced
	test("a sync of the harness's own settings leaves both registrations as they were [36]", () => {
		const after = synced(join(import.meta.dir, "..", ".claude/settings.json"));
		for (const [event, matcher] of SKILL_EVENTS)
			expect(under(after, event, matcher)).toEqual(under(hooks(), event, matcher));
	});

	// spec: harness-updates/a-consumer-syncs
	test("a consumer's sync writes no Skill or UserPromptExpansion hook [35]", () => {
		const after = synced();
		expect([under(after, "PostToolUse", "Skill"), after.UserPromptExpansion]).toEqual([[], undefined]);
		expect(JSON.stringify(after)).not.toContain("skill-record.ts");
	});
});

// The pinned copy, with no mark: the harness keeps the ready guard to itself (work-finish, stage 2 question 28 a″).
const READY_GUARD = {
	type: "command",
	command: 'g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/ready-guard.ts"; if [ -f "$g" ]; then bun "$g"; fi',
};

describe("the ready guard the harness keeps to itself", () => {
	// spec: work-finish/a-hand-run-ready
	test("is registered under PreToolUse with no matcher, in the foreground with no if and no mark", () => {
		// The whole hook object: an `if`, `async`, `asyncRewake`, `shell`, `args` or a matcher would change whether it runs or blocks.
		expect(under(hooks(), "PreToolUse")).toContainEqual(READY_GUARD);
		expect(READY_GUARD.command.endsWith(MARK)).toBe(false);
		expect(HOOKS.filter((hook) => hook.command.includes("ready-guard.ts"))).toEqual([]);
	});

	test("a sync of the harness's own settings keeps it", () => {
		expect(under(synced(join(import.meta.dir, "..", ".claude/settings.json")), "PreToolUse")).toContainEqual(READY_GUARD);
	});

	// spec: work-finish/a-consumer-s-settings
	test("a consumer's sync writes no ready guard", () => {
		expect(JSON.stringify(synced())).not.toContain("ready-guard.ts");
	});
});

describe("the harness's own hook registrations", () => {
	// spec: harness-updates/a-registration-is-missing-from-the-harness-s-settings
	test.each(HOOKS.map((hook) => [`${hook.name} (${hook.event})`, hook]))(
		"%s is registered in its consumer text",
		(_, hook) => {
			// The whole hook object, so an `if`, `async`, other type or other
			// timeout that would stop it running, blocking or finishing fails here
			// — no check reads these settings.
			const registered = (hooks()[hook.event] ?? [])
				.filter((entry) => entry.matcher === hook.matcher)
				.flatMap((entry) => entry.hooks ?? []);
			expect(registered).toContainEqual(registration(hook));
			if (hook.sole) expect(registered).toHaveLength(1);
		},
	);

	// spec: harness-updates/a-hook-runs-a-working-tree-script
	test("no hook runs a script from the working tree", () => {
		const commands = Object.values(hooks())
			.flat()
			.flatMap((entry) => entry.hooks ?? [])
			.map((hook) => hook.command ?? "");
		expect(
			commands.filter((command) =>
				command.includes("$CLAUDE_PROJECT_DIR/bun/"),
			),
		).toEqual([]);
	});

	test("the harness's own settings allow bun/work.ts, the session's take and finish", () => {
		expect(tracked(".claude/settings.json").permissions.allow).toContain("Bash(bun bun/work.ts *)");
	});

	test("the harness pins itself as a development dependency at a full commit", () => {
		const manifest = tracked("package.json");
		expect(manifest.dependencies?.harness).toBeUndefined();
		expect(manifest.devDependencies?.harness).toMatch(
			/^github:laidrivm\/harness#[0-9a-f]{40}$/,
		);
	});
});
