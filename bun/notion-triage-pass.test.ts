/**
 * The triage inside a pass: the runner's stub `claude` answers it, and a
 * `Bun.serve` stand-in answers Notion, its card changing between the reads
 * before and after the triage where a case says so. [n]: the extension's
 * `/zombies` list (#191).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { change, clone, lowered, runAsync, SAID, type Stubs } from "./board-loop.fixture.ts";
import { cleanup } from "./diff-budget.fixture.ts";
import { CARD, configured, TOKEN, USER } from "./notion-bot.fixture.ts";
import { MARK, RUNNER_ASKS } from "./question-gate.ts";

afterAll(cleanup);

const BOT = "ffffeeee-dddd-cccc-bbbb-aaaa99998888";
const QUOTE = "Ship it as one group.";
const ASKED = `BLOCKED — a choice\nQUESTION: ${CARD}\n${MARK} One group or two?\n${SAID.slice("Done.\n".length)}`;
const ANSWERED = `ANSWER-SOURCE: docs/rule.md\nANSWER-QUOTE:\n${QUOTE}\nANSWER:\nOne group.`;
const POINTER = { Pointer: { rich_text: [{ plain_text: "openspec/changes/demo/" }] } };
const PAGE = { parent: { type: "data_source_id", data_source_id: "ds1" }, properties: POINTER };

type Card = { after?: unknown[]; pageAfter?: unknown; answerStatus?: number };
let card: Card = {};
const seen: { call: string; body?: { rich_text?: { text: { content: string } }[] } }[] = [];
const notion = Bun.serve({
	port: 0,
	async fetch(req) {
		const url = new URL(req.url);
		const body = req.method === "GET" ? undefined : await req.json();
		seen.push({ call: `${req.method} ${url.pathname}`, body });
		const reads = (path: string) => seen.filter((s) => s.call === `GET ${path}`).length;
		if (url.pathname === "/v1/users/me") return Response.json({ id: BOT });
		if (url.pathname.startsWith("/v1/pages/") && req.method === "GET")
			return Response.json(reads(url.pathname) > 1 && card.pageAfter ? card.pageAfter : PAGE);
		if (url.pathname.startsWith("/v1/data_sources/")) return Response.json({ title: [{ plain_text: "Demo" }] });
		if (req.method === "GET") return Response.json({ results: reads(url.pathname) > 1 ? (card.after ?? []) : [], has_more: false });
		const answer = body?.rich_text?.[0]?.text?.content === "harness-answer";
		return Response.json({}, { status: answer ? (card.answerStatus ?? 200) : 200 });
	},
});
afterAll(() => notion.stop(true));

/** One pass whose stage session asks, against the stand-in with `c` as its card. */
const pass = (s: Stubs, c: Card = {}, entry?: string) => {
	seen.length = 0;
	card = c;
	const { dir } = clone({ ...change("demo"), "docs/rule.md": `${QUOTE}\n` });
	return runAsync(dir, { said: ASKED, ...s }, { home: configured(), entry, env: { HARNESS_NOTION_API_URL: notion.url.origin } });
};
const posts = () => seen.filter((s) => s.call === "POST /v1/comments").map((s) => s.body?.rich_text?.map((r) => r.text.content).join(""));
const patched = () => seen.some((s) => s.call.startsWith("PATCH"));
const comment = (id: string, author: string, text: string) => ({ id, created_by: { id: author }, created_time: "2026-10-20T10:00:00Z", rich_text: [{ plain_text: text }] });

describe("the triage's endings", () => {
	test("no QUESTION: line starts no triage [63]", async () => {
		const r = await pass({ said: SAID });
		expect(r.calls).not.toContain("claude -p Decide whether");
		expect(posts()).toEqual([]);
	});

	// spec: board-loop/an-answer-already-written
	test("a source that holds: the question, then the answer with its quote and source, and no Assign [64]", async () => {
		const r = await pass({ triage: ANSWERED });
		expect(posts()).toEqual(["harness-question One group or two?", `harness-answer One group.\n> ${QUOTE}\nSource: docs/rule.md`]);
		expect(patched()).toBe(false);
		expect(r.text).toContain(`question: posted on ${CARD} and answered from docs/rule.md`);
	});

	// spec: board-loop/the-answers-post-fails
	test("an answer whose post fails sets Assign, and posts no second question [93] [74]", async () => {
		const r = await pass({ triage: ANSWERED }, { answerStatus: 500 });
		expect(posts()).toHaveLength(2);
		expect(patched()).toBe(true);
		expect(r.text).toContain("answer: not posted — the answer's post answered 500");
		expect(r.text).toContain(`question: posted on ${CARD}, Assign set`);
	});

	// spec: board-loop/a-choice-for-the-user
	test("ESCALATE posts the question and sets Assign, and the outcome stays the goal check's [72] [75]", async () => {
		const r = await pass({});
		expect(posts()).toEqual(["harness-question One group or two?"]);
		expect(patched()).toBe(true);
		expect(r.text).toContain("triage: escalated");
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	// spec: board-loop/a-source-that-does-not-hold
	test("a source that does not hold posts the question as on ESCALATE, saying so", async () => {
		const r = await pass({ triage: ANSWERED.replace("docs/rule.md", "docs/none.md") });
		expect(posts()).toHaveLength(1);
		expect(patched()).toBe(true);
		expect(r.text).toContain("triage: the source did not hold — docs/none.md is no file origin/main tracks");
	});

	// spec: board-loop/a-triage-that-fails
	test("a triage past its limit is ended, and the question posted [69]", async () => {
		const r = await pass({ triage: ANSWERED, triageSleep: 60 }, {}, lowered(5000));
		expect(r.text).toContain("triage: ran past");
		expect(posts()).toHaveLength(1);
		expect(patched()).toBe(true);
	}, 40_000);

	// spec: board-loop/the-triages-reach
	test("the triage holds no token and no variable of the runner's, and may only read [70]", async () => {
		const r = await pass({});
		const env = r.env("triage") ?? {};
		expect(Object.keys(env).length).toBeGreaterThan(0);
		expect(Object.values(env).join("\n")).not.toContain(TOKEN);
		expect(env[RUNNER_ASKS.name]).toBeUndefined();
		const line = r.calls.split("\n").find((l) => l.startsWith("claude -p Decide whether")) ?? "";
		expect(r.calls).toContain("--tools Read,Grep,Glob --strict-mcp-config");
		expect(line).not.toContain("--disallowedTools");
	});
});

describe("a card that changed while the triage ran", () => {
	// spec: board-loop/a-question-posted-while-the-triage-ran board-loop/a-card-moved-or-re-pointed-while-the-triage-ran
	test.each([
		["a question asked [87]", { after: [comment("q2", USER, `${MARK} Another?`)] }],
		["a question asked and answered by the user [89]", { after: [comment("q2", USER, `${MARK} Another?`), comment("a2", USER, "Yes.")] }],
		["the integration's own harness-answer", { after: [comment("a3", BOT, "`harness-answer` Two.")] }],
		["a Pointer changed [90]", { pageAfter: { ...PAGE, properties: { Pointer: { rich_text: [{ plain_text: "openspec/changes/other/" }] } } } }],
		["a page moved off the board [90]", { pageAfter: { ...PAGE, parent: { type: "page_id", page_id: "p1" } } }],
	])("%s: neither the answer nor the question is posted", async (_, c) => {
		const r = await pass({ triage: ANSWERED }, c);
		expect(posts()).toEqual([]);
		expect(patched()).toBe(false);
		expect(r.text).toContain("question: not posted");
	});

	test("a harness-answer by another author suppresses nothing [91]", async () => {
		await pass({ triage: ANSWERED }, { after: [comment("a4", USER.replace("0", "9"), "`harness-answer` Two.")] });
		expect(posts()).toHaveLength(2);
	});
});
