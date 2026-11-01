#!/usr/bin/env bun
/**
 * The status guard, a `PreToolUse` hook on the connector's `notion-update-page`
 * and `notion-create-pages` under any server name, registered in a group of its
 * own in the harness's `.claude/settings.json` alone: it refuses an update
 * whose `properties` carry `Status`, under any command, and a create in which
 * any page's `properties` carry a `Status` other than `"idea"` or `null`,
 * whatever its parent, naming `bun bun/work.ts status`, which moves a card only
 * on `origin/main`'s evidence and within the WIP limit (`work-status`). No
 * `# harness-managed` mark and no `HOOKS` entry, so `sync-settings` keeps it
 * here and never writes it into a consumer (stage 2, question 28 a″).
 *
 * It fails open, as the Notion update guard does: an event it cannot read
 * passes, since it holds a forgotten path, not an intent (stage 2, question
 * 23). Exit 2 refuses, with the reason on stderr and one ledger record.
 */
import { blocker } from "./gate-ledger.ts";

const event = await Bun.stdin.json().catch(() => null);
const input = event?.tool_input;
const refuse = (reason: string): never => blocker("status-guard", event)("mcp-status", reason);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
// A client may send a nested parameter as a JSON string and the server may parse it; one that does not parse passes.
const parsed = (value: unknown) => {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
};

if (typeof event?.tool_name === "string" && event.tool_name.endsWith("__notion-create-pages")) {
	const pages = parsed(input?.pages);
	// The first page refused ends the run: `refuse` exits.
	if (Array.isArray(pages))
		for (const [i, page] of pages.entries()) {
			const properties = isObject(page) ? parsed(page.properties) : undefined;
			if (!isObject(properties) || !Object.hasOwn(properties, "Status")) continue;
			const status = properties.Status;
			// null passes: a page created with no status, where an update to null is still a move.
			if (status !== "idea" && status !== null)
				refuse(`status-guard: pages[${i}] is created at Status ${JSON.stringify(status)}; create a card at \`idea\`, written as the plain string "idea" — only the user moves it to \`approved\`, and later moves go through \`bun bun/work.ts status --card <id> --to <status>\`.`);
		}
} else if (isObject(input?.properties) && Object.hasOwn(input.properties, "Status"))
	refuse("status-guard: a card's Status moves through `bun bun/work.ts status --card <id> --to <status>`, which checks origin/main's evidence and the WIP limit. Send any other property in a call without Status.");
