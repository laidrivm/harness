/**
 * `runs()`: a posted comment's markdown as Notion rich_text runs, since a
 * comment renders none of it. Pure, so no stub is needed.
 */
import { describe, expect, test } from "bun:test";
import { runs } from "./notion-bot.ts";

describe("the comment's markdown", () => {
	test("inline code and bold become annotated runs, a heading a bold line, the rest plain text", () => {
		expect(runs("## Ask\n1. Keep **this** and `that`?")).toEqual([
			{ type: "text", text: { content: "Ask" }, annotations: { bold: true } },
			{ type: "text", text: { content: "\n1. Keep " } },
			{ type: "text", text: { content: "this" }, annotations: { bold: true } },
			{ type: "text", text: { content: " and " } },
			{ type: "text", text: { content: "that" }, annotations: { code: true } },
			{ type: "text", text: { content: "?" } },
		]);
	});

	test("a heading keeps its inline formatting, bold over it, with no delimiter left (review of #248)", () => {
		expect(runs("## Ask *why* and `how`?\nrest")).toEqual([
			{ type: "text", text: { content: "Ask " }, annotations: { bold: true } },
			{ type: "text", text: { content: "why" }, annotations: { italic: true, bold: true } },
			{ type: "text", text: { content: " and " }, annotations: { bold: true } },
			{ type: "text", text: { content: "how" }, annotations: { code: true, bold: true } },
			{ type: "text", text: { content: "?" }, annotations: { bold: true } },
			{ type: "text", text: { content: "\nrest" } },
		]);
	});

	test("*italic* becomes an italic run, while a `* ` list bullet stays plain", () => {
		expect(runs("* one *two*")).toEqual([
			{ type: "text", text: { content: "* one " } },
			{ type: "text", text: { content: "two" }, annotations: { italic: true } },
		]);
	});

	test("_italic_ becomes italic at word edges, while a snake_case_name stays plain", () => {
		expect(runs("_two_ and harness_question_mark")).toEqual([
			{ type: "text", text: { content: "two" }, annotations: { italic: true } },
			{ type: "text", text: { content: " and harness_question_mark" } },
		]);
	});

	test("an http(s) link becomes a linked run, any other target stays literal", () => {
		expect(runs("see [PR](https://github.com/o/r/pull/1) or [x](javascript:alert)")).toEqual([
			{ type: "text", text: { content: "see " } },
			{ type: "text", text: { content: "PR", link: { url: "https://github.com/o/r/pull/1" } } },
			{ type: "text", text: { content: " or [x](javascript:alert)" } },
		]);
	});

	test("a run past 2000 characters is split, as Notion takes no longer one", () => {
		expect(runs("q".repeat(2001)).map((r) => r.text.content.length)).toEqual([2000, 1]);
	});
});
