#!/usr/bin/env bun
/**
 * The skill-call hook: one `PostToolUse` event for the `Skill` tool, or one
 * `UserPromptExpansion` event for a typed `/skill`, becomes one gate-ledger
 * record — gate `skill`, decision `called`, the skill's name as the rule, and
 * the commit `HEAD` names in the event's `cwd`, with that checkout's top level
 * as the project. It proves the call, not that the skill was followed
 * (`openspec/specs/gate-ledger/spec.md`).
 *
 * No record is written while a tracked file differs from `HEAD`: the record
 * names a commit, and a skill run over an uncommitted edit read a tree no
 * commit holds. Untracked files do not count, unlike the pre-PR runner's rule,
 * whose project checks run the whole tree. Only the name is read into the
 * record; a skill's arguments are free text and can carry a path or a token.
 *
 * It prints nothing and exits 0 on every path: a typed command's expansion can
 * be blocked by a hook, and its stdout can reach the model; a recorder must do
 * neither.
 *
 * The logic is `recordSkill`, given the event's text and the environment to
 * run git and find the ledger with, so the tests call it in their own process;
 * the main block reads stdin, calls it and exits.
 */
import { type Env, recordCheckout } from "./gate-ledger.ts";

type Event = {
	session_id?: unknown;
	cwd?: unknown;
	tool_input?: { skill?: unknown };
	expansion_type?: unknown;
	command_name?: unknown;
};

/** Records the skill `input` names, if any; never throws. */
export function recordSkill(input: string, environment: Env): void {
	try {
		const event: Event = JSON.parse(input) ?? {};
		// An MCP server's prompt shares the expansion event, and can share a skill's name.
		const name = event.tool_input?.skill ?? (event.expansion_type === "slash_command" ? event.command_name : undefined);
		const dir = event.cwd;
		if (typeof name === "string" && name && typeof dir === "string") {
			// A session started under a git hook inherits its GIT_DIR, which outranks `-C`: drop every variable git names as local.
			const listed = Bun.spawnSync(["git", "rev-parse", "--local-env-vars"], { env: environment });
			const local = new Set(listed.stdout.toString().split("\n"));
			const env = Object.fromEntries(Object.entries(environment).filter(([key]) => !local.has(key)));
			/** git's trimmed stdout in `dir`, or `undefined` when it fails. */
			const git = (...args: string[]) => {
				const p = Bun.spawnSync(["git", "-C", dir, ...args], { env });
				return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
			};
			const commit = git("rev-parse", "--verify", "-q", "HEAD");
			const top = git("rev-parse", "--show-toplevel");
			// A status git cannot read is never a clean tree.
			const status = git("status", "--porcelain", "--untracked-files=no");
			if (commit && top && status === "") {
				recordCheckout("skill", "called", name, { session_id: event.session_id, cwd: top }, commit, environment);
			}
		}
	} catch {
		// An event that is no JSON, or no git: nothing to record.
	}
}

if (import.meta.main) {
	try {
		recordSkill(await Bun.stdin.text(), process.env);
	} catch {
		// Unreadable stdin: nothing to record.
	}
	process.exit(0);
}
