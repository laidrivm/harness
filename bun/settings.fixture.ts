/**
 * What the policy check's test files build a case out of: a fabricated
 * consumer whose settings keep the policy, and a copy of them with one
 * departure. Its own module because the cases split across files by what they
 * exercise and every one of them fabricates the same consumer.
 *
 * `afterAll` is not registered here: each test file registers `cleanup`
 * itself, as `spec-coverage.fixture.ts` explains for the same shape.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	BOOTSTRAP,
	LOOP_GUARD,
	NOTICE,
	NOTION_GUARD,
	NOTION_MATCHER,
	QUESTION_GATE,
	QUESTION_MATCHER,
	TURN_MARK,
	TURN_STOP,
} from "./bootstrap.ts";

const made: string[] = [];

/** Removes every consumer fabricated so far. */
export const cleanup = () => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
};

export type Hook = { type: string; command: string; if?: string };

export const policy = () => ({
	permissions: {
		deny: [
			"Bash(npx *)",
			"Bash(npm *)",
			"Bash(pnpm *)",
			"Bash(yarn *)",
			"Bash(gh pr comment *)",
			"Bash(gh issue comment *)",
			"Bash(gh pr review *)",
			"Edit(.npmrc)",
		],
		ask: [
			"Bash(bun add *)",
			"Bash(bun a *)",
			"Bash(bun install *)",
			"Bash(bun i *)",
			"Bash(bun remove *)",
			"Bash(bun rm *)",
			"Bash(bun r *)",
			"Bash(bun uninstall *)",
			"Bash(bun update *)",
			"Bash(bun up *)",
			"Bash(bun patch *)",
			"Bash(bun patch-commit *)",
			"Bash(bun pm pkg *)",
			"Bash(bun pm version *)",
			"Bash(bun pm trust *)",
			"Edit(bunfig.toml)",
			"mcp__*__send_message",
			"mcp__*__reply",
			"mcp__*__forward",
			"mcp__*__notion-create-comment",
		],
		allow: ["Bash(bun test *)", "Read(docs/**)"],
	},
	hooks: {
		PreToolUse: [
			{
				matcher: "Bash",
				hooks: [{ type: "command", command: BOOTSTRAP } as object],
			},
			{
				matcher: NOTION_MATCHER,
				hooks: [{ type: "command", command: NOTION_GUARD } as object],
			},
			{ hooks: [{ type: "command", command: LOOP_GUARD } as object] } as {
				matcher?: string;
				hooks: object[];
			},
		],
		PostToolUseFailure: [
			{ hooks: [{ type: "command", command: LOOP_GUARD } as object] },
		],
		PermissionRequest: [
			{
				matcher: QUESTION_MATCHER,
				hooks: [{ type: "command", command: QUESTION_GATE } as object],
			},
		],
		UserPromptSubmit: [
			{ hooks: [{ type: "command", command: TURN_MARK } as Hook] },
		] as { hooks: Hook[] }[] | undefined,
		Stop: [{ hooks: [{ type: "command", command: TURN_STOP } as Hook] }] as
			| { hooks: Hook[] }[]
			| undefined,
		SessionStart: [{ hooks: [{ type: "command", command: NOTICE } as Hook] }] as
			| { hooks: Hook[] }[]
			| undefined,
	},
});

export type Policy = ReturnType<typeof policy>;

export const BUNFIG =
	"[install]\nexact = true\nminimumReleaseAge = 259200\nminimumReleaseAgeExcludes = []\n";

/** A consumer tracking `config` as its settings, plus `files`. */
export function consumer(
	config: Policy,
	files: Record<string, string> = {},
): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-settings-"));
	made.push(dir);
	const all = {
		".claude/settings.json": JSON.stringify(config),
		"bunfig.toml": BUNFIG,
		...files,
	};
	for (const [path, text] of Object.entries(all)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
	return dir;
}

/** The policy with `change` applied to a fresh copy. */
export const changed = (change: (config: Policy) => void) => {
	const config = policy();
	change(config);
	return config;
};
