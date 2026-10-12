#!/usr/bin/env bun
/**
 * The Notion page-update guard, a `PreToolUse` hook on the connector's
 * `notion-update-page` under any server name. It refuses, by exiting 2 with
 * the reason on stderr, a call that carries `properties` with any command
 * other than `update_properties`: the connector applies the other command,
 * drops the properties without an error, and reports success.
 *
 * An empty `properties` object goes through, since it loses nothing. Anything
 * else beside another command is refused, a non-object included: the
 * connector would reject that anyway, and this reason says more than its error.
 *
 * Whatever it cannot read — an event that is not JSON, or one with no
 * `tool_input` — lets the call through. This is fail-open on purpose, unlike
 * the command guard: it catches one known way to lose a write, and a guard
 * refusing every update when the event's shape changed would stop the board
 * workflow outright. No hook can read the page afterwards, so re-reading a
 * card before reporting it moved stays the session's to do.
 *
 * A refusal is recorded in the gate ledger as `notion-properties-dropped`. The
 * ledger swallows its own errors, so one it cannot write changes no decision.
 */
import { blocker } from "./gate-ledger.ts";

type Input = { command?: unknown; properties?: unknown };

/** Why the call would lose its properties, or `undefined` to let it through. */
function refusal({ command, properties }: Input): string | undefined {
	if (command === "update_properties" || properties == null) return;
	if (typeof properties === "object" && Object.keys(properties).length === 0)
		return;
	const under =
		command === undefined
			? "with no command"
			: `under ${JSON.stringify(command)}`;
	return (
		`notion-guard: \`properties\` ${under} would be dropped without an ` +
		"error — the connector applies them only under `update_properties`. " +
		"Send the properties in their own `update_properties` call, and the " +
		"rest of the update in another."
	);
}

if (import.meta.main) {
	let event: { tool_input?: Input } | null = null;
	let reason: string | undefined;
	try {
		event = JSON.parse(await Bun.stdin.text());
		reason = refusal(event?.tool_input ?? {});
	} catch {
		// Fail-open, as the header says: an event this script cannot read
		// lets the call through.
	}
	if (reason)
		blocker("notion-guard", event)("notion-properties-dropped", reason);
}
