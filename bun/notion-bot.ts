/**
 * The board loop's Notion integration: the settings file the runner reads,
 * re-exported from `notion-bot-settings.ts`, the
 * `QUESTION:` line it reads from a stage session's final message, and the five
 * REST calls that post the question from the integration and set `Assign`
 * (`openspec/changes/archive/2026-10-22-notion-bot-questions/design.md`). The ask command makes
 * two of those calls with its own settings; the pause notice, the comment and
 * the `Assign` write with the runner's, and `notion-unassign.ts` steps 1 and 2,
 * its `Assign` write being `release()` in `notion-release.ts`, which the work
 * commands share. The token reaches `fetch` only as a
 * header, and no line this module prints or throws holds it.
 */
import { ID, type Settings } from "./notion-bot-settings.ts";
import { fault, REMEDY } from "./question-gate.ts";
import { Transient, answered as transientStatus } from "./transient.ts";

export { ID, type Settings, settings } from "./notion-bot-settings.ts";

const VERSION = "2025-09-03";
export type Asked = { card: string; text: string };

/**
 * The question a final message names, `undefined` when it names none, or why
 * nothing is posted. Untrusted text, read as `named()` reads the title: one
 * `QUESTION:` line before any `PR-TITLE:` or `PR-BODY:`, and the text below it to a
 * `PR-TITLE:` line or the end, checked as the question gate checks a comment's.
 */
export function asked(said: string): Asked | string | undefined {
	const lines = said.split("\n");
	const [at, ...more] = lines.flatMap((line, i) => (line.startsWith("QUESTION:") ? [{ i, line }] : []));
	if (!at) return undefined;
	if (more.length) return "the final message holds more than one QUESTION: line";
	const body = lines.findIndex((line) => line.startsWith("PR-BODY:"));
	if (body !== -1 && body < at.i) return "the QUESTION: line comes after PR-BODY:";
	const title = lines.findIndex((line) => line.startsWith("PR-TITLE:"));
	if (title !== -1 && title < at.i) return "the QUESTION: line comes after PR-TITLE:";
	const card = at.line.slice("QUESTION:".length).trim();
	if (!ID.test(card)) return "the QUESTION: line names no card id";
	const below = lines.slice(at.i + 1);
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

type Property = { rich_text?: unknown; title?: unknown; select?: { name?: unknown }; people?: unknown } | undefined;
/** A card page, a page of a list and a board's data source as the API returns them: untrusted, each field checked where read. */
export type Page = { id?: unknown; parent?: Parent; properties?: Record<string, Property> };
type Parent = { type?: unknown; data_source_id?: unknown };
export type Listed = { results?: unknown; has_more?: unknown; next_cursor?: unknown } | null;
export type Board = { title?: unknown } | null;

export const plain = (runs: unknown) =>
	Array.isArray(runs)
		? runs.map((run: Run) => (typeof run?.plain_text === "string" ? run.plain_text : "")).join("")
		: "";
/** An id as 32 lower-case hex digits: the settings take either form, the API gives a UUID. */
export const hex = (id: unknown) => (typeof id === "string" ? id.replaceAll("-", "").toLowerCase() : "");
const by = (comment: Comment, id: string) => hex(comment.created_by?.id) === hex(id);
/** Whether `comment` opens with `mark` as the API shows it: a code run of it, or text opening with it backticked. */
const opens = (mark: string) => (comment: Comment) => {
	const first = comment.rich_text?.[0];
	return (
		(first?.annotations?.code === true && first.plain_text === mark) ||
		plain(comment.rich_text).startsWith(`\`${mark}\``)
	);
};
const marked = opens("harness-question");
const answered = opens("harness-answer");

/** `comments` oldest first; stable, so ties keep the order the API returned them. */
export const oldest = (comments: Comment[]) =>
	comments.toSorted((a, b) => String(a.created_time).localeCompare(String(b.created_time)));

/**
 * Whether the last comment opening with `mark`, a question by default, has no
 * answer after it: no comment by `user` that opens with neither mark nor
 * `mark`, and no `harness-answer` by `self`, the integration's own id, when
 * one was read.
 */
export function waits(comments: Comment[], user: string, self?: string, mark = "harness-question"): boolean {
	const ordered = oldest(comments);
	const asks = opens(mark);
	const last = ordered.findLastIndex(asks);
	return (
		last !== -1 &&
		!ordered
			.slice(last + 1)
			.some(
				(c) =>
					(!asks(c) && !marked(c) && !answered(c) && by(c, user)) || (self !== undefined && answered(c) && by(c, self)),
			)
	);
}

/**
 * A REST call with `token`, which throws naming the step and Notion's status
 * or the error's name: a `Transient` for no answer, the timeout, a 5xx or a 429.
 * `version` is Notion's API version for every call it makes.
 */
export function client(token: string, timeout = 30_000, version = VERSION) {
	const base = process.env.HARNESS_NOTION_API_URL || "https://api.notion.com";
	// `T` names the fields a caller reads, each typed `unknown` or optional, since Notion's body is untrusted JSON.
	return async <T = unknown>(step: string, path: string, method = "GET", body?: unknown): Promise<T> => {
		// Parsed outside the catch: a malformed HARNESS_NOTION_API_URL is a plain Error, so a rejected fetch is only the network.
		const url = new URL(`${base}${path}`);
		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers: { Authorization: `Bearer ${token}`, "Notion-Version": version, "Content-Type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(timeout),
			});
		} catch (error) {
			// The name alone: a message may quote the request.
			throw new Transient(`${step} failed: ${(error as Error).name}`);
		}
		if (!response.ok) {
			const why = `${step} answered ${response.status}`;
			throw transientStatus(response.status) ? new Transient(why, response.status) : new Error(why);
		}
		try {
			return (await response.json()) as T;
		} catch (error) {
			// The name alone, never the body, which is untrusted text.
			throw new Unread(
				`${step} answered ${response.status} with a body that could not be read: ${(error as Error).name}`,
			);
		}
	};
}
export type Call = ReturnType<typeof client>;

/** A call Notion answered with a 2xx whose body could not be read, as JSON or at all: the call held. */
export class Unread extends Error {}

/** Sets the card's `Assign` to `user` alone. */
export const assign = (call: Call, card: string, user: string) =>
	call<Page | null>("the Assign write", `/v1/pages/${card}`, "PATCH", {
		properties: { Assign: { people: [{ id: user }] } },
	});

/** The integration's own id, read with `token`; throws naming the step, as `client` does. */
export async function own(token: string, timeout = 30_000): Promise<string> {
	const me = await client(token, timeout)<{ id?: unknown } | null>("the integration's id read", "/v1/users/me");
	if (typeof me?.id !== "string" || !ID.test(me.id)) throw new Error("the integration's id read gave no Notion id");
	return me.id;
}

/** REST step 3: every page of the card's comments, then whether a question waits there for `user`. */
export async function waiting(call: Call, card: string, user: string, self?: string): Promise<boolean> {
	return waits(await discussion(call, card), user, self);
}

/** Every page of the card's page-level comments, following `next_cursor`. */
export const discussion = (call: Call, card: string): Promise<Comment[]> =>
	paged<Comment>(call, "the comments read", `/v1/comments?block_id=${card}`);

/** Every page of the list `path` answers, read under `step`, the cursor joined to `path` as its query needs. */
export async function paged<T = unknown>(call: Call, step: string, path: string): Promise<T[]> {
	const results: T[] = [];
	const read = new Set<string>();
	let cursor: string | undefined;
	do {
		const at = cursor ? `${path.includes("?") ? "&" : "?"}start_cursor=${encodeURIComponent(cursor)}` : "";
		const listed = await call<Listed>(step, `${path}${at}`);
		results.push(...(Array.isArray(listed?.results) ? listed.results : []));
		cursor = undefined;
		if (listed?.has_more) {
			const next = listed.next_cursor;
			// More pages behind no cursor would end the read short; behind one already read, never end it.
			if (typeof next !== "string" || !next || read.has(next)) throw new Error(`${step} gave no new cursor`);
			cursor = next;
			read.add(next);
		}
	} while (cursor);
	return results;
}

/**
 * REST step 4: the page-level comment, a code-annotated run of `mark`, which
 * `text` opens with backticked, a mention of `mention` when one is named, then
 * the rest of the text, in runs of the 2000 characters Notion takes in one.
 */
export function comment(
	call: Call,
	card: string,
	text: string,
	mark = "harness-question",
	mention?: string,
): Promise<unknown> {
	const rest = text.slice(mark.length + 2).match(/[\s\S]{1,2000}/g) ?? [];
	return call(mark === "harness-answer" ? "the answer's post" : "the comment's post", "/v1/comments", "POST", {
		parent: { page_id: card },
		rich_text: [
			{ type: "text", text: { content: mark }, annotations: { code: true } },
			...(mention ? [{ type: "mention", mention: { type: "user", user: { id: mention } } }] : []),
			...rest.map((content) => ({ type: "text", text: { content } })),
		],
	});
}

/** What the triage left: an answer the runner checked, and the line it prints. */
export type Triaged = { answer?: { source: string; quote: string; text: string }; note: string };

/** REST steps 1 and 2: why `card` is not the carried change's card on `board`, or `undefined`. */
export async function carded(call: Call, card: string, board: string, slug: string): Promise<string | undefined> {
	const page = await call<Page | null>("the page read", `/v1/pages/${card}`);
	if (page?.parent?.type !== "data_source_id") return `${card} is not a card on a board`;
	if (plain(page.properties?.Pointer?.rich_text) !== `openspec/changes/${slug}/`)
		return `${card} is not the card of ${slug}`;
	const source = await call<Board>("the board read", `/v1/data_sources/${page.parent.data_source_id}`);
	if (plain(source?.title) !== board) return `${card} is not on the board ${board}`;
}

/** How `post()`'s line opens for a question it posted, and for one it found already waiting. */
export const POSTED = "question: posted on";
export const ALREADY = "question: not posted — a question already waits on";
/** How it opens when Notion did not answer a read or the question's comment: the pass ends `retry`. */
export const UNREACHED = "question: not posted — Notion did not answer:";

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
			const fresh = (c: Comment) =>
				!known.has(c.id) && (marked(c) || (self !== undefined && answered(c) && by(c, self)));
			if ((await discussion(call, card)).some(fresh)) return not("the card changed during the triage");
		}
		await comment(call, card, text);
	} catch (error) {
		return error instanceof Transient ? say(`${UNREACHED} ${error.message}`) : not((error as Error).message);
	}
	if (answer) {
		const quoted = answer.quote
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
		try {
			await comment(
				call,
				card,
				`\`harness-answer\` ${answer.text}\n${quoted}\nSource: ${answer.source}`,
				"harness-answer",
			);
			return say(`${POSTED} ${card} and answered from ${answer.source}`);
		} catch (error) {
			// The question stands with no answer: it waits for the user, as on `ESCALATE`.
			said.push(`answer: not posted — ${(error as Error).message}`);
		}
	}
	try {
		await assign(call, card, user);
	} catch (error) {
		return say(`${POSTED} ${card}, Assign not set — ${(error as Error).message}`);
	}
	return say(`${POSTED} ${card}, Assign set`);
}
