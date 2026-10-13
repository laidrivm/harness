/**
 * The question gate on the comment's own envelope: what it answers, how, and
 * what it records. The board and the comments read are
 * `question-gate-board.test.ts`'s; every case here reads the card first.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	ALLOW,
	CARD,
	MARK,
	QUESTION,
	asked,
	cleanup,
	event,
	run,
} from "./question-gate.fixture.ts";

afterAll(cleanup);

/** A question of exactly `length` characters, the mark included. */
const sized = (length: number) =>
	asked({ markdown: `${MARK} ${"q".repeat(length - MARK.length - 1)}` });

describe("a question", () => {
	// spec: agent-permissions/a-question-on-a-card
	test("is answered allow, as the decision object, with exit 0 [5] [18]", () => {
		const { code, out } = run(asked());
		expect({ code, out: JSON.parse(out) }).toEqual({ code: 0, out: ALLOW });
	});

	test("is recorded allowed under the rule question [20]", () => {
		expect(run(asked()).ledger).toEqual([
			expect.objectContaining({
				gate: "question-gate",
				decision: "allowed",
				rule: "question",
			}),
		]);
	});

	// spec: agent-permissions/a-comment-over-the-length-bound
	test("of exactly 1500 characters is allowed [11]", () => {
		expect(run(sized(1500)).out).not.toBe("");
	});
});

describe("a call that is no question gets no answer", () => {
	// spec: agent-permissions/a-reply-in-an-existing-thread
	// agent-permissions/a-comment-anchored-on-a-passage
	// agent-permissions/text-the-hook-cannot-read-as-one-string
	// agent-permissions/a-comment-without-the-mark-or-with-it-elsewhere
	// agent-permissions/a-comment-mentioning-a-user
	// agent-permissions/a-comment-over-the-length-bound
	// agent-permissions/the-hook-cannot-read-what-it-decides-on
	test.each([
		["no markdown and no rich_text [1]", event({ page_id: CARD }), "unmarked"],
		["empty text [2]", asked({ markdown: "" }), "unmarked"],
		["1501 characters [12]", sized(1501), "length"],
		["the mark after a space [13]", asked({ markdown: ` ${QUESTION}` }), "unmarked"],
		["the mark after a newline [13]", asked({ markdown: `\n${QUESTION}` }), "unmarked"],
		["the mark without backticks [14]", asked({ markdown: "harness-question Ship it?" }), "unmarked"],
		["a discussion_id [26]", asked({ discussion_id: "discussion://a/b/c" }), "reply"],
		["a reply_to_comment_id [27]", asked({ reply_to_comment_id: "c1" }), "reply"],
		["a selection_with_ellipsis [28]", asked({ selection_with_ellipsis: "# A...b" }), "anchored"],
		["rich_text [29]", event({ page_id: CARD, rich_text: [{ text: { content: QUESTION } }] }), "rich-text"],
		["a user mention [30]", asked({ markdown: `${QUESTION} <mention-user url="user://u"/>` }), "mention"],
		["another tool's name [31]", event({ page_id: CARD, markdown: QUESTION }, undefined, "mcp__claude_ai_Notion__notion-update-page"), "unreadable"],
		["an event that is not JSON [33]", "{ not json", "unreadable"],
	])("%s: exit 0, nothing printed, recorded passed [19]", (_, stdin, rule) => {
		const { code, out, ledger } = run(stdin);
		expect({ code, out, ledger }).toEqual({
			code: 0,
			out: "",
			ledger: [expect.objectContaining({ decision: "passed", rule })],
		});
	});

	test("several failing conditions record only the first [21]", () => {
		const both = asked({ discussion_id: "d", markdown: "unmarked" });
		expect(run(both).ledger.map((r) => r.rule)).toEqual(["reply"]);
	});
});
