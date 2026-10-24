/**
 * The board loop's Notion integration: the settings file the runner reads, the
 * `QUESTION:` line it reads from a stage session's final message, and the five
 * REST calls that post the question from the integration and set `Assign`
 * (`openspec/changes/archive/2026-10-22-notion-bot-questions/design.md`). The ask command makes
 * two of those calls with its own settings. The token reaches `fetch` only as a
 * header, and no line this module prints or throws holds it.
 */
import { readFileSync, statSync } from "node:fs";
import { fault, REMEDY } from "./question-gate.ts";

const VERSION = "2025-09-03";
/** A Notion id, as a whole value: 32 hex digits, alone or in a UUID's form. */
export const ID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `self`: the integration's own id, read with `own()`; none reads no `harness-answer` as an answer. */
export type Settings = { token: string; user: string; self?: string };
export type Asked = { card: string; text: string };

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
 * `QUESTION:` line before any `PR-TITLE:` or `PR-BODY:`, and the text below it to a
 * `PR-TITLE:` line or the end, checked as the question gate checks a comment's.
 */
export function asked(said: string): Asked | string | undefined {
	const lines = said.split("\n");
	const at = lines.flatMap((line, i) => (line.startsWith("QUESTION:") ? [i] : []));
	if (!at.length) return undefined;
	if (at.length > 1) return "the final message holds more than one QUESTION: line";
	const body = lines.findIndex((line) => line.startsWith("PR-BODY:"));
	if (body !== -1 && body < at[0]) return "the QUESTION: line comes after PR-BODY:";
	const title = lines.findIndex((line) => line.startsWith("PR-TITLE:"));
	if (title !== -1 && title < at[0]) return "the QUESTION: line comes after PR-TITLE:";
	const card = lines[at[0]].slice("QUESTION:".length).trim();
	if (!ID.test(card)) return "the QUESTION: line names no card id";
	const below = lines.slice(at[0] + 1);
	const end = below.findIndex((line) => line.startsWith("PR-TITLE:"));
	const text = (end === -1 ? below : below.slice(0, end)).join("\n").trim();
	return failed(text) ?? { card, text };
}

/** Why the question gate's text checks refuse `text`, in its words, or `undefined`. */
export function failed(text: string): string | undefined {
	const rule = fault(text);
	if (rule) return `the question fails the question gate (${rule}): ${REMEDY[rule]}`;
}

type Run = { plain_text?: unknown; annotations?: { code?: unknown } };
/** A comment as the API returns it: untrusted, so every field is checked where it is read. */
export type Comment = { id?: unknown; created_by?: { id?: unknown }; created_time?: unknown; rich_text?: Run[] };

export const plain = (runs: unknown) =>
	Array.isArray(runs) ? runs.map((run: Run) => (typeof run?.plain_text === "string" ? run.plain_text : "")).join("") : "";
/** An id as 32 lower-case hex digits: the settings take either form, the API gives a UUID. */
export const hex = (id: unknown) => (typeof id === "string" ? id.replaceAll("-", "").toLowerCase() : "");
const by = (comment: Comment, id: string) => hex(comment.created_by?.id) === hex(id);
/** Whether `comment` opens with `mark` as the API shows it: a code run of it, or text opening with it backticked. */
const opens = (mark: string) => (comment: Comment) => {
	const first = comment.rich_text?.[0];
	return (first?.annotations?.code === true && first.plain_text === mark) || plain(comment.rich_text).startsWith(`\`${mark}\``);
};
const marked = opens("harness-question");
const answered = opens("harness-answer");

/**
 * Whether the last question has no answer after it: no comment by `user` that
 * opens with neither mark, and no `harness-answer` by `self`, the
 * integration's own id, when one was read.
 */
function waits(comments: Comment[], user: string, self?: string): boolean {
	// Stable: ties keep the order the API returned them.
	const ordered = comments.toSorted((a, b) => String(a.created_time).localeCompare(String(b.created_time)));
	const last = ordered.findLastIndex(marked);
	return (
		last !== -1 &&
		!ordered.slice(last + 1).some((c) => (!marked(c) && !answered(c) && by(c, user)) || (self !== undefined && answered(c) && by(c, self)))
	);
}

/** A REST call with `token`, which throws naming the step and Notion's status or the error's name. */
export function client(token: string, timeout = 30_000) {
	const base = process.env.HARNESS_NOTION_API_URL || "https://api.notion.com";
	return async (step: string, path: string, method = "GET", body?: unknown) => {
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
}
type Call = ReturnType<typeof client>;

/** The integration's own id, read with `token`; throws naming the step, as `client` does. */
export async function own(token: string, timeout = 30_000): Promise<string> {
	const me = await client(token, timeout)("the integration's id read", "/v1/users/me");
	if (typeof me?.id !== "string" || !ID.test(me.id)) throw new Error("the integration's id read gave no Notion id");
	return me.id;
}

/** REST step 3: every page of the card's comments, then whether a question waits there for `user`. */
export async function waiting(call: Call, card: string, user: string, self?: string): Promise<boolean> {
	return waits(await discussion(call, card), user, self);
}

/** Every page of the card's page-level comments, following `next_cursor`. */
async function discussion(call: Call, card: string): Promise<Comment[]> {
	const comments: Comment[] = [];
	const read = new Set<string>();
	let cursor: string | undefined;
	do {
		const at = cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : "";
		const listed = await call("the comments read", `/v1/comments?block_id=${card}${at}`);
		comments.push(...(Array.isArray(listed?.results) ? listed.results : []));
		// More pages behind no cursor would end the read short; behind one already read, never end it.
		if (listed?.has_more && (typeof listed.next_cursor !== "string" || !listed.next_cursor || read.has(listed.next_cursor)))
			throw new Error("the comments read gave no new cursor");
		cursor = listed?.has_more ? listed.next_cursor : undefined;
		if (cursor) read.add(cursor);
	} while (cursor);
	return comments;
}

type Out = { type: "text"; text: { content: string; link?: { url: string } }; annotations?: { code?: true; bold?: true; italic?: true } };

/** `s` in pieces of at most the 2000 code units Notion takes in one run, never cutting a surrogate pair. */
function pieces(s: string): string[] {
	const out: string[] = [];
	while (s) {
		const n = s.length > 2000 && /[\uD800-\uDBFF]/.test(s[1999]) ? 1999 : 2000;
		out.push(s.slice(0, n));
		s = s.slice(n);
	}
	return out;
}

/**
 * `text`'s markdown as rich_text runs, since a comment renders no markdown:
 * inline code, bold and italic become annotations, an http(s) link a linked
 * run, a heading line a bold one, the rest stays plain, in runs of the 2000
 * characters Notion takes in one.
 */
export function runs(text: string): Out[] {
	const out: Out[] = [];
	// `*` italic opens on a non-space, so a `* ` bullet stays plain; `_` italic needs a non-word edge, so snake_case does.
	const token = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|(?<!\w)_[^_\s][^_\n]*_(?!\w)|\[[^\]\n]+\]\(https?:\/\/(?:[^()\s]|\([^()\s]*\))+\))/;
	// a heading line is parsed like any text and its runs made bold: wrapping it in `**` breaks on an inner `*`
	text.split(/^#{1,6} +(.+)$/m).forEach((line, h) =>
		line.split(token).forEach((part, i) => {
			// split puts each captured part at an odd index
			const kind = i % 2 === 0 ? undefined : part[0] === "`" ? "code" : part.startsWith("**") ? "bold" : part[0] === "[" ? "link" : "italic";
			const link = kind === "link" ? /^\[(.+)\]\((.+)\)$/.exec(part) : null;
			const cut = kind === "bold" ? 2 : kind ? 1 : 0;
			const content = link ? link[1] : part.slice(cut, part.length - cut);
			const marks = { ...(kind && kind !== "link" ? { [kind]: true } : {}), ...(h % 2 ? { bold: true } : {}) };
			for (const piece of pieces(content))
				out.push({
					type: "text",
					text: link ? { content: piece, link: { url: link[2] } } : { content: piece },
					...(Object.keys(marks).length ? { annotations: marks } : {}),
				});
		}),
	);
	return out;
}

/**
 * REST step 4: the page-level comment, a code-annotated run of `mark`, which
 * `text` opens with backticked, then the rest of the text as `runs` — or as
 * plain pieces when those runs would pass the 100 rich_text objects Notion takes.
 */
export function comment(call: Call, card: string, text: string, mark = "harness-question"): Promise<unknown> {
	const rest = text.slice(mark.length + 2);
	const formatted = runs(rest);
	const body = formatted.length < 100 ? formatted : pieces(rest).map((content): Out => ({ type: "text", text: { content } }));
	return call(mark === "harness-answer" ? "the answer's post" : "the comment's post", "/v1/comments", "POST", {
		parent: { page_id: card },
		rich_text: [{ type: "text", text: { content: mark }, annotations: { code: true } }, ...body],
	});
}

/** What the triage left: an answer the runner checked, and the line it prints. */
export type Triaged = { answer?: { source: string; quote: string; text: string }; note: string };

/** REST steps 1 and 2: why `card` is not the carried change's card on `board`, or `undefined`. */
async function carded(call: Call, card: string, board: string, slug: string): Promise<string | undefined> {
	const page = await call("the page read", `/v1/pages/${card}`);
	if (page?.parent?.type !== "data_source_id") return `${card} is not a card on a board`;
	if (plain(page.properties?.Pointer?.rich_text) !== `openspec/changes/${slug}/`) return `${card} is not the card of ${slug}`;
	const source = await call("the board read", `/v1/data_sources/${page.parent.data_source_id}`);
	if (plain(source?.title) !== board) return `${card} is not on the board ${board}`;
}

/** How `post()`'s line opens for a question it posted, and for one it found already waiting. */
export const POSTED = "question: posted on";
export const ALREADY = "question: not posted — a question already waits on";

/**
 * Posts `asked` on its card from the integration and sets `Assign` to the
 * user, after checking the card is the carried change's on `board` and no
 * question waits there. With `triage`, its answer, when the runner checked
 * one, follows the question instead of `Assign`, and steps 1 to 3 run again
 * first, since the triage was judged against the card as it was. Returns the
 * lines the runner prints. No call is retried: a second post would put two
 * questions on the card.
 */
export async function post(
	{ token, user, self }: Settings,
	{ card, text }: Asked,
	{ board, slug }: { board: string; slug: string },
	timeout = 30_000,
	triage?: (comments: Comment[]) => Promise<Triaged>,
): Promise<string> {
	const call = client(token, timeout);
	const said: string[] = [];
	const say = (line: string) => [...said, line].join("\n");
	const not = (why: string) => say(`question: not posted — ${why}`);
	let answer: Triaged["answer"];
	try {
		const why = await carded(call, card, board, slug);
		if (why) return not(why);
		const before = await discussion(call, card);
		if (waits(before, user, self)) return say(`${ALREADY} ${card}`);
		if (triage) {
			const ended = await triage(before);
			said.push(ended.note);
			answer = ended.answer;
			const moved = await carded(call, card, board, slug);
			if (moved) return not(moved);
			// A `harness-answer` from anyone but the integration is plain text, and suppresses nothing.
			const known = new Set(before.map((c) => c.id));
			const fresh = (c: Comment) => !known.has(c.id) && (marked(c) || (self !== undefined && answered(c) && by(c, self)));
			if ((await discussion(call, card)).some(fresh)) return not("the card changed during the triage");
		}
		await comment(call, card, text);
	} catch (error) {
		return not((error as Error).message);
	}
	if (answer) {
		const quoted = answer.quote.split("\n").map((line) => `> ${line}`).join("\n");
		try {
			await comment(call, card, `\`harness-answer\` ${answer.text}\n${quoted}\nSource: ${answer.source}`, "harness-answer");
			return say(`${POSTED} ${card} and answered from ${answer.source}`);
		} catch (error) {
			// The question stands with no answer: it waits for the user, as on `ESCALATE`.
			said.push(`answer: not posted — ${(error as Error).message}`);
		}
	}
	try {
		await call("the Assign write", `/v1/pages/${card}`, "PATCH", { properties: { Assign: { people: [{ id: user }] } } });
	} catch (error) {
		return say(`${POSTED} ${card}, Assign not set — ${(error as Error).message}`);
	}
	return say(`${POSTED} ${card}, Assign set`);
}
