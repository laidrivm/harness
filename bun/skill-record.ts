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
 */
import { record } from "./gate-ledger.ts";

type Event = {
	session_id?: unknown;
	cwd?: unknown;
	tool_input?: { skill?: unknown };
	expansion_type?: unknown;
	command_name?: unknown;
};

/** git's trimmed stdout in `dir`, or `undefined` when it fails. */
const git = (dir: string, ...args: string[]) => {
	const p = Bun.spawnSync(["git", "-C", dir, ...args]);
	return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
};

try {
	const event: Event = JSON.parse(await Bun.stdin.text()) ?? {};
	// An MCP server's prompt shares the expansion event, and can share a skill's name.
	const name =
		event.tool_input?.skill ?? (event.expansion_type === "slash_command" ? event.command_name : undefined);
	const dir = event.cwd;
	if (typeof name === "string" && name && typeof dir === "string") {
		const commit = git(dir, "rev-parse", "--verify", "-q", "HEAD");
		const top = git(dir, "rev-parse", "--show-toplevel");
		// A status git cannot read is never a clean tree.
		const status = git(dir, "status", "--porcelain", "--untracked-files=no");
		if (commit && top && status === "") {
			// `record()` prefers CLAUDE_PROJECT_DIR, the session's project, which
			// can be another checkout than the one the call ran in.
			delete process.env.CLAUDE_PROJECT_DIR;
			record("skill", "called", name, { session_id: event.session_id, cwd: top }, commit);
		}
	}
} catch {
	// Unreadable stdin or an event that is no JSON: nothing to record.
}
process.exit(0);
