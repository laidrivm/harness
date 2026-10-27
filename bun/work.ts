#!/usr/bin/env bun
/**
 * `bun bun/work.ts <subcommand> …`, the commands a session works a card with:
 * a thin dispatcher reading each subcommand's arguments with a strict
 * `util.parseArgs`, one module per subcommand. Any argument it refuses prints
 * the usage and exits 2 before the subcommand runs.
 *
 * - `take --card <id>` (`work-take.ts`): prints the card's context.
 */
import { parseArgs, type ParseArgsConfig } from "node:util";
import { ID } from "./notion-bot.ts";
import { take } from "./work-take.ts";

const USAGE = ["usage: work.ts take --card <id>"];

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
	return { lines: USAGE, code: 2 };
}

if (import.meta.main) {
	const { lines, code } = await work(process.argv.slice(2));
	(code === 2 ? console.error : console.log)(lines.join("\n"));
	process.exit(code);
}
