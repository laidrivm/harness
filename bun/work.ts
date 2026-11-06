#!/usr/bin/env bun
/**
 * `bun bun/work.ts <subcommand> …`, the commands a session works a card with:
 * a thin dispatcher reading each subcommand's arguments with a strict
 * `util.parseArgs`, one module per subcommand. Any argument it refuses prints
 * the usage and exits 2 before the subcommand runs.
 *
 * - `take --card <id> [--after <comment id>]` (`work-take.ts`): prints the
 *   card's context, ending with its newest comment's id; with `--after` that
 *   id, only what came after it.
 * - `finish [--card <id>] [--title <text> --body-file <path>]`
 *   (`work-finish.ts`): pushes the branch, opens its pull request as a draft
 *   when none is open, and marks it ready unless a question waits on the
 *   card; with no card, it reads none.
 * - `status --card <id> --to <status> [--why <reason>]` (`work-status.ts`):
 *   moves the card's `Status` once the evidence and the WIP limit allow it;
 *   `--why`, required with `--to discarded` and `--to idea` and refused with
 *   any other, is posted on the card before the write.
 * - `resolve --pr <n> --head <sha> --comment <id> …` (`work-resolve.ts`):
 *   resolves the review bot's threads those comments open, on the branch's
 *   open pull request while its head is `<sha>`.
 * - `draft --pr <n>` (`work-draft.ts`): marks open pull request `<n>` a draft
 *   as follow-up on it starts, and prints its head.
 */
import { type ParseArgsConfig, parseArgs } from "node:util";
import { ID } from "./notion-bot.ts";
import { draft } from "./work-draft.ts";
import { finish } from "./work-finish.ts";
import { resolve } from "./work-resolve.ts";
import { REASONED, STATUSES, status } from "./work-status.ts";
import { take } from "./work-take.ts";

export const USAGE = [
	"usage: work.ts take --card <id> [--after <comment id>]",
	"       work.ts finish [--card <id>] [--title <text> --body-file <path>]",
	"       work.ts status --card <id> --to <status> [--why <reason>, required with discarded and idea alone]",
	"       work.ts resolve --pr <n> --head <sha> --comment <id> [--comment <id> …]",
	"       work.ts draft --pr <n>",
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
		const set = values(rest, { card: { type: "string" }, after: { type: "string" } });
		const [card, after] = [set?.card, set?.after];
		if (typeof card === "string" && ID.test(card) && (after === undefined || ID.test(after))) return take(card, after);
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
		// `multiple` on `--why`, so a repeated one is refused rather than the last one kept.
		const set = values(rest, {
			card: { type: "string" },
			to: { type: "string" },
			why: { type: "string", multiple: true },
		});
		const [card, to, why = []] = [set?.card, set?.to, set?.why];
		// Required where the move posts a reason, and refused elsewhere.
		const reasoned = REASONED.includes(to ?? "") ? why.length === 1 && !!why[0]?.trim() : !why.length;
		if (typeof card === "string" && ID.test(card) && typeof to === "string" && STATUSES.includes(to) && reasoned)
			return status(card, to, why[0]);
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
	if (subcommand === "draft") {
		// `multiple`, so a repeated `--pr` is refused rather than the last one kept.
		const pr = values(rest, { pr: { type: "string", multiple: true } })?.pr ?? [];
		const [number] = pr;
		if (pr.length === 1 && number !== undefined && NUMBER.test(number)) return draft(number);
	}
	return { lines: USAGE, code: 2 };
}

if (import.meta.main) {
	const { lines, code } = await work(process.argv.slice(2));
	(code === 2 ? console.error : console.log)(lines.join("\n"));
	process.exit(code);
}
