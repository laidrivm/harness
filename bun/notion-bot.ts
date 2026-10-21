/**
 * The board loop's Notion integration: the settings file the runner reads, the
 * `QUESTION:` line it reads from a stage session's final message, and the five
 * REST calls that post the question from the integration and set `Assign`
 * (`openspec/changes/notion-bot-questions/design.md`). The token reaches
 * `fetch` only as a header, and no line this module prints or throws holds it.
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fault, MARK, REMEDY } from "./question-gate.ts";

const VERSION = "2025-09-03";
/** A Notion id, as a whole value: 32 hex digits, alone or in a UUID's form. */
const ID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type Settings = { token: string; user: string };
export type Asked = { card: string; text: string };

/** `name` under the user's config home: `XDG_CONFIG_HOME`, else `~/.config`. */
export const where = (name: string, env: Record<string, string | undefined> = process.env) =>
	join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config"), "harness", name);

/**
 * The settings at `path`, or `undefined` when no file is there. A file the
 * runner cannot use throws, naming the file and the key at fault, never a value.
 */
export function settings(path: string): Settings | undefined {
	let mode: number;
	try {
		const stat = statSync(path);
		if (!stat.isFile()) throw new Error(`notion-bot: ${path} is not a file`);
		mode = stat.mode & 0o777;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	// On the VPS the session user shares the runner's group, so group access is the session's.
	if (mode & 0o077)
		throw new Error(`notion-bot: ${path} has mode 0${mode.toString(8)}, which its group or others may read — chmod 600 it`);
	let value: { token?: unknown; user?: unknown } | null;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`notion-bot: ${path} cannot be read as JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error(`notion-bot: ${path} holds no JSON object`);
	const { token, user } = value;
	if (typeof token !== "string" || !/^\S+$/.test(token))
		throw new Error(`notion-bot: ${path}: \`token\` is not a non-empty string without whitespace`);
	if (typeof user !== "string" || !ID.test(user))
		throw new Error(`notion-bot: ${path}: \`user\` is not 32 hex digits, alone or as a UUID`);
	return { token, user };
}

/**
 * The question a final message names, `undefined` when it names none, or why
 * nothing is posted. Untrusted text, read as `named()` reads the title: one
 * `QUESTION:` line before any `PR-BODY:`, and the text below it to a
 * `PR-TITLE:` line or the end, checked as the question gate checks a comment's.
 */
export function asked(said: string): Asked | string | undefined {
	const lines = said.split("\n");
	const at = lines.flatMap((line, i) => (line.startsWith("QUESTION:") ? [i] : []));
	if (!at.length) return undefined;
	if (at.length > 1) return "the final message holds more than one QUESTION: line";
	const body = lines.findIndex((line) => line.startsWith("PR-BODY:"));
	if (body !== -1 && body < at[0]) return "the QUESTION: line comes after PR-BODY:";
	const card = lines[at[0]].slice("QUESTION:".length).trim();
	if (!ID.test(card)) return "the QUESTION: line names no card id";
	const below = lines.slice(at[0] + 1);
	const end = below.findIndex((line) => line.startsWith("PR-TITLE:"));
	const text = (end === -1 ? below : below.slice(0, end)).join("\n").trim();
	const rule = fault(text);
	if (rule) return `the question fails the question gate (${rule}): ${REMEDY[rule]}`;
	return { card, text };
}

type Run = { plain_text?: unknown; annotations?: { code?: unknown } };
type Comment = { created_by?: { id?: unknown }; created_time?: unknown; rich_text?: Run[] };

const plain = (runs: unknown) =>
	Array.isArray(runs) ? runs.map((run: Run) => (typeof run?.plain_text === "string" ? run.plain_text : "")).join("") : "";
/** An id as 32 lower-case hex digits: the settings take either form, the API gives a UUID. */
const hex = (id: unknown) => (typeof id === "string" ? id.replaceAll("-", "").toLowerCase() : "");
/** A question as the API shows one: a code run of the mark, or text opening with the backticked mark. */
const marked = (comment: Comment) => {
	const first = comment.rich_text?.[0];
	return (first?.annotations?.code === true && first.plain_text === "harness-question") || plain(comment.rich_text).startsWith(MARK);
};

/** Whether the last question has no comment after it by `user` that does not open with the mark. */
function waits(comments: Comment[], user: string): boolean {
	// Stable: ties keep the order the API returned them.
	const ordered = comments.toSorted((a, b) => String(a.created_time).localeCompare(String(b.created_time)));
	const last = ordered.findLastIndex(marked);
	return last !== -1 && !ordered.slice(last + 1).some((c) => !marked(c) && hex(c.created_by?.id) === hex(user));
}

/**
 * Posts `asked` on its card from the integration and sets `Assign` to the
 * user, after checking the card is the carried change's on `board` and no
 * question waits there. Returns the one line the runner prints. No call is
 * retried: a second post would put two questions on the card.
 */
export async function post(
	{ token, user }: Settings,
	{ card, text }: Asked,
	{ board, slug }: { board: string; slug: string },
	timeout = 30_000,
): Promise<string> {
	const base = process.env.HARNESS_NOTION_API_URL || "https://api.notion.com";
	const call = async (step: string, path: string, method = "GET", body?: unknown) => {
		let response: Response;
		try {
			response = await fetch(`${base}${path}`, {
				method,
				headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(timeout),
			});
		} catch (error) {
			// The name alone: a message may quote the request.
			throw new Error(`${step} failed: ${(error as Error).name}`);
		}
		if (!response.ok) throw new Error(`${step} answered ${response.status}`);
		return response.json();
	};
	const not = (why: string) => `question: not posted — ${why}`;
	try {
		const page = await call("the page read", `/v1/pages/${card}`);
		if (page?.parent?.type !== "data_source_id") return not(`${card} is not a card on a board`);
		if (plain(page.properties?.Pointer?.rich_text) !== `openspec/changes/${slug}/`)
			return not(`${card} is not the card of ${slug}`);
		const source = await call("the board read", `/v1/data_sources/${page.parent.data_source_id}`);
		if (plain(source?.title) !== board) return not(`${card} is not on the board ${board}`);
		const comments: Comment[] = [];
		let cursor: string | undefined;
		do {
			const at = cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : "";
			const listed = await call("the comments read", `/v1/comments?block_id=${card}${at}`);
			comments.push(...(Array.isArray(listed?.results) ? listed.results : []));
			cursor = listed?.has_more && typeof listed.next_cursor === "string" ? listed.next_cursor : undefined;
		} while (cursor);
		if (waits(comments, user)) return not(`a question already waits on ${card}`);
		const rest = text.slice(MARK.length);
		await call("the comment's post", "/v1/comments", "POST", {
			parent: { page_id: card },
			rich_text: [
				{ type: "text", text: { content: "harness-question" }, annotations: { code: true } },
				...(rest ? [{ type: "text", text: { content: rest } }] : []),
			],
		});
	} catch (error) {
		return not((error as Error).message);
	}
	try {
		await call("the Assign write", `/v1/pages/${card}`, "PATCH", { properties: { Assign: { people: [{ id: user }] } } });
	} catch (error) {
		return `question: posted on ${card}, Assign not set — ${(error as Error).message}`;
	}
	return `question: posted on ${card}, Assign set`;
}
