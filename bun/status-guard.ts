#!/usr/bin/env bun
/**
 * The status guard, a `PreToolUse` hook on the connector's `notion-update-page`
 * under any server name, registered in a group of its own in the harness's
 * `.claude/settings.json` alone: it refuses a call whose `properties` carry
 * `Status`, under any command, naming `bun bun/work.ts status`, which moves a
 * card only on `origin/main`'s evidence and within the WIP limit
 * (`work-status`). No `# harness-managed` mark and no `HOOKS` entry, so
 * `sync-settings` keeps it here and never writes it into a consumer (stage 2,
 * question 28 a″).
 *
 * It fails open, as the Notion update guard does: an event it cannot read
 * passes, since it holds a forgotten path, not an intent (stage 2, question
 * 23). Exit 2 refuses, with the reason on stderr and one ledger record.
 */
import { blocker } from "./gate-ledger.ts";

const event = await Bun.stdin.json().catch(() => null);
const properties = event?.tool_input?.properties;
if (properties && typeof properties === "object" && Object.hasOwn(properties, "Status")) {
	const block: (id: string, reason: string) => never = blocker("status-guard", event);
	block("mcp-status", "status-guard: a card's Status moves through `bun bun/work.ts status --card <id> --to <status>`, which checks origin/main's evidence and the WIP limit. Send any other property in a call without Status.");
}
