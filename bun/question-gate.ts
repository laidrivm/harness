#!/usr/bin/env bun
/**
 * The question gate, a `PermissionRequest` hook on the connector's
 * `notion-create-comment` under any server name. It answers `allow` to the
 * prompt `policy-gate-beyond-bash`'s ask entry raises, only for a question to
 * the user on a board card (agent-permissions, *A question to the user on a
 * board card needs no prompt*); to anything else, in a session with a person
 * at the prompt, it gives no answer, so the prompt stands.
 *
 * It never answers `deny` where a person may be at the prompt: a call it does
 * not recognise is still one the user may approve there. Where the session's
 * first prompt declares it unattended (agent-autonomy), no prompt can be shown
 * and no answer is already a refusal, one Claude Code words as "do not retry".
 * There it answers `deny` instead, with a message naming the failed condition
 * and what would meet it, so the session can fix the comment and send it
 * again. Every fault — an unreadable event or transcript, a crash, a bun that
 * cannot start — is no answer, so the gate fails closed without `|| exit 2`.
 *
 * Each call is recorded in the gate ledger as `allowed`, `refused` or
 * `passed`, under the first condition that failed, or `question`. The ledger
 * is never read here.
 */
import { readFileSync } from "node:fs";
import { record } from "./gate-ledger.ts";

/** The mark a question opens with; the board loop's launch form names it. */
export const MARK = "`harness-question`";
const LIMIT = 1500;
const BOARDS = ["D2ASS", "Harness", "mellon"];
/** agent-autonomy's declared line, on a line of its own in the first prompt. */
const UNATTENDED = "This session runs unattended.";

/**
 * What is wrong with the call under each condition `verdict` fails, and what
 * would make it a question.
 */
const REMEDY: Record<string, string> = {
	reply: "it replies in a thread. Post a new page-level comment, without `discussion_id` or `reply_to_comment_id`.",
	anchored: "it is anchored on a passage. Send it without `selection_with_ellipsis`; the comment goes on the page.",
	"rich-text": "its text is `rich_text`. Send the text as `markdown`, not `rich_text`.",
	unmarked: `its text does not open with the mark. Send \`markdown\` that opens with ${MARK}, its backticks included, as its very first characters.`,
	mention: "it mentions a user. Send it with no user mention.",
	length: `it is too long. Keep \`markdown\` to at most ${LIMIT} characters, the mark included.`,
	"not-a-card": `this session has not read the page as a card. Fetch the card with \`notion-fetch\` first; the page's parent must be one of the boards ${BOARDS.join(", ")}.`,
	"comments-unread": "this session has not read the card's comments. Read them with `notion-get-comments` first.",
	unreadable: "the gate could not read the call's page. Send a `page_id` that holds the card's 32-hex id.",
};

/** The reason a `deny` carries for `rule`. */
const refusal = (rule: string) =>
	`question-gate refused this comment (${rule}): ${REMEDY[rule]} This refusal is the comment's, not the tool's: fix it and call \`notion-create-comment\` again.`;

/**
 * Whether the session's first prompt, the first user line holding text rather
 * than a tool result, holds the declared line on a line of its own. A
 * transcript it cannot read, or one with no prompt, reads as attended.
 */
function unattended(path: unknown): boolean {
	if (typeof path !== "string") return false;
	let lines: string[];
	try {
		lines = readFileSync(path, "utf8").split("\n");
	} catch {
		return false;
	}
	for (const line of lines) {
		let message: { role?: unknown; content?: unknown } | undefined;
		try {
			message = JSON.parse(line)?.message;
		} catch {
			continue;
		}
		if (message?.role !== "user") continue;
		const { content } = message;
		const parts = Array.isArray(content)
			? content.filter((part) => part?.type === "text" && typeof part.text === "string")
			: [];
		if (typeof content !== "string" && parts.length === 0) continue;
		const text = typeof content === "string" ? content : parts.map((part) => part.text).join("\n");
		return text.split("\n").includes(UNATTENDED);
	}
	return false;
}

type Input = Record<string, unknown>;
type Use = { name: string; input: Input; result?: string };

/** A Notion id as 32 lower-case hex digits, from an id or a URL holding one. */
const id = (value: unknown) =>
	typeof value === "string"
		? (value.toLowerCase().replaceAll("-", "").match(/[0-9a-f]{32}/g) ?? []).at(
				-1,
			)
		: undefined;

/**
 * Every tool use in the transcript, in order, with its result's text.
 *
 * shortcut: the transcript is Claude Code's own JSONL, whose shape is
 * undocumented — `tool_use` blocks in assistant lines, `tool_result` blocks in
 * user lines. A change to it makes every question `not-a-card`, which the
 * prompt then catches, or, in an unattended session, a refusal; never is one
 * let through; `unattended` reads a transcript with no prompt it knows as
 * attended. Upgrade when the
 * orchestrator's register records which cards a session holds.
 */
function uses(path: string): Use[] {
	const found = new Map<string, Use>();
	for (const line of readFileSync(path, "utf8").split("\n")) {
		let content: unknown;
		try {
			content = JSON.parse(line)?.message?.content;
		} catch {
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (const block of content) {
			// Ids are checked as strings: a use and a result that both lack one
			// would otherwise pair under the key `undefined`.
			if (
				block?.type === "tool_use" &&
				typeof block.id === "string" &&
				typeof block.name === "string"
			)
				found.set(block.id, { name: block.name, input: block.input ?? {} });
			const use =
				block?.type === "tool_result" &&
				typeof block.tool_use_id === "string" &&
				found.get(block.tool_use_id);
			if (use && !block.is_error)
				use.result =
					typeof block.content === "string"
						? block.content
						: (Array.isArray(block.content) ? block.content : [])
								.map((part: { text?: unknown }) =>
									typeof part?.text === "string" ? part.text : "",
								)
								.join("");
		}
	}
	return [...found.values()];
}

/**
 * The board a fetch result names, read from its ancestor path and never from
 * the card's content, which the card's author writes.
 */
function board(result: string): string | undefined {
	let text = result;
	try {
		const parsed = JSON.parse(result);
		if (typeof parsed?.text === "string") text = parsed.text;
	} catch {
		// Not the connector's JSON envelope: read the text as it is.
	}
	const path = text.split("<properties>")[0].split("<content>")[0];
	const ancestors = path.match(/<ancestor-path>([\s\S]*?)<\/ancestor-path>/);
	return ancestors?.[1].match(/<parent-data-source [^>]*name="([^"]*)"/)?.[1];
}

/** The first condition the call fails, or `question` when it fails none. */
function verdict(event: {
	tool_name?: unknown;
	tool_input?: Input;
	transcript_path?: unknown;
}): string {
	const input = event.tool_input;
	if (
		typeof event.tool_name !== "string" ||
		!/^mcp__.+__notion-create-comment$/.test(event.tool_name) ||
		typeof input !== "object" ||
		input === null
	)
		return "unreadable";
	if (input.discussion_id !== undefined || input.reply_to_comment_id !== undefined)
		return "reply";
	if (input.selection_with_ellipsis !== undefined) return "anchored";
	if (input.rich_text !== undefined) return "rich-text";
	const text = input.markdown;
	if (typeof text !== "string" || !text.startsWith(MARK)) return "unmarked";
	if (text.includes("<mention-user")) return "mention";
	if ([...text].length > LIMIT) return "length";
	const page = id(input.page_id);
	if (!page || typeof event.transcript_path !== "string") return "unreadable";
	let calls: Use[];
	try {
		calls = uses(event.transcript_path);
	} catch {
		return "unreadable";
	}
	// The latest call of `tool` on the page, failed or not: a read that failed
	// last leaves the session with no current view of the card.
	const latest = (tool: string) =>
		calls.findLast(
			(c) =>
				c.name.endsWith(`__${tool}`) &&
				id(tool === "notion-fetch" ? c.input.id : c.input.page_id) === page,
		);
	const fetch = latest("notion-fetch");
	if (!fetch?.result || !BOARDS.includes(board(fetch.result) ?? ""))
		return "not-a-card";
	if (latest("notion-get-comments")?.result === undefined)
		return "comments-unread";
	return "question";
}

if (import.meta.main) {
	let event: Parameters<typeof verdict>[0] | null = null;
	let rule = "unreadable";
	try {
		event = JSON.parse(await Bun.stdin.text());
		if (event) rule = verdict(event);
	} catch {
		// No answer, as the header says: an event this script cannot read
		// leaves the prompt standing.
	}
	// An event that is no object reads as attended, as a fault must.
	const decision =
		rule === "question"
			? "allowed"
			: unattended(event?.transcript_path)
				? "refused"
				: "passed";
	record("question-gate", decision, rule, event);
	const answer =
		decision === "allowed"
			? { behavior: "allow" }
			: decision === "refused"
				? { behavior: "deny", message: refusal(rule) }
				: undefined;
	if (answer)
		process.stdout.write(
			JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PermissionRequest",
					decision: answer,
				},
			}),
		);
}
