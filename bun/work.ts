#!/usr/bin/env bun
/**
 * `bun bun/work.ts <subcommand> …`, the commands a session works a card with:
 * a thin dispatcher reading each subcommand's arguments with a strict
 * `util.parseArgs`, one module per subcommand. Any argument it refuses prints
 * the usage and exits 2 before the subcommand runs.
 *
 * - `take --card <id>` (`work-take.ts`): prints the card's context.
 * - `finish [--card <id>] [--title <text> --body-file <path>]`
 *   (`work-finish.ts`): pushes the branch, opens its pull request as a draft
 *   when none is open, and marks it ready unless a question waits on the
 *   card; with no card, it reads none.
 * - `status --card <id> --to <status>` (`work-status.ts`): moves the card's
 *   `Status` once the evidence and the WIP limit allow it.
 */
import { parseArgs, type ParseArgsConfig } from "node:util";
import { ID } from "./notion-bot.ts";
import { finish } from "./work-finish.ts";
import { status, STATUSES } from "./work-status.ts";
import { take } from "./work-take.ts";

export const USAGE = [
	"usage: work.ts take --card <id>",
	"       work.ts finish [--card <id>] [--title <text> --body-file <path>]",
	"       work.ts status --card <id> --to <status>",
];

/** The options `args` sets under `options`, or `undefined` when strict parsing refuses them. */
function values(args: string[], options: ParseArgsConfig["options"]) {
	try {
		return parseArgs({ args, options, strict: true, allowPositionals: false }).values;
	} catch {
		return undefined;
	}
}

/** The lines the command prints and its exit code. */
export async function work(args: string[]): Promise<{ lines: string[]; code: number }> {
	const [subcommand, ...rest] = args;
	if (subcommand === "take") {
		const card = values(rest, { card: { type: "string" } })?.card;
		if (typeof card === "string" && ID.test(card)) return take(card);
	}
	if (subcommand === "finish") {
		const set = values(rest, { card: { type: "string" }, title: { type: "string" }, "body-file": { type: "string" } });
		const { card, title, "body-file": body } = (set ?? {}) as Record<string, string | undefined>;
		// Both or neither, and neither blank: `gh` would open a pull request with no title, or read no body.
		const opening = title === undefined && body === undefined ? undefined : title?.trim() && body ? { title, body } : null;
		if ((card === undefined || ID.test(card)) && set && opening !== null) return finish(card, opening);
	}
	if (subcommand === "status") {
		const { card, to } = (values(rest, { card: { type: "string" }, to: { type: "string" } }) ?? {}) as Record<string, string | undefined>;
		if (typeof card === "string" && ID.test(card) && typeof to === "string" && STATUSES.includes(to)) return status(card, to);
	}
	return { lines: USAGE, code: 2 };
}

if (import.meta.main) {
	const { lines, code } = await work(process.argv.slice(2));
	(code === 2 ? console.error : console.log)(lines.join("\n"));
	process.exit(code);
}
