#!/usr/bin/env bun
/**
 * The pause notice, `bun bun/notion-pause.ts <stop file> [<log>]`, which
 * `orchestrator/pass.sh`'s `pause()` runs where it writes a stop file
 * (`openspec/changes/pause-notice/design.md`). It posts one comment from the
 * runner's Notion integration, opening with `harness-pause` and mentioning the
 * user, on the card of the step the stop file's line names, then sets that
 * card's `Assign`; a line that names no step, or a step not exactly one card's
 * `Pointer` names, files a card of its own at `approved` on the `board` data
 * source and posts there. It prints one line and exits 0 whatever happens, and
 * no call is retried: a retry could post or file twice. No line holds the token.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { assign, type Call, client, comment, ID, plain, settings } from "./notion-bot.ts";
import { where } from "./question-gate.ts";

const MARK = "harness-pause";
/** A crashed runner's last line is arbitrary. */
const CUT = 1000;

/**
 * The slug of the step `line` names, read only from the runner's own line on
 * exit 1: the first `apply <slug> step <n>` after `board-loop: `, the target
 * `end()` puts before any session's words. Never from the log, which holds them.
 */
export function step(line: string): string | undefined {
	const read = /^\S+ exit (\d+): board-loop: (.*)$/.exec(line);
	if (read?.[1] !== "1") return undefined;
	return /\bapply ([a-z0-9][a-z0-9-]*) step \d+\b/.exec(read[2])?.[1];
}

/** The one card on `board` whose `Pointer` names `slug`, or why there is none. */
async function found(call: Call, board: string, slug: string): Promise<{ card: string } | { why: string }> {
	const pointer = `openspec/changes/${slug}/`;
	const listed = await call("the board's query", `/v1/data_sources/${board}/query`, "POST", {
		filter: { property: "Pointer", rich_text: { equals: pointer } },
	});
	// Exactly, as the pick reads it: the filter's match is Notion's, not this check's.
	const cards = (Array.isArray(listed?.results) ? listed.results : []).filter(
		(page: { properties?: { Pointer?: { rich_text?: unknown } } }) => plain(page?.properties?.Pointer?.rich_text) === pointer,
	);
	if (cards.length === 1 && typeof cards[0].id === "string" && ID.test(cards[0].id)) return { card: cards[0].id };
	return { why: cards.length ? `${cards.length} cards' Pointer names ${slug}` : `no card's Pointer names ${slug}` };
}

const paragraph = (content: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content } }] } });

/** The line the command prints for `<stop file> [<log>]`, its settings read from `path`. */
export async function notice(args: string[], path = where("notion-bot.json"), timeout = 30_000): Promise<string> {
	const not = (why: string) => `pause: no notice — ${why}`;
	if (args.length < 1 || args.length > 2) return not("usage: notion-pause.ts <stop file> [<log>]");
	const [stop, log] = args;
	let bot: ReturnType<typeof settings>;
	try {
		bot = settings(path);
	} catch (error) {
		return not((error as Error).message);
	}
	if (!bot) return not(`${path} is missing`);
	const { token, user, board } = bot;
	if (!board) return not(`${path} names no \`board\``);
	let line: string;
	try {
		line = readFileSync(stop, "utf8").split("\n")[0].slice(0, CUT);
	} catch {
		return not(`${stop} cannot be read`);
	}
	const clone = basename(stop).replace(/\.stop$/, "");
	const lines = [
		`The board loop paused the clone ${clone}: ${line}`,
		log ? `Log: ${log}` : "Log: no log, the pass did not start",
		`Resume: docker compose exec -u runner runner rm ${stop}, then clear this card's Assign`,
	];
	const text = `\`${MARK}\` ${lines.join("\n")}`;
	const call = client(token, timeout);
	const slug = step(line);
	let filed: string;
	try {
		const at = slug ? await found(call, board, slug) : { why: "the stop line names no step" };
		if ("card" in at) {
			await comment(call, at.card, text, MARK, user);
			try {
				await assign(call, at.card, user);
			} catch (error) {
				return `pause: notice posted on ${at.card}, Assign not set — ${(error as Error).message}`;
			}
			return `pause: notice posted on ${at.card}, Assign set`;
		}
		// No `Pointer`, so the pick never takes it.
		const page = await call("the card's creation", "/v1/pages", "POST", {
			parent: { type: "data_source_id", data_source_id: board },
			properties: {
				Name: { title: [{ text: { content: `The loop paused ${clone}` } }] },
				Status: { select: { name: "approved" } },
				Assign: { people: [{ id: user }] },
			},
			children: [...lines, `No step's card took this notice: ${at.why}.`].map(paragraph),
		});
		if (typeof page?.id !== "string" || !ID.test(page.id)) return not("the card's creation gave no Notion id");
		filed = page.id;
	} catch (error) {
		return not((error as Error).message);
	}
	try {
		await comment(call, filed, text, MARK, user);
	} catch (error) {
		return not(`${(error as Error).message} (new card ${filed} filed)`);
	}
	return `pause: notice posted on new card ${filed}`;
}

if (import.meta.main) {
	console.log(await notice(process.argv.slice(2)).catch((error: Error) => `pause: no notice — ${error.name}`));
	process.exit(0);
}
