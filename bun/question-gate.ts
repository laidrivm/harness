#!/usr/bin/env bun
/**
 * The question gate, a `PermissionRequest` hook on the connector's
 * `notion-create-comment` under any server name. It answers `allow` to the
 * prompt `policy-gate-beyond-bash`'s ask entry raises, only for a question to
 * the user on a board card (agent-permissions, *A question to the user on a
 * board card needs no prompt*); to anything else it gives no answer, so the
 * prompt stands, or, where a session cannot show one, the call is refused.
 *
 * It never answers `deny`: a call it does not recognise is still one the user
 * may approve at the prompt. Every fault — an unreadable event or transcript,
 * a crash, a bun that cannot start — is also no answer, so the gate fails
 * closed without `|| exit 2`.
 *
 * Each call is recorded in the gate ledger as `allowed` or `passed`, under the
 * first condition that failed, or `question`. The ledger is never read here.
 */
import { readFileSync } from "node:fs";
import { record } from "./gate-ledger.ts";

const MARK = "`harness-question`";
const LIMIT = 1500;
const BOARDS = ["D2ASS", "Harness", "mellon"];

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
 * prompt then catches, rather than letting one through. Upgrade when the
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
			if (block?.type === "tool_use" && typeof block.name === "string")
				found.set(block.id, { name: block.name, input: block.input ?? {} });
			const use = block?.type === "tool_result" && found.get(block.tool_use_id);
			if (use && !block.is_error)
				use.result = (Array.isArray(block.content) ? block.content : [block])
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
	const of = (tool: string) =>
		calls.filter(
			(c) =>
				c.name.endsWith(`__${tool}`) &&
				c.result !== undefined &&
				id(tool === "notion-fetch" ? c.input.id : c.input.page_id) === page,
		);
	const fetch = of("notion-fetch").at(-1);
	if (!fetch?.result || !BOARDS.includes(board(fetch.result) ?? ""))
		return "not-a-card";
	if (of("notion-get-comments").length === 0) return "comments-unread";
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
	const allowed = rule === "question";
	record("question-gate", allowed ? "allowed" : "passed", rule, event);
	if (allowed)
		process.stdout.write(
			JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PermissionRequest",
					decision: { behavior: "allow" },
				},
			}),
		);
}
