/**
 * A `Bun.serve` stub of Notion reached through `HARNESS_NOTION_API_URL`, and
 * the comments it serves, for `notion-bot-rest.test.ts`. `afterAll` is not
 * registered here: the test file registers `stopServers` itself.
 */
import { expect } from "bun:test";
import type { Server } from "bun";
import { post } from "./notion-bot.ts";

const servers: Server<undefined>[] = [];
/** Stops every stub `notion()` started. */
export const stopServers = () => {
	for (const server of servers) server.stop(true);
};

export const TOKEN = "ntn_secret0value";
export const USER = "0123456789abcdef0123456789abcdef";
export const USER_UUID = "01234567-89ab-cdef-0123-456789abcdef";
export const BOT = "ffffeeeeddddccccbbbbaaaa99998888";
export const CARD = "aaaabbbbccccddddeeeeffff00001111";
export const TEXT = "`harness-question` Ship the hook as one group?";
export const CARRIED = { board: "Harness", slug: "demo" };

export const PAGE = {
	parent: { type: "data_source_id", data_source_id: "ds1" },
	properties: { Pointer: { type: "rich_text", rich_text: [{ plain_text: "openspec/changes/demo/" }] } },
};
const SOURCE = { title: [{ plain_text: "Harness" }] };

type Run = { plain_text: string; annotations?: { code: boolean } };
export const said = (author: string, time: string, ...runs: Run[]) => ({
	created_by: { id: author },
	created_time: time,
	rich_text: runs,
});
/** A question as the API returns one the integration posted: a code run, then text. */
export const question = (time: string, author = BOT) =>
	said(author, time, { plain_text: "harness-question", annotations: { code: true } }, { plain_text: " Ship?" });
export const reply = (time: string, author = USER) => said(author, time, { plain_text: "Yes, one group." });

export type Stub = {
	page?: unknown;
	status?: number;
	source?: unknown;
	comments?: unknown[][];
	post?: number;
	patch?: number;
	hang?: boolean;
	me?: number;
	meId?: string;
	/** Every comments page says more follows and names this as its cursor, or these in turn. */
	stuck?: string | null | string[];
};
export type Seen = { call: string; version: string | null; auth: string | null; body: unknown };

/** Serves Notion as `stub` says, points the module at it, and returns the calls it saw. */
export function notion(stub: Stub = {}): Seen[] {
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
			if (url.pathname === "/v1/users/me") return json({ object: "user", type: "bot", id: stub.meId ?? BOT }, stub.me);
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

/** The line `post` prints, which never holds the token ([30] of #184's `/zombies` list); `self`, the integration's own id as read. */
export async function line(carried = CARRIED, timeout?: number, self?: string): Promise<string> {
	const printed = await post({ token: TOKEN, user: USER, self }, { card: CARD, text: TEXT }, carried, timeout);
	expect(printed).not.toContain(TOKEN);
	return printed;
}

export const POSTED = `question: posted on ${CARD}, Assign set`;
export const calls = (seen: Seen[]) => seen.map((s) => s.call.replace(/\?.*/, ""));
