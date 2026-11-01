/**
 * The ask command run as a session runs it, a process with a config home of the
 * case's own, against a `Bun.serve` stub reached through
 * `HARNESS_NOTION_API_URL`: the line it prints, its exit, and the calls it
 * makes, over `notion-ask.fixture.ts`. [n]: the `/zombies` list of the
 * extension's pull request.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	ask,
	asked,
	BOT,
	CARD,
	cleanup,
	held,
	home,
	notion,
	OTHER,
	question,
	said,
	TOKEN,
	USER,
	UUID,
} from "./notion-ask.fixture.ts";
import { integration } from "./notion-ask.ts";
import { MARK, REMEDY } from "./question-gate.ts";

afterAll(cleanup);

const POSTED = `question: posted on ${CARD}`;
const SET = `${POSTED}, Assign set`;
const unset = (why: string) => `${POSTED}, Assign not set — ${why}`;
const not = (why: string) => `question: not posted — ${why}`;
const calls = (seen: { call: string }[]) => seen.map((s) => s.call);
const ASSIGN = `PATCH /v1/pages/${CARD}`;

describe("a question posted", () => {
	// spec: task-board/a-question-posted-from-the-laptop
	test("the post, then the Assign write, each with the version and the bearer; no comments read [1] [2] [44] [51]", async () => {
		const { seen, url } = notion();
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line: SET, code: 0 });
		expect(calls(seen)).toEqual(["POST /v1/comments", ASSIGN]);
		for (const s of seen) expect([s.version, s.auth]).toEqual(["2025-09-03", `Bearer ${TOKEN}`]);
		expect(seen[0].body).toEqual({
			parent: { page_id: CARD },
			rich_text: [
				{ type: "text", text: { content: "harness-question" }, annotations: { code: true } },
				{ type: "text", text: { content: " Ship the hook as one group?" } },
			],
		});
		expect(seen[1].body).toEqual({ properties: { Assign: { people: [{ id: USER }] } } });
	});

	// spec: task-board/a-question-posted-from-the-laptop
	test("a user id of 32 hex digits in the settings matches the UUID in the write's answer [5]", async () => {
		const { url } = notion({ assigned: held(OTHER.toUpperCase(), UUID.toUpperCase()) });
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line: SET, code: 0 });
	});

	// spec: task-board/a-question-already-waits
	// spec: task-board/assign-cleared-while-a-question-waits
	test.each([
		[
			"a waiting question on the second page [45]",
			[[said(USER, "2026-10-20T08:00:00Z", { plain_text: "An earlier answer." })], [question("2026-10-20T09:00:00Z")]],
		],
		[
			"a harness-answer after it, which does not unblock [46]",
			[
				[
					question("2026-10-20T09:00:00Z"),
					said(
						BOT,
						"2026-10-20T10:00:00Z",
						{ plain_text: "harness-answer", annotations: { code: true } },
						{ plain_text: " Yes." },
					),
				],
			],
		],
	])("%s: posted and assigned all the same [3]", async (_, comments) => {
		const { seen, url } = notion({ comments });
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line: SET, code: 0 });
		expect(calls(seen)).toEqual(["POST /v1/comments", ASSIGN]);
	});

	// spec: task-board/a-post-that-may-have-landed
	test("a 200 whose body does not parse counts as posted, and the write follows [31]", async () => {
		const { seen, url } = notion({ raw: "not json" });
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line: SET, code: 0 });
		expect(calls(seen)).toEqual(["POST /v1/comments", ASSIGN]);
	});

	// spec: task-board/text-the-gate-would-not-allow
	test("1500 characters is posted, 1501 is refused in the gate's words [47]", async () => {
		const { url } = notion();
		const sized = (n: number) => asked(`${MARK} ${"q".repeat(n - MARK.length - 1)}`);
		expect((await ask(url, home(), [CARD, sized(1500)])).line).toBe(SET);
		expect(await ask(url, home(), [CARD, sized(1501)])).toEqual({
			line: not(`the question fails the question gate (length): ${REMEDY.length}`),
			code: 1,
		});
	});

	test.each([0o600, 0o400].map((mode) => [mode.toString(8), mode] as const))(
		"a settings file at mode 0%s is read [48]",
		async (_, mode) => {
			const { url } = notion();
			expect((await ask(url, home(undefined, mode), [CARD, asked()])).line).toBe(SET);
		},
	);
});

describe("posted, and Assign not set", () => {
	// spec: task-board/the-assign-write-fails
	test.each([
		["another person alone [4]", { assigned: held(OTHER) }, unset("the Assign write did not hold the user")],
		["an empty people list [6]", { assigned: held() }, unset("the Assign write did not hold the user")],
		["an answer of {} [7]", { assigned: {} }, unset("the Assign write did not hold the user")],
		["a write answered 500 [8]", { patch: 500 }, unset("the Assign write answered 500")],
		["a write answered 403 [9]", { patch: 403 }, unset("the Assign write answered 403")],
		[
			"a 200 whose body does not parse, the step named and no body quoted",
			{ assigned: "not json" },
			unset("the Assign write answered 200 with a body that could not be read: SyntaxError"),
		],
	])("%s: the line names why, exit 1, one post", async (_, stub, line) => {
		const { seen, url } = notion(stub);
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line, code: 1 });
		expect(calls(seen)).toEqual(["POST /v1/comments", ASSIGN]);
	});
});

describe("nothing is posted", () => {
	// spec: task-board/no-ask-settings
	test.each([
		["no settings file [42]", {}],
		["notion-bot.json alone, never read in its place [52]", { "notion-bot.json": { token: TOKEN, user: USER } }],
	])("%s: no ask integration is configured, and no call", async (_, files) => {
		const { seen, url } = notion();
		expect(await ask(url, home(files), [CARD, asked()])).toEqual({
			line: not("no ask integration is configured"),
			code: 1,
		});
		expect(seen).toEqual([]);
	});

	test.each([0o640, 0o604].map((mode) => [mode.toString(8), mode] as const))(
		"a settings file at mode 0%s is refused, naming its mode, before any call [48]",
		async (_, mode) => {
			const { seen, url } = notion();
			const { line, code } = await ask(url, home(undefined, mode), [CARD, asked()]);
			expect([line.startsWith(not("notion-bot: ")), line.includes(`mode 0${mode.toString(8)}`), code]).toEqual([
				true,
				true,
				1,
			]);
			expect(seen).toEqual([]);
		},
	);

	// spec: task-board/text-the-gate-would-not-allow
	test.each([
		[
			"an empty question file [43]",
			() => [CARD, asked("")],
			not(`the question fails the question gate (unmarked): ${REMEDY.unmarked}`),
		],
		[
			"a card id with text after it [50]",
			() => [`${CARD} and more`, asked()],
			not(`${CARD} and more is not a card id`),
		],
		[
			"a question file that is missing [55]",
			() => [CARD, "/nonexistent/q.md"],
			not("/nonexistent/q.md cannot be read"),
		],
		["no file named", () => [CARD], not("usage: notion-ask.ts <card id> <file>")],
	])("%s: no call", async (_, args, line) => {
		const { seen, url } = notion();
		expect(await ask(url, home(), args())).toEqual({ line, code: 1 });
		expect(seen).toEqual([]);
	});

	// spec: task-board/a-page-the-integration-cannot-reach
	test.each([
		["a post answered 404 [53]", 404],
		["a bad token, answered 401 [49]", 401],
		["a post answered 429 [23]", 429],
	])("%s: the step and Notion's status, exit 1, no write [10]", async (_, post) => {
		const { seen, url } = notion({ post });
		expect(await ask(url, home(), [CARD, asked()])).toEqual({
			line: not(`the comment's post answered ${post}`),
			code: 1,
		});
		expect(calls(seen)).toEqual(["POST /v1/comments"]);
	});
});

describe("a post that may have landed", () => {
	// spec: task-board/a-post-that-may-have-landed
	test("a post answered 503: may be posted, read the comments first, exit 1, no write [22] [54]", async () => {
		const { seen, url } = notion({ post: 503 });
		expect(await ask(url, home(), [CARD, asked()])).toEqual({
			line: `question: may be posted on ${CARD} — the comment's post answered 503; read the card's comments before running it again`,
			code: 1,
		});
		expect(calls(seen)).toEqual(["POST /v1/comments"]);
	});

	// spec: task-board/a-post-that-may-have-landed
	test("a post that gets no answer: may be posted, exit 1", async () => {
		const gone = Bun.serve({ port: 0, fetch: () => new Response() });
		const url = gone.url.origin;
		gone.stop(true);
		const { line, code } = await ask(url, home(), [CARD, asked()]);
		expect([
			line.startsWith(`question: may be posted on ${CARD} — the comment's post failed: `),
			line.endsWith("; read the card's comments before running it again"),
			code,
		]).toEqual([true, true, 1]);
	});
});

describe("the ask settings, as work.ts reads them", () => {
	/** `integration()` over the config home `config`, its client against `api`. */
	const lifted = (api: string, config: string) => {
		const before = process.env.HARNESS_NOTION_API_URL;
		process.env.HARNESS_NOTION_API_URL = api;
		try {
			return integration(30_000, { HOME: config, XDG_CONFIG_HOME: config });
		} finally {
			if (before === undefined) delete process.env.HARNESS_NOTION_API_URL;
			else process.env.HARNESS_NOTION_API_URL = before;
		}
	};

	test("the ask command and the export read the same settings and call with the same bearer and version", async () => {
		const { seen, url } = notion();
		const config = home();
		await ask(url, config, [CARD, asked()]);
		const found = lifted(url, config);
		if (typeof found === "string") throw new Error(found);
		expect(found.settings).toEqual({ token: TOKEN, user: USER });
		await found.call("the comments read", `/v1/comments?block_id=${CARD}`);
		expect(seen.at(-1)).toEqual({
			call: "GET /v1/comments",
			auth: seen[0].auth,
			version: seen[0].version,
			body: undefined,
		});
	});

	test("no settings answer the reason, and no call", () => {
		const { seen, url } = notion();
		expect(lifted(url, home({}))).toBe("no ask integration is configured");
		expect(seen).toEqual([]);
	});

	test("a mode the settings refuse answers that reason", () => {
		const { url } = notion();
		expect(lifted(url, home(undefined, 0o640))).toContain("has mode 0640");
	});
});
