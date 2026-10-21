/**
 * The runner's five REST calls against a `Bun.serve` stub reached through
 * `HARNESS_NOTION_API_URL`: what each sends, and where each stops the rest.
 * [n]: the proposal-stage `/zombies` list of #184.
 */
import { afterAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { post } from "./notion-bot.ts";

const servers: Server[] = [];
afterAll(() => {
	for (const server of servers) server.stop(true);
});

const TOKEN = "ntn_secret0value";
const USER = "0123456789abcdef0123456789abcdef";
const USER_UUID = "01234567-89ab-cdef-0123-456789abcdef";
const BOT = "ffffeeeeddddccccbbbbaaaa99998888";
const CARD = "aaaabbbbccccddddeeeeffff00001111";
const TEXT = "`harness-question` Ship the hook as one group?";
const CARRIED = { board: "Harness", slug: "demo" };

const PAGE = {
	parent: { type: "data_source_id", data_source_id: "ds1" },
	properties: { Pointer: { type: "rich_text", rich_text: [{ plain_text: "openspec/changes/demo/" }] } },
};
const SOURCE = { title: [{ plain_text: "Harness" }] };

type Run = { plain_text: string; annotations?: { code: boolean } };
const said = (author: string, time: string, ...runs: Run[]) => ({
	created_by: { id: author },
	created_time: time,
	rich_text: runs,
});
/** A question as the API returns one the integration posted: a code run, then text. */
const question = (time: string, author = BOT) =>
	said(author, time, { plain_text: "harness-question", annotations: { code: true } }, { plain_text: " Ship?" });
const reply = (time: string, author = USER) => said(author, time, { plain_text: "Yes, one group." });

type Stub = {
	page?: unknown;
	status?: number;
	source?: unknown;
	comments?: unknown[][];
	post?: number;
	patch?: number;
	hang?: boolean;
	/** Every comments page says more follows and names this as its cursor, or these in turn. */
	stuck?: string | null | string[];
};
type Seen = { call: string; version: string | null; auth: string | null; body: unknown };

/** Serves Notion as `stub` says, points the module at it, and returns the calls it saw. */
function notion(stub: Stub = {}): Seen[] {
	const seen: Seen[] = [];
	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			seen.push({
				call: `${req.method} ${url.pathname}${url.search}`,
				version: req.headers.get("Notion-Version"),
				auth: req.headers.get("Authorization"),
				body: req.method === "GET" ? undefined : await req.json(),
			});
			if (stub.hang) return new Promise<Response>(() => {});
			const json = (value: unknown, status = 200) => Response.json(value, { status });
			if (url.pathname.startsWith("/v1/pages/"))
				return req.method === "PATCH" ? json({}, stub.patch) : json(stub.page ?? PAGE, stub.status);
			if (url.pathname.startsWith("/v1/data_sources/")) return json(stub.source ?? SOURCE);
			if (req.method === "POST") return json({}, stub.post);
			if (Array.isArray(stub.stuck)) {
				const read = seen.filter((s) => s.call.startsWith("GET /v1/comments")).length - 1;
				return json({ results: [], has_more: true, next_cursor: stub.stuck[read % stub.stuck.length] });
			}
			if (stub.stuck !== undefined) return json({ results: [], has_more: true, next_cursor: stub.stuck });
			const pages = stub.comments ?? [[]];
			const at = Number(url.searchParams.get("start_cursor") ?? 0);
			const more = at + 1 < pages.length;
			return json({ results: pages[at], has_more: more, next_cursor: more ? String(at + 1) : null });
		},
	});
	servers.push(server);
	process.env.HARNESS_NOTION_API_URL = server.url.origin;
	return seen;
}

/** The line `post` prints, which never holds the token [30]. */
async function line(carried = CARRIED, timeout?: number): Promise<string> {
	const printed = await post({ token: TOKEN, user: USER }, { card: CARD, text: TEXT }, carried, timeout);
	expect(printed).not.toContain(TOKEN);
	return printed;
}

const POSTED = `question: posted on ${CARD}, Assign set`;
const calls = (seen: Seen[]) => seen.map((s) => s.call.split(" ")[0] + " " + s.call.split(" ")[1].split("?")[0]);

describe("a question posted", () => {
	// spec: board-loop/a-question-posted
	test("the five calls, in order, each with the version and the bearer [20]", async () => {
		const seen = notion();
		expect(await line()).toBe(POSTED);
		expect(seen.map((s) => s.call)).toEqual([
			`GET /v1/pages/${CARD}`,
			"GET /v1/data_sources/ds1",
			`GET /v1/comments?block_id=${CARD}`,
			"POST /v1/comments",
			`PATCH /v1/pages/${CARD}`,
		]);
		for (const s of seen) expect([s.version, s.auth]).toEqual(["2025-09-03", `Bearer ${TOKEN}`]);
	});

	test("the comment is a code-annotated mark run, then the text; the PATCH sets Assign alone [20]", async () => {
		const seen = notion();
		await line();
		expect(seen[3].body).toEqual({
			parent: { page_id: CARD },
			rich_text: [
				{ type: "text", text: { content: "harness-question" }, annotations: { code: true } },
				{ type: "text", text: { content: " Ship the hook as one group?" } },
			],
		});
		expect(seen[4].body).toEqual({ properties: { Assign: { people: [{ id: USER }] } } });
	});
});

describe("a question already waits", () => {
	// spec: board-loop/a-question-already-waits
	test.each([
		["one on the second page of comments [21]", [[reply("2026-10-20T08:00:00Z")], [question("2026-10-20T09:00:00Z")]]],
		["one served before an earlier reply [21]", [[question("2026-10-20T09:00:00Z")], [reply("2026-10-20T08:00:00Z")]]],
		["one followed only by another member's comment [22]", [[question("2026-10-20T09:00:00Z"), reply("2026-10-20T10:00:00Z", BOT.replace("f", "e"))]]],
		["one in a plain backticked mark [23]", [[said(USER, "2026-10-20T09:00:00Z", { plain_text: TEXT })]]],
	])("%s: nothing is posted", async (_, comments) => {
		const seen = notion({ comments });
		expect(await line()).toBe(`question: not posted — a question already waits on ${CARD}`);
		expect(calls(seen)).not.toContain("POST /v1/comments");
	});

	test.each([
		["the user's reply after it [22]", [[question("2026-10-20T09:00:00Z"), reply("2026-10-20T10:00:00Z")]]],
		["the user's reply served first, posted later [21]", [[reply("2026-10-20T10:00:00Z")], [question("2026-10-20T09:00:00Z")]]],
		["the user's reply under a UUID-form id [22a]", [[question("2026-10-20T09:00:00Z"), reply("2026-10-20T10:00:00Z", USER_UUID)]]],
	])("%s: the question is answered, and the new one posted", async (_, comments) => {
		notion({ comments });
		expect(await line()).toBe(POSTED);
	});

	test.each([
		["repeats its cursor", "same", 2],
		["says more follows with no cursor", null, 1],
		["says more follows with an empty cursor", "", 1],
		["comes back to a cursor already read", ["A", "B"], 3],
	])("a comments read that %s posts nothing", async (_, stuck, reads) => {
		const seen = notion({ stuck });
		expect(await line()).toBe("question: not posted — the comments read gave no new cursor");
		expect(calls(seen).filter((c) => c === "GET /v1/comments")).toHaveLength(reads);
		expect(calls(seen)).not.toContain("POST /v1/comments");
	});
});

describe("a card the runner refuses", () => {
	// spec: board-loop/a-page-that-is-not-a-card
	test.each([
		["a parent of type database_id [25]", { page: { ...PAGE, parent: { type: "database_id", database_id: "db1" } } }, `${CARD} is not a card on a board`],
		["a parent of type page_id [25]", { page: { ...PAGE, parent: { type: "page_id", page_id: "p1" } } }, `${CARD} is not a card on a board`],
		["a board titled Harness copy [24]", { source: { title: [{ plain_text: "Harness copy" }] } }, `${CARD} is not on the board Harness`],
		["a 404 on the page read [26]", { status: 404 }, "the page read answered 404"],
	])("%s posts nothing", async (_, stub, why) => {
		const seen = notion(stub);
		expect(await line()).toBe(`question: not posted — ${why}`);
		expect(calls(seen)).not.toContain("POST /v1/comments");
	});

	test("a card on Harness, from mellon's clone, posts nothing [24]", async () => {
		notion();
		expect(await line({ board: "mellon", slug: "demo" })).toBe(`question: not posted — ${CARD} is not on the board mellon`);
	});

	// spec: board-loop/the-card-of-another-change
	test.each(["openspec/changes/other/", "openspec/changes/demo/ and more", "openspec/changes/demo"])(
		"a Pointer of %p posts nothing [24a]",
		async (pointer) => {
			notion({ page: { ...PAGE, properties: { Pointer: { rich_text: [{ plain_text: pointer }] } } } });
			expect(await line()).toBe(`question: not posted — ${CARD} is not the card of demo`);
		},
	);
});

describe("a call that fails", () => {
	test("a stub that never answers ends at the timeout, naming the error [27]", async () => {
		notion({ hang: true });
		expect(await line(CARRIED, 200)).toBe("question: not posted — the page read failed: TimeoutError");
	});

	test("a failed POST sends no PATCH [28]", async () => {
		const seen = notion({ post: 500 });
		expect(await line()).toBe("question: not posted — the comment's post answered 500");
		expect(calls(seen)).not.toContain(`PATCH /v1/pages/${CARD}`);
	});

	// spec: board-loop/the-comment-posted-and-assign-refused
	test("a failed PATCH says the question is posted and Assign is not set, and posts once [29]", async () => {
		const seen = notion({ patch: 500 });
		expect(await line()).toBe(`question: posted on ${CARD}, Assign not set — the Assign write answered 500`);
		expect(calls(seen).filter((c) => c === "POST /v1/comments")).toHaveLength(1);
	});
});
