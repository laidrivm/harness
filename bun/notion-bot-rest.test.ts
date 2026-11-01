/**
 * The runner's five REST calls against a `Bun.serve` stub reached through
 * `HARNESS_NOTION_API_URL`: what each sends, and where each stops the rest.
 * [n]: the proposal-stage `/zombies` list of #184.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { client, comment, own } from "./notion-bot.ts";
import {
	BOT,
	CARD,
	CARRIED,
	calls,
	line,
	notion,
	PAGE,
	POSTED,
	question,
	reply,
	type Stub,
	said,
	stopServers,
	TEXT,
	TOKEN,
	USER,
	USER_UUID,
} from "./notion-bot-rest.fixture.ts";
import { Transient } from "./transient.ts";

afterAll(stopServers);

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

	test("a user to mention follows the mark run as a mention run, and the text after it", async () => {
		const seen = notion();
		await comment(client(TOKEN), CARD, "`harness-pause` Paused.", "harness-pause", USER);
		const [mark, ...rest] = (seen[0].body as { rich_text: unknown[] }).rich_text;
		expect(mark).toEqual({ type: "text", text: { content: "harness-pause" }, annotations: { code: true } });
		expect(rest).toEqual([{ type: "mention", mention: { type: "user", user: { id: USER } } }, { type: "text", text: { content: " Paused." } }]);
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

describe("the triage's answer", () => {
	const ASKED = "2026-10-20T09:00:00Z";
	/** A `harness-answer` as the integration posts one: a code run, then the answer. */
	const answer = (time: string, author = BOT) =>
		said(author, time, { plain_text: "harness-answer", annotations: { code: true } }, { plain_text: " One group." });

	// spec: task-board/the-triages-answer task-board/the-user-after-the-triage
	test.each([
		["the integration's harness-answer alone [77]", [question(ASKED), answer("2026-10-20T10:00:00Z")], BOT],
		["a harness-answer, then the user's reply [78]", [question(ASKED), answer("2026-10-20T10:00:00Z"), reply("2026-10-20T11:00:00Z")], BOT],
		["the user's reply, then a harness-answer [79]", [question(ASKED), reply("2026-10-20T10:00:00Z"), answer("2026-10-20T11:00:00Z")], BOT],
		["an id read as a UUID, matched by its hex digits [80]", [question(ASKED), answer("2026-10-20T10:00:00Z")], "ffffeeee-dddd-cccc-bbbb-aaaa99998888"],
		["a backticked mark in plain text [77]", [question(ASKED), said(BOT, "2026-10-20T10:00:00Z", { plain_text: "`harness-answer` One group." })], BOT],
	])("%s answers the question, and the new one is posted", async (_, comments, self) => {
		notion({ comments: [comments] });
		expect(await line(CARRIED, undefined, self)).toBe(POSTED);
	});

	// spec: task-board/a-harness-answer-from-another-author
	test.each([
		["from the ask integration [81]", [question(ASKED), answer("2026-10-20T10:00:00Z", "11112222333344445555666677778888")], BOT],
		["from another member [81]", [question(ASKED), answer("2026-10-20T10:00:00Z", USER.replace("0", "9"))], BOT],
		["from the user, a mark and so no reply of theirs [81]", [question(ASKED), answer("2026-10-20T10:00:00Z", USER)], BOT],
		["read with no integration id [83]", [question(ASKED), answer("2026-10-20T10:00:00Z")], undefined],
	])("a harness-answer %s answers nothing", async (_, comments, self) => {
		notion({ comments: [comments] });
		expect(await line(CARRIED, undefined, self)).toBe(`question: not posted — a question already waits on ${CARD}`);
	});
});

describe("the integration's own id", () => {
	test("is read with GET /v1/users/me, with the version and the bearer", async () => {
		const seen = notion();
		expect(await own(TOKEN)).toBe(BOT);
		expect(seen.map((s) => [s.call, s.version, s.auth])).toEqual([["GET /v1/users/me", "2025-09-03", `Bearer ${TOKEN}`]]);
	});

	test.each([
		["a 401", { me: 401 }, "the integration's id read answered 401"],
		["no id in the answer", { meId: "not-an-id" }, "the integration's id read gave no Notion id"],
	])("%s throws, naming the step, never the token [82]", async (_, stub, why) => {
		notion(stub);
		const thrown = await own(TOKEN).then(
			() => "",
			(error: Error) => error.message,
		);
		expect(thrown).toBe(why);
	});

	/** What `own()` throws against `stub`, with a short limit. */
	const failed = (stub: Stub) => {
		notion(stub);
		return own(TOKEN, 200).then(() => undefined, (error: Error) => error);
	};

	test.each([
		["a 502", { me: 502 }, "the integration's id read answered 502"],
		["a 429", { me: 429 }, "the integration's id read answered 429"],
		["no answer", { hang: true }, "the integration's id read failed: TimeoutError"],
	])("%s throws a Transient, its message as before", async (_, stub, why) => {
		const error = await failed(stub);
		expect(error).toBeInstanceOf(Transient);
		expect(error?.message).toBe(why);
	});

	test("a 401 throws a plain Error", async () => {
		const error = await failed({ me: 401 });
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(Transient);
	});

	test("a malformed base URL throws a plain Error", async () => {
		process.env.HARNESS_NOTION_API_URL = "not a url";
		const error = await own(TOKEN, 200).then(() => undefined, (e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(Transient);
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
		expect(await line(CARRIED, 200)).toBe("question: not posted — Notion did not answer: the page read failed: TimeoutError");
	});

	test("a failed POST sends no PATCH [28]", async () => {
		const seen = notion({ post: 500 });
		expect(await line()).toBe("question: not posted — Notion did not answer: the comment's post answered 500");
		expect(calls(seen)).not.toContain(`PATCH /v1/pages/${CARD}`);
	});

	// spec: board-loop/the-comment-posted-and-assign-refused
	test("a failed PATCH says the question is posted and Assign is not set, and posts once [29]", async () => {
		const seen = notion({ patch: 500 });
		expect(await line()).toBe(`question: posted on ${CARD}, Assign not set — the Assign write answered 500`);
		expect(calls(seen).filter((c) => c === "POST /v1/comments")).toHaveLength(1);
	});
});
