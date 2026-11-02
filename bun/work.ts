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
 * - `resolve --pr <n> --head <sha> --comment <id> …` (`work-resolve.ts`):
 *   resolves the review bot's threads those comments open, on the branch's
 *   open pull request while its head is `<sha>`.
 */
import { type ParseArgsConfig, parseArgs } from "node:util";
import { ID } from "./notion-bot.ts";
import { finish } from "./work-finish.ts";
import { resolve } from "./work-resolve.ts";
import { STATUSES, status } from "./work-status.ts";
import { take } from "./work-take.ts";

export const USAGE = [
	"usage: work.ts take --card <id>",
	"       work.ts finish [--card <id>] [--title <text> --body-file <path>]",
	"       work.ts status --card <id> --to <status>",
	"       work.ts resolve --pr <n> --head <sha> --comment <id> [--comment <id> …]",
];

/** A positive whole number with no leading zero, as a string: a pull request's or a comment's id. */
const NUMBER = /^[1-9]\d*$/;

/** The options `args` sets under `options`, or `undefined` when strict parsing refuses them. */
function values<Options extends ParseArgsConfig["options"]>(args: string[], options: Options) {
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
		const [card, title, body] = [set?.card, set?.title, set?.["body-file"]];
		// Both or neither, and neither blank: `gh` would open a pull request with no title, or read no body.
		const opening =
			title === undefined && body === undefined ? undefined : title?.trim() && body ? { title, body } : null;
		if ((card === undefined || ID.test(card)) && set && opening !== null) return finish(card, opening);
	}
	if (subcommand === "status") {
		const set = values(rest, { card: { type: "string" }, to: { type: "string" } });
		const [card, to] = [set?.card, set?.to];
		if (typeof card === "string" && ID.test(card) && typeof to === "string" && STATUSES.includes(to))
			return status(card, to);
	}
	if (subcommand === "resolve") {
		// `multiple` on all three, so a repeated `--pr` or `--head` is refused rather than the last one kept.
		const many = { type: "string", multiple: true } as const;
		const set = values(rest, { pr: many, head: many, comment: many });
		const [pr = [], head = [], comment = []] = [set?.pr, set?.head, set?.comment];
		const [number, ...prs] = pr;
		const [sha, ...heads] = head;
		if (
			set &&
			number !== undefined &&
			!prs.length &&
			NUMBER.test(number) &&
			sha !== undefined &&
			!heads.length &&
			/^[0-9a-f]{40}$/.test(sha) &&
			comment.length &&
			comment.every((id) => NUMBER.test(id))
		)
			return resolve(number, sha, [...new Set(comment)]);
	}
	return { lines: USAGE, code: 2 };
}

if (import.meta.main) {
	const { lines, code } = await work(process.argv.slice(2));
	(code === 2 ? console.error : console.log)(lines.join("\n"));
	process.exit(code);
}
