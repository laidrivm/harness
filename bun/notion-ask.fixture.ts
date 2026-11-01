/**
 * What `notion-ask.test.ts` runs the ask command with: a process with a
 * config home of the case's own, a question file, and a `Bun.serve` stub of
 * Notion reached through `HARNESS_NOTION_API_URL`, which records each call.
 * Split from the test file ahead of the Biome reformat.
 */
import { expect } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";
import { MARK } from "./question-gate.ts";

const made: string[] = [];
const servers: Server[] = [];
/** Stops every stub and removes every directory the cases made. */
export function cleanup() {
	for (const server of servers) server.stop(true);
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
}

export const TOKEN = "ntn_secret0value";
export const USER = "0123456789abcdef0123456789abcdef";
export const BOT = "ffffeeeeddddccccbbbbaaaa99998888";
export const CARD = "aaaabbbbccccddddeeeeffff00001111";
const TEXT = `${MARK} Ship the hook as one group?`;

type Run = { plain_text: string; annotations?: { code: boolean } };
export const said = (author: string, time: string, ...runs: Run[]) => ({ created_by: { id: author }, created_time: time, rich_text: runs });
export const question = (time: string) =>
	said(BOT, time, { plain_text: "harness-question", annotations: { code: true } }, { plain_text: " Ship?" });

/** `USER` as the API writes an id, a UUID. */
export const UUID = "01234567-89ab-cdef-0123-456789abcdef";
export const OTHER = "99999999-8888-7777-6666-555555555555";
export const held = (...people: string[]) => ({ object: "page", properties: { Assign: { type: "people", people: people.map((id) => ({ object: "user", id })) } } });

/**
 * `post` answers the comment's post, its body `raw` when one is given; `patch`
 * and `assigned` the `Assign` write, which holds the user by default, a string
 * `assigned` being the body as sent.
 */
type Stub = { comments?: unknown[][]; post?: number; raw?: string; patch?: number; assigned?: unknown };
const answer = (body: unknown, status: number) => (typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status }));

/** Serves Notion as `stub` says, and the calls it saw, each as `METHOD /path` with its body. */
export function notion(stub: Stub = {}) {
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
			if (req.method === "POST") return answer(stub.raw ?? {}, stub.post ?? 200);
			if (req.method === "PATCH" && url.pathname === `/v1/pages/${CARD}`) return answer(stub.assigned ?? held(UUID), stub.patch ?? 200);
			if (url.pathname !== "/v1/comments") return Response.json({}, { status: 500 });
			const pages = stub.comments ?? [[]];
			const at = Number(url.searchParams.get("start_cursor") ?? 0);
			const more = at + 1 < pages.length;
			return Response.json({ results: pages[at], has_more: more, next_cursor: more ? String(at + 1) : null });
		},
	});
	servers.push(server);
	return { seen, url: server.url.origin };
}

/** A config home holding `files` under `harness/`, each at `mode`. */
export function home(files: Record<string, unknown> = { "notion-ask.json": { token: TOKEN, user: USER } }, mode = 0o600): string {
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
export function asked(text = TEXT): string {
	const dir = mkdtempSync(join(tmpdir(), "notion-ask-q-"));
	made.push(dir);
	writeFileSync(join(dir, "q.md"), text);
	return join(dir, "q.md");
}

/** The command's run: its one printed line, which never holds the token, and its exit. */
export async function ask(api: string, config: string, args: string[]) {
	const child = Bun.spawn(["bun", join(import.meta.dir, "notion-ask.ts"), ...args], {
		env: { PATH: process.env.PATH, HOME: config, XDG_CONFIG_HOME: config, HARNESS_NOTION_API_URL: api },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	expect(out + err).not.toContain(TOKEN);
	return { line: out.trim(), code };
}
