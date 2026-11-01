/**
 * `cleared()`, the release the work commands run, and `release()`, the write
 * it shares with `unassign()`, against `standIn()`: what they read, what they
 * write back, and what they return. [n]: the proposal-stage `/zombies` list
 * of `notion-ask-sets-assign`'s tasks.md.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { client } from "./notion-bot.ts";
import { CARD, OTHER, standIn, TOKEN, USER } from "./notion-bot.fixture.ts";
import { cleared, release as write } from "./notion-release.ts";

const notion = standIn();
let before: string | undefined;
beforeAll(() => {
	before = process.env.HARNESS_NOTION_API_URL;
	process.env.HARNESS_NOTION_API_URL = notion.server.url.origin;
});
afterAll(() => {
	if (before === undefined) delete process.env.HARNESS_NOTION_API_URL;
	else process.env.HARNESS_NOTION_API_URL = before;
	notion.server.stop(true);
});

const BOT = "ffffeeee-dddd-cccc-bbbb-aaaa99998888";
const PAGE = `GET /v1/pages/${CARD}`;
const COMMENTS = "GET /v1/comments";
const PATCH = `PATCH /v1/pages/${CARD}`;
const REMOVED = `assign: removed the user from ${CARD}`;
const RESTORED = `assign: restored the user on ${CARD}`;

/** A comment by `author` at minute `at`, opening with a code run of `mark` when one is named. */
const said = (author: string, at: number, mark?: string) => ({
	id: `c${at}`,
	created_by: { id: author },
	created_time: `2026-11-01T10:${String(at).padStart(2, "0")}:00Z`,
	rich_text: [...(mark ? [{ plain_text: mark, annotations: { code: true } }] : []), { plain_text: " text" }],
});
const question = (at: number) => said(BOT, at, "harness-question");
const pause = (at: number) => said(BOT, at, "harness-pause");
const reply = (at: number) => said(USER, at);

type Case = { assign?: string[]; comments?: unknown[]; keep?: boolean; unlisted?: boolean; fail?: Record<string, number>; next?: Record<string, object> };

/** `cleared()` on a card the stand-in holds as `c` says, each `next` applied after that call's first answer, and the calls it made. */
async function release({ next = {}, ...c }: Case = {}) {
	const once = Object.fromEntries(Object.entries(next).map(([call, then]) => [call, [then]]));
	Object.assign(notion.state, { assign: [USER, OTHER], comments: [], keep: false, unlisted: false, fail: {} }, c, { next: once });
	notion.state.seen.length = 0;
	notion.state.bodies.length = 0;
	const result = await cleared(client(TOKEN), CARD, USER);
	return { ...result, seen: [...notion.state.seen], assign: notion.state.assign };
}

describe("nothing waits: the user leaves Assign", () => {
	// spec: task-board/a-move-after-the-answer task-board/someone-else-on-assign
	test("the user's comment after the last question: the user alone removed [13]", async () => {
		const run = await release({ comments: [question(1), reply(2)] });
		expect([run.line, run.restoreFailed, run.assign]).toEqual([REMOVED, false, [OTHER]]);
		expect(run.seen).toEqual([PAGE, COMMENTS, PATCH, COMMENTS]);
		expect(notion.state.bodies[2]).toEqual({ properties: { Assign: { people: [{ id: OTHER }] } } });
	});

	// spec: task-board/work-resumed
	test("a card with no question [14]", async () => {
		expect((await release()).line).toBe(REMOVED);
	});
});

describe("something waits: nothing written", () => {
	// spec: task-board/a-question-waits task-board/a-pause-notice-waits
	test.each([
		["a waiting question [15]", [question(1)]],
		["a triage's harness-answer alone after it [16]", [question(1), said(BOT, 2, "harness-answer")]],
		["a pause notice no comment of the user's follows [27]", [pause(1)]],
		["a pause notice followed only by a marked comment of the user's [30]", [pause(1), said(USER, 2, "harness-question")]],
	])("%s", async (_, comments) => {
		const run = await release({ comments });
		expect([run.line, run.restoreFailed, run.seen, run.assign]).toEqual([undefined, false, [PAGE, COMMENTS], [USER, OTHER]]);
	});

	// spec: task-board/the-user-not-on-assign
	test("Assign without the user: no comments read [18]", async () => {
		const run = await release({ assign: [OTHER] });
		expect([run.line, run.seen]).toEqual([undefined, [PAGE]]);
	});

	// spec: task-board/the-user-not-on-assign
	test("25 people without the user: no line, since nothing would be written (local review)", async () => {
		const run = await release({ assign: Array.from({ length: 25 }, (_, i) => `${i}`.padStart(32, "0")) });
		expect([run.line, run.seen]).toEqual([undefined, [PAGE]]);
	});
});

describe("the release fails", () => {
	// spec: task-board/the-release-fails
	test.each([
		["25 people on Assign [26]", { assign: [USER, ...Array.from({ length: 24 }, (_, i) => `${i}`.padStart(32, "0"))] }, `${CARD} lists 25 people on Assign`],
		["an answer still holding the user [19]", { keep: true }, "the Assign write did not remove the user"],
		["an answer with no Assign list [25]", { unlisted: true }, "the Assign write did not remove the user"],
		["a comments read answered 500 [20]", { fail: { [COMMENTS]: 500 } }, "the comments read answered 500"],
	])("%s: an assign: failed line", async (_, c, why) => {
		const run = await release(c);
		expect([run.line?.startsWith("assign: failed — "), run.line?.includes(why), run.restoreFailed]).toEqual([true, true, false]);
	});
});

describe("something arrives during the release", () => {
	// spec: task-board/a-question-posted-during-the-release
	test.each([
		["a question [29]", {}, { [COMMENTS]: { comments: [question(3)] } }, "waits"],
		["a pause notice [33]", {}, { [COMMENTS]: { comments: [pause(3)] } }, "waits"],
		["a second comments read answered 500 [34]", {}, { [PATCH]: { fail: { [COMMENTS]: 500 } } }, "unread"],
		[
			"a question, the write answering no Assign list (local review)",
			{ unlisted: true },
			{ [COMMENTS]: { comments: [question(3)] }, [PATCH]: { unlisted: false } },
			"waits",
		],
	])("%s: the user back beside the other person", async (_, c, next, back) => {
		const run = await release({ ...c, next });
		expect([run.line, run.back, run.restoreFailed, run.assign]).toEqual([RESTORED, back, false, [OTHER, USER]]);
		expect(run.seen).toEqual([PAGE, COMMENTS, PATCH, COMMENTS, PATCH]);
	});

	// spec: task-board/the-restore-fails
	test("a restore answered 500: restoreFailed [35]", async () => {
		const run = await release({ next: { [COMMENTS]: { comments: [question(3)] }, [PATCH]: { fail: { [PATCH]: 500 } } } });
		expect([run.line?.startsWith("assign: failed — "), run.restoreFailed]).toEqual([true, true]);
	});
});

describe("release(), which unassign() shares", () => {
	/** `release()` on the stand-in as `c` says: what it returned, or the message it threw. */
	const released = async (c: Case) => {
		Object.assign(notion.state, { assign: [USER, OTHER], comments: [], keep: false, unlisted: false, fail: {}, next: {} }, c);
		return write(client(TOKEN), CARD, USER).then(
			(done) => (done ? "written" : "declined"),
			(error: Error) => error.message,
		);
	};

	// spec: task-board/the-release-fails
	test.each([
		["an answer still holding the user", { keep: true }],
		["an answer with no Assign list", { unlisted: true }],
	])("%s throws, so every caller fails on it (the user's answer 11 b)", async (_, c) => {
		expect(await released(c)).toBe("the Assign write did not remove the user");
	});

	test("an answer without the user is written", async () => {
		expect(await released({})).toBe("written");
	});
});
