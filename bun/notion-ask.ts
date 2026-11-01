#!/usr/bin/env bun
/**
 * The ask command, `bun bun/notion-ask.ts <card id> <file>`: posts the question
 * in `<file>` on the card from the ask integration, whose settings are
 * `notion-ask.json` under the user's config home (task-board, *A session asks
 * through the ask integration where one is configured*). It checks the text as
 * the question gate does, posts the comment whatever questions already wait on
 * the card, then sets the card's `Assign` to the user alone and reads the user
 * back from that write's answer. It reads neither the page nor its comments,
 * and writes no property but `Assign`. It prints one line, exits 0 only when
 * the post and the write both held, and no line holds the token.
 */
import { readFileSync } from "node:fs";
import { assign, type Call, client, comment, failed, hex, ID, type Settings, settings } from "./notion-bot.ts";
import { ASK_SETTINGS, where } from "./question-gate.ts";
import { Transient } from "./transient.ts";

/**
 * The ask settings and a client over them, or why there are none: what the
 * ask command and `bun/work.ts` both read Notion through. `env` names the
 * config home, as `where()` reads it.
 */
export function integration(timeout = 30_000, env: Record<string, string | undefined> = process.env): { settings: Settings; call: Call } | string {
	let found: Settings | undefined;
	try {
		found = settings(where(ASK_SETTINGS, env));
	} catch (error) {
		return (error as Error).message;
	}
	if (!found) return "no ask integration is configured";
	return { settings: found, call: client(found.token, timeout) };
}

/** The line the command prints, and whether the post and the `Assign` write both held. */
export async function ask(args: string[], timeout = 30_000): Promise<{ line: string; ok: boolean }> {
	const not = (why: string) => ({ line: `question: not posted — ${why}`, ok: false });
	if (args.length !== 2) return not("usage: notion-ask.ts <card id> <file>");
	const [card, file] = args;
	const found = integration(timeout);
	if (typeof found === "string") return not(found);
	if (!ID.test(card)) return not(`${card} is not a card id`);
	let text: string;
	try {
		text = readFileSync(file, "utf8").trim();
	} catch {
		return not(`${file} cannot be read`);
	}
	const fault = failed(text);
	if (fault) return not(fault);
	try {
		await comment(found.call, card, text);
	} catch (error) {
		const why = (error as Error).message;
		// A 2xx whose body did not parse is `response.json()`'s SyntaxError: the post held.
		if (!(error instanceof SyntaxError)) {
			// No answer or a 5xx may have reached Notion; a 429 it refused unprocessed.
			if (error instanceof Transient && (error.status === undefined || error.status >= 500))
				return { line: `question: may be posted on ${card} — ${why}; read the card's comments before running it again`, ok: false };
			return not(why);
		}
	}
	const unset = (why: string) => ({ line: `question: posted on ${card}, Assign not set — ${why}`, ok: false });
	let written: { properties?: { Assign?: { people?: unknown } } } | undefined;
	try {
		written = await assign(found.call, card, found.settings.user);
	} catch (error) {
		return unset((error as Error).message);
	}
	const people = written?.properties?.Assign?.people;
	if (!Array.isArray(people) || !people.some((person) => hex(person?.id) === hex(found.settings.user)))
		return unset("the Assign write did not hold the user");
	return { line: `question: posted on ${card}, Assign set`, ok: true };
}

if (import.meta.main) {
	const { line, ok } = await ask(process.argv.slice(2));
	console.log(line);
	process.exit(ok ? 0 : 1);
}
