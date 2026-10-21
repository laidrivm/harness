/**
 * The ask command run as a session runs it, a process with a config home of the
 * case's own, against a `Bun.serve` stub reached through
 * `HARNESS_NOTION_API_URL`: the line it prints, its exit, and the calls it
 * makes. [n]: the `/zombies` list of the extension's pull request.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";
import { MARK, REMEDY } from "./question-gate.ts";

const made: string[] = [];
const servers: Server[] = [];
afterAll(() => {
	for (const server of servers) server.stop(true);
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const TOKEN = "ntn_secret0value";
const USER = "0123456789abcdef0123456789abcdef";
const BOT = "ffffeeeeddddccccbbbbaaaa99998888";
const CARD = "aaaabbbbccccddddeeeeffff00001111";
const TEXT = `${MARK} Ship the hook as one group?`;

type Run = { plain_text: string; annotations?: { code: boolean } };
const said = (author: string, time: string, ...runs: Run[]) => ({ created_by: { id: author }, created_time: time, rich_text: runs });
const question = (time: string) =>
	said(BOT, time, { plain_text: "harness-question", annotations: { code: true } }, { plain_text: " Ship?" });

type Stub = { comments?: unknown[][]; read?: number; post?: number };

/** Serves Notion as `stub` says, and the calls it saw, each as `METHOD /path` with its body. */
function notion(stub: Stub = {}) {
	const seen: { call: string; auth: string | null; version: string | null; body: unknown }[] = [];
	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			seen.push({
				call: `${req.method} ${url.pathname}`,
				auth: req.headers.get("Authorization"),
				version: req.headers.get("Notion-Version"),
				body: req.method === "GET" ? undefined : await req.json(),
			});
			if (req.method === "POST") return Response.json({}, { status: stub.post ?? 200 });
			if (url.pathname !== "/v1/comments") return Response.json({}, { status: 500 });
			const pages = stub.comments ?? [[]];
			const at = Number(url.searchParams.get("start_cursor") ?? 0);
			const more = at + 1 < pages.length;
			return Response.json({ results: pages[at], has_more: more, next_cursor: more ? String(at + 1) : null }, { status: stub.read ?? 200 });
		},
	});
	servers.push(server);
	return { seen, url: server.url.origin };
}

/** A config home holding `files` under `harness/`, each at `mode`. */
function home(files: Record<string, unknown> = { "notion-ask.json": { token: TOKEN, user: USER } }, mode = 0o600): string {
	const dir = mkdtempSync(join(tmpdir(), "notion-ask-"));
	made.push(dir);
	mkdirSync(join(dir, "harness"));
	for (const [name, value] of Object.entries(files)) {
		writeFileSync(join(dir, "harness", name), JSON.stringify(value));
		chmodSync(join(dir, "harness", name), mode);
	}
	return dir;
}

/** A question file holding `text`. */
function asked(text = TEXT): string {
	const dir = mkdtempSync(join(tmpdir(), "notion-ask-q-"));
	made.push(dir);
	writeFileSync(join(dir, "q.md"), text);
	return join(dir, "q.md");
}

/** The command's run: its one printed line, which never holds the token, and its exit. */
async function ask(api: string, config: string, args: string[]) {
	const child = Bun.spawn(["bun", join(import.meta.dir, "notion-ask.ts"), ...args], {
		env: { PATH: process.env.PATH, HOME: config, XDG_CONFIG_HOME: config, HARNESS_NOTION_API_URL: api },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	expect(out + err).not.toContain(TOKEN);
	return { line: out.trim(), code };
}

const POSTED = `question: posted on ${CARD}`;
const not = (why: string) => `question: not posted — ${why}`;

describe("a question posted", () => {
	// spec: task-board/a-question-posted-from-the-laptop
	test("the comments read, then the post, each with the version and the bearer; no page read and no PATCH [44] [51]", async () => {
		const { seen, url } = notion();
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line: POSTED, code: 0 });
		expect(seen.map((s) => s.call)).toEqual(["GET /v1/comments", "POST /v1/comments"]);
		for (const s of seen) expect([s.version, s.auth]).toEqual(["2025-09-03", `Bearer ${TOKEN}`]);
		expect(seen[1].body).toEqual({
			parent: { page_id: CARD },
			rich_text: [
				{ type: "text", text: { content: "harness-question" }, annotations: { code: true } },
				{ type: "text", text: { content: " Ship the hook as one group?" } },
			],
		});
	});

	// spec: task-board/text-the-gate-would-not-allow
	test("1500 characters is posted, 1501 is refused in the gate's words [47]", async () => {
		const { url } = notion();
		const sized = (n: number) => asked(`${MARK} ${"q".repeat(n - MARK.length - 1)}`);
		expect((await ask(url, home(), [CARD, sized(1500)])).line).toBe(POSTED);
		expect(await ask(url, home(), [CARD, sized(1501)])).toEqual({
			line: not(`the question fails the question gate (length): ${REMEDY.length}`),
			code: 1,
		});
	});

	test.each([0o600, 0o400].map((mode) => [mode.toString(8), mode] as const))("a settings file at mode 0%s is read [48]", async (_, mode) => {
		const { url } = notion();
		expect((await ask(url, home(undefined, mode), [CARD, asked()])).line).toBe(POSTED);
	});
});

describe("nothing is posted", () => {
	// spec: task-board/no-ask-settings
	test.each([
		["no settings file [42]", {}],
		["notion-bot.json alone, never read in its place [52]", { "notion-bot.json": { token: TOKEN, user: USER } }],
	])("%s: no ask integration is configured, and no call", async (_, files) => {
		const { seen, url } = notion();
		expect(await ask(url, home(files), [CARD, asked()])).toEqual({ line: not("no ask integration is configured"), code: 1 });
		expect(seen).toEqual([]);
	});

	test.each([0o640, 0o604].map((mode) => [mode.toString(8), mode] as const))("a settings file at mode 0%s is refused, naming its mode, before any call [48]", async (_, mode) => {
		const { seen, url } = notion();
		const { line, code } = await ask(url, home(undefined, mode), [CARD, asked()]);
		expect([line.startsWith(not("notion-bot: ")), line.includes(`mode 0${mode.toString(8)}`), code]).toEqual([true, true, 1]);
		expect(seen).toEqual([]);
	});

	// spec: task-board/text-the-gate-would-not-allow
	test.each([
		["an empty question file [43]", () => [CARD, asked("")], not(`the question fails the question gate (unmarked): ${REMEDY.unmarked}`)],
		["a card id with text after it [50]", () => [`${CARD} and more`, asked()], not(`${CARD} and more is not a card id`)],
		["a question file that is missing [55]", () => [CARD, "/nonexistent/q.md"], not("/nonexistent/q.md cannot be read")],
		["no file named", () => [CARD], not("usage: notion-ask.ts <card id> <file>")],
	])("%s: no call", async (_, args, line) => {
		const { seen, url } = notion();
		expect(await ask(url, home(), args())).toEqual({ line, code: 1 });
		expect(seen).toEqual([]);
	});

	// spec: task-board/a-question-already-waits
	test.each([
		["a waiting question on the second page [45]", [[said(USER, "2026-10-20T08:00:00Z", { plain_text: "An earlier answer." })], [question("2026-10-20T09:00:00Z")]]],
		[
			"a harness-answer after it, which does not unblock [46]",
			[[question("2026-10-20T09:00:00Z"), said(BOT, "2026-10-20T10:00:00Z", { plain_text: "harness-answer", annotations: { code: true } }, { plain_text: " Yes." })]],
		],
	])("%s: no post", async (_, comments) => {
		const { seen, url } = notion({ comments });
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line: not(`a question already waits on ${CARD}`), code: 1 });
		expect(seen.map((s) => s.call)).not.toContain("POST /v1/comments");
	});

	// spec: task-board/a-page-the-integration-cannot-reach
	test.each([
		["a 404 on the comments read [53]", { read: 404 }, not("the comments read answered 404")],
		["a bad token, answered 401 [49]", { read: 401 }, not("the comments read answered 401")],
		["a failed POST [54]", { post: 500 }, not("the comment's post answered 500")],
	])("%s: the step and Notion's status, exit 1", async (_, stub, line) => {
		const { seen, url } = notion(stub);
		expect(await ask(url, home(), [CARD, asked()])).toEqual({ line, code: 1 });
		expect(seen.filter((s) => s.call === "POST /v1/comments").length).toBeLessThanOrEqual(1);
	});
});
