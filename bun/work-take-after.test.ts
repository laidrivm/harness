/**
 * `bun bun/work.ts take`'s last line and its re-read, `--after <comment id>`,
 * over `work-take.fixture.ts`. [n]: the proposal-stage `/zombies` ideas in
 * `take-since-last-read`'s tasks.md.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { USAGE as WORK_USAGE } from "./work.ts";
import {
	BOT,
	CARD,
	cid,
	dashed,
	files,
	LISTING,
	question,
	type Stub,
	said,
	stopServers,
	take,
	USER,
} from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

const USAGE = WORK_USAGE.join("\n");
const PATCH = `PATCH /v1/pages/${CARD}`;
/** `USER` as the API writes an id. */
const UUID = "01234567-89ab-cdef-0123-456789abcdef";
const at = (hour: number) => `2026-10-20T${String(hour).padStart(2, "0")}:00:00Z`;
const reply = (n: number, hour: number) => said(cid(n), USER, at(hour), { plain_text: `Reply ${n}.` });
const printed = (n: number, hour: number) => `${at(hour)} user: Reply ${n}.`;
const after = (id: string) => ["take", "--card", CARD, "--after", id];
const last = (out: string) => out.trimEnd().split("\n").at(-1);

describe("the last line", () => {
	// spec: work-take/comments-on-the-card
	test("three comments: the third's id, after openspec list's listing [6]", async () => {
		const run = await take({ stub: { comments: [[reply(3, 11), question(cid(1), at(9)), reply(2, 10)]] } });
		expect(run.out).toEndWith(`## Open changes\n${LISTING}last comment: ${cid(3)}\n`);
	});

	// spec: work-take/two-comments-in-one-minute
	test("two comments in one minute: the one Notion returned last [7]", async () => {
		expect(last((await take({ stub: { comments: [[reply(2, 10), reply(1, 10)]] } })).out)).toBe(
			`last comment: ${cid(1)}`,
		);
	});

	test("comments over two pages: the second page's last [8]", async () => {
		const run = await take({ stub: { comments: [[question(cid(1), at(9))], [reply(2, 10), reply(3, 11)]] } });
		expect(last(run.out)).toBe(`last comment: ${cid(3)}`);
	});

	// spec: work-take/no-comments
	test("no comments: none [9]", async () => {
		expect(last((await take()).out)).toBe("last comment: none");
	});

	test("a newest comment with no id: the newest that has one; none when no comment has one (local review)", async () => {
		const { id: _, ...bare } = reply(2, 10);
		expect(last((await take({ stub: { comments: [[question(cid(1), at(9)), bare]] } })).out)).toBe(
			`last comment: ${cid(1)}`,
		);
		expect(last((await take({ stub: { comments: [[bare]] } })).out)).toBe("last comment: none");
	});
});

describe("--after's arguments", () => {
	// spec: work-take/a-malformed-comment-id
	test.each([
		["--after with no value", ["take", "--card", CARD, "--after"]],
		["an empty --after", ["take", "--card", CARD, "--after="]],
		["31 hex digits", after(cid(1).slice(1))],
		["33 hex digits", after(`${cid(1)}0`)],
		["a UUID with a digit too many", after(`${cid(2)}0`)],
	])("%s prints the usage and exits 2, calling nothing [11]", async (_, args) => {
		const run = await take({ args });
		expect([run.code, run.err.trim(), run.out, run.seen, run.ran]).toEqual([2, USAGE, "", [], ""]);
	});

	test.each([
		["a 32-hex id after --card", after(cid(1))],
		["a dashed UUID after --card", after(cid(2))],
		["a 32-hex id before --card", ["take", "--after", cid(1), "--card", CARD]],
		["a dashed UUID before --card", ["take", "--after", cid(2), "--card", CARD]],
	])("%s passes [12]", async (_, args) => {
		const run = await take({ args, stub: { comments: [[question(cid(1), at(9)), reply(2, 10)]] } });
		expect([run.code, run.err]).toEqual([0, ""]);
	});
});

describe("the re-read", () => {
	// spec: work-take/an-answer-since-the-last-read
	test("the answer after the question: Status, Assign, the answer alone, the release and its id [13]", async () => {
		const stub = { comments: [[question(cid(1), at(9)), reply(2, 10)]], assign: [UUID] };
		const run = await take({ args: after(cid(1)), stub });
		expect([run.code, run.out]).toEqual([
			0,
			[
				"## Card",
				"Status: proposing",
				`Assign: ${USER}`,
				"## Comments",
				printed(2, 10),
				"question waiting: no",
				`assign: removed the user from ${CARD}`,
				`last comment: ${cid(2)}`,
				"",
			].join("\n"),
		]);
	});

	test("several after it, served out of order: oldest first [14]", async () => {
		const comments = [[reply(4, 12), question(cid(1), at(9)), reply(3, 11), reply(2, 10)]];
		const run = await take({ args: after(cid(1)), stub: { comments } });
		expect(run.out).toContain(`## Comments\n${printed(2, 10)}\n${printed(3, 11)}\n${printed(4, 12)}\nquestion waiting`);
	});

	test("two in one minute, after the first: the second alone [15]", async () => {
		const run = await take({ args: after(cid(1)), stub: { comments: [[reply(1, 10), reply(2, 10)]] } });
		expect(run.out).toContain(`## Comments\n${printed(2, 10)}\nquestion waiting`);
	});

	// spec: work-take/the-comment-and-the-answer-on-different-pages
	test("the cursor on the first page, the answer on the second [16]", async () => {
		const run = await take({ args: after(cid(1)), stub: { comments: [[question(cid(1), at(9))], [reply(2, 10)]] } });
		expect(run.out).toContain(`## Comments\n${printed(2, 10)}\nquestion waiting: no\n`);
	});

	// spec: work-take/the-id-in-the-other-form
	test.each([
		["the card's a UUID, --after its 32 hex digits", cid(2), cid(2).replaceAll("-", "")],
		["the card's 32 hex digits, --after its UUID", cid(1), dashed(cid(1))],
		["the card's in lower case, --after in upper (local review)", cid(1), cid(1).toUpperCase()],
	])("%s [17]", async (_, id, given) => {
		const comments = [[said(id, BOT, at(9), { plain_text: "Before." }), reply(3, 10)]];
		const run = await take({ args: after(given), stub: { comments } });
		expect(run.out).toContain(`## Comments\n${printed(3, 10)}\nquestion waiting`);
	});

	// spec: work-take/nothing-new
	test("the cursor on the last comment: nothing follows, and the same id [18]", async () => {
		const run = await take({ args: after(cid(2)), stub: { comments: [[question(cid(1), at(9)), reply(2, 10)]] } });
		expect(run.out).toContain(`## Comments\nno comment follows ${cid(2)}\nquestion waiting: no\n`);
		expect(last(run.out)).toBe(`last comment: ${cid(2)}`);
	});

	test("a question before the cursor and no answer after it: a question waits [19]", async () => {
		const comments = [[question(cid(1), at(9)), said(cid(2), BOT, at(10), { plain_text: "Noted." })]];
		const run = await take({ args: after(cid(2)), stub: { comments } });
		expect(run.out).toContain(`no comment follows ${cid(2)}\nquestion waiting: yes\n`);
	});

	// spec: work-take/a-comment-no-longer-on-the-card
	test("an id no comment carries: a line saying so, every comment, exit 0 [20]", async () => {
		const run = await take({ args: after(cid(9)), stub: { comments: [[question(cid(1), at(9)), reply(2, 10)]] } });
		expect(run.code).toBe(0);
		expect(run.out).toContain(
			[
				"## Comments",
				`the comment ${cid(9)} is not on the card: every comment follows`,
				`${at(9)} ffffeeeeddddccccbbbbaaaa99998888: harness-question Ship?`,
				printed(2, 10),
				"question waiting: no",
			].join("\n"),
		);
		expect(last(run.out)).toBe(`last comment: ${cid(2)}`);
	});

	test("an id no comment carries and a restore that fails: exit 1 [20]", async () => {
		const stub: Stub = {
			assign: [UUID],
			next: { [PATCH]: [{ comments: [[question(cid(1), at(11))]], fail: { [PATCH]: 500 } }] },
		};
		const run = await take({ args: after(cid(9)), stub });
		expect([run.code, run.out.includes("assign: failed — the restore")]).toEqual([1, true]);
		expect(run.out).toContain(`the comment ${cid(9)} is not on the card: every comment follows\n`);
	});

	test("a card with no comments: the not-on-the-card line and none [21]", async () => {
		const run = await take({ args: after(cid(1)) });
		expect(run.out).toContain(`## Comments\nthe comment ${cid(1)} is not on the card: every comment follows\n`);
		expect(last(run.out)).toBe("last comment: none");
	});

	// spec: work-take/only-the-reads-it-needs
	test("only GETs of the page and its comments, no openspec, outside git, no ledger, exit 0 [22]", async () => {
		const run = await take({ args: after(cid(1)), cwd: emptyDir("work-take-after-") });
		expect([run.code, run.seen.map((s) => s.call), run.ran]).toEqual([
			0,
			// The release's own page read last, which stops there: `Assign` holds no one.
			[`GET /v1/pages/${CARD}`, "GET /v1/comments", `GET /v1/pages/${CARD}`],
			"",
		]);
		expect(files(run.config).filter((path) => path.includes("harness"))).toEqual(["harness/notion-ask.json"]);
	});
});
