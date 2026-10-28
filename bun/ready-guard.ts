#!/usr/bin/env bun
/**
 * The ready guard, a `PreToolUse` hook with no matcher registered in the
 * harness's own `.claude/settings.json` alone: it refuses a hand-run `gh pr
 * ready` without `--undo`, and a hand-run `gh pr create`, naming `bun
 * bun/work.ts finish`, which owns opening a pull request and marking it ready
 * (`work-finish`, *Opening and the ready switch are finish's own*). No
 * matcher, because `settings.ts` lets the `Bash` matcher hold the bootstrap
 * alone; no `# harness-managed` mark and no `HOOKS` entry, so `sync-settings`
 * keeps it here and never writes it into a consumer (stage 2, question 28 a″).
 *
 * It fails open: an event that is not a Bash call, carries no command, or
 * holds a line the parser refuses passes — the command guard blocks the last
 * two. Exit 2 refuses, with the reason on stderr and one ledger record.
 */
import { ghFinishes } from "./command-guard-gh.ts";
import { commands } from "./command-parse.ts";
import { invocations } from "./command-words.ts";
import { blocker } from "./gate-ledger.ts";

const event = await Bun.stdin.json().catch(() => null);
const command = event?.tool_name === "Bash" ? event?.tool_input?.command : undefined;
if (typeof command !== "string") process.exit(0);
const block: (id: string, reason: string) => never = blocker("ready-guard", event);

let parts: string[][];
try {
	parts = commands(command, () => {
		throw new Error("unparsed");
	});
} catch {
	process.exit(0);
}
// shortcut: a program handed to `sh -c` or `eval` is not read — the guard holds a forgotten order, not an intent to get round it (stage 2, question 23); descend into them as the command guard does once a refusal is seen walked past that way.
for (const part of parts)
	for (const [name, rest] of invocations(part)) {
		const act = name === "gh" ? ghFinishes(rest) : undefined;
		if (act === "create")
			block("hand-create", "ready-guard: `gh pr create` is `bun bun/work.ts finish`'s: run `bun bun/work.ts finish --card <id> --title <text> --body-file <path>`, which opens it as a draft after the push; leave out `--card` only for a pull request no card stands behind.");
		if (act === "ready")
			block("hand-ready", "ready-guard: marking a pull request ready is `bun bun/work.ts finish`'s: run `bun bun/work.ts finish --card <id>`, which marks it ready after the push unless a question waits on the card; leave out `--card` only for a pull request no card stands behind. `gh pr ready <n> --undo` stays yours.");
	}
