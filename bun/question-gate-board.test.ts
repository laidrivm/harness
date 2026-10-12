/**
 * The question gate on what the session's own transcript says about the page:
 * that it is a card on a board, and that its comments were read. The envelope
 * is `question-gate.test.ts`'s; every question here is a conforming one.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CARD,
	OTHER,
	asked,
	cleanup,
	comments,
	event,
	fetched,
	QUESTION,
	run,
	scratch,
	transcript,
} from "./question-gate.fixture.ts";

afterAll(cleanup);

/** The rule a question on the card is recorded under, given its transcript. */
const rule = (path: string) => run(asked({}, path)).ledger[0]?.rule;

describe("the page is a card on a board", () => {
	// spec: agent-permissions/a-question-on-a-card
	test("a D2ASS card is allowed like a Harness one [38]", () => {
		const path = transcript([fetched(CARD, "D2ASS"), comments(CARD)]);
		expect(rule(path)).toBe("question");
	});

	test.each([
		["dashes [15]", "aaaabbbb-cccc-dddd-eeee-ffff00001111"],
		["upper-case hex [16]", "AAAABBBBCCCCDDDDEEEEFFFF00001111"],
	])("a page id written with %s matches the card", (_, id) => {
		const path = transcript([fetched(CARD, "Harness"), comments(CARD)]);
		expect(run(event({ page_id: id, markdown: QUESTION }, path)).out).not.toBe(
			"",
		);
	});

	test("of two fetches of the page, the latest decides [10]", () => {
		const moved = [fetched(CARD, "Harness"), fetched(CARD, "Notes")];
		expect(rule(transcript([...moved, comments(CARD)]))).toBe("not-a-card");
	});

	test("a transcript line that is not JSON is skipped [35]", () => {
		const path = transcript([fetched(CARD, "Harness"), comments(CARD)], ["{"]);
		expect(rule(path)).toBe("question");
	});
});

describe("a page that is not a card gets no answer", () => {
	// spec: agent-permissions/a-page-that-is-not-a-card
	test.each([
		["no fetch in the transcript [4]", []],
		["a fetch of an ordinary page [39]", [fetched(CARD, "Notes")]],
		["a source named harness [17]", [fetched(CARD, "harness")]],
		["a source named Harness board [17]", [fetched(CARD, "Harness board")]],
		["a fetch of another page [4]", [fetched(OTHER, "Harness")]],
		[
			"a board's ancestor path in the content of a page with none [32]",
			[
				fetched(
					CARD,
					undefined,
					'<ancestor-path><parent-data-source name="Harness"/></ancestor-path>',
				),
			],
		],
	])("%s", (_, calls) => {
		const { out, ledger } = run(asked({}, transcript([...calls, comments(CARD)])));
		expect({ out, rule: ledger[0]?.rule }).toEqual({ out: "", rule: "not-a-card" });
	});

	// spec: agent-permissions/the-hook-cannot-read-what-it-decides-on
	test("a transcript that does not exist is unreadable [34]", () => {
		expect(rule(join(scratch(), "missing.jsonl"))).toBe("unreadable");
	});
});

describe("the card's comments were read", () => {
	// spec: agent-permissions/a-card-whose-comments-were-not-read
	// task-board/comments-not-read
	test.each([
		["no comments read [40]", [fetched(CARD, "Harness")]],
		["another page's comments read [41]", [fetched(CARD, "Harness"), comments(OTHER)]],
	])("%s: no answer, recorded comments-unread", (_, calls) => {
		const { out, ledger } = run(asked({}, transcript(calls)));
		expect({ out, rule: ledger[0]?.rule }).toEqual({
			out: "",
			rule: "comments-unread",
		});
	});

	// spec: agent-permissions/many-questions-in-one-session
	test("ten questions in one session are each allowed [42]", () => {
		const path = transcript([fetched(CARD, "Harness"), comments(CARD)]);
		const answers = Array.from({ length: 10 }, () => run(asked({}, path)).out);
		expect(answers.every((out) => out !== "")).toBe(true);
	});
});

describe("the ledger", () => {
	// spec: agent-permissions/a-question-on-a-card
	test("a write that fails leaves the allow standing [37]", () => {
		const unwritable = join(scratch(), "file");
		writeFileSync(unwritable, "");
		expect(run(asked(), unwritable).out).not.toBe("");
	});
});
