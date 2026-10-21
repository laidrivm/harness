#!/usr/bin/env bun
/**
 * The ask command, `bun bun/notion-ask.ts <card id> <file>`: posts the question
 * in `<file>` on the card from the ask integration, whose settings are
 * `notion-ask.json` under the user's config home (task-board, *A session asks
 * through the ask integration where one is configured*). It checks the text as
 * the question gate does, reads the card's comments and posts nothing while a
 * question waits, then posts the comment. It reads no page and writes no
 * property: an integration with comment capabilities alone can do neither, so
 * the session sets `Assign` itself. It prints one line and exits 1 when it
 * posted nothing; no line holds the token.
 */
import { readFileSync } from "node:fs";
import { client, comment, failed, ID, settings, waiting } from "./notion-bot.ts";
import { ASK_SETTINGS, where } from "./question-gate.ts";

/** The line the command prints, and whether it posted. */
export async function ask(args: string[], timeout = 30_000): Promise<{ line: string; posted: boolean }> {
	const not = (why: string) => ({ line: `question: not posted — ${why}`, posted: false });
	if (args.length !== 2) return not("usage: notion-ask.ts <card id> <file>");
	const [card, file] = args;
	let found: ReturnType<typeof settings>;
	try {
		found = settings(where(ASK_SETTINGS));
	} catch (error) {
		return not((error as Error).message);
	}
	if (!found) return not("no ask integration is configured");
	if (!ID.test(card)) return not(`${card} is not a card id`);
	let text: string;
	try {
		text = readFileSync(file, "utf8").trim();
	} catch {
		return not(`${file} cannot be read`);
	}
	const fault = failed(text);
	if (fault) return not(fault);
	const call = client(found.token, timeout);
	try {
		if (await waiting(call, card, found.user)) return not(`a question already waits on ${card}`);
		await comment(call, card, text);
	} catch (error) {
		return not((error as Error).message);
	}
	return { line: `question: posted on ${card}`, posted: true };
}

if (import.meta.main) {
	const { line, posted } = await ask(process.argv.slice(2));
	console.log(line);
	process.exit(posted ? 0 : 1);
}
