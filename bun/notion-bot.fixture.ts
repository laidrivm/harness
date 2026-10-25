/**
 * The runner's Notion settings, for the pass cases of
 * `board-loop-question.test.ts` and `notion-triage-pass.test.ts`: a home
 * holding the settings files, and the values written into them.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runAsync, type Stubs } from "./board-loop.fixture.ts";
import { emptyDir } from "./diff-budget.fixture.ts";
import { MARK } from "./question-gate.ts";

export const TOKEN = "ntn_secret0value";
export const USER = "0123456789abcdef0123456789abcdef";
export const CARD = "aaaabbbbccccddddeeeeffff00001111";

/** The integration's own id, as the stand-in's `GET /v1/users/me` answers it. */
export const BOT = "ffffeeee-dddd-cccc-bbbb-aaaa99998888";

/** Someone on a card's `Assign` beside the user. */
export const OTHER = "99998888777766665555444433332222";

/**
 * A stand-in Notion API: `state.seen`, every call it took; `state.me`, the status of the id read; `state.pending`,
 * whether the card already holds an unanswered question; `state.slug`, the change its `Pointer` names; `state.post`,
 * the status of a comment's post and `state.patch` of a page write; `state.assign`, the ids on its `Assign`; `state.wrote`, the body of each `PATCH`.
 */
export function standIn() {
	const state = { me: 200, pending: false, slug: "demo", post: 200, patch: 200, assign: [USER, OTHER], seen: [] as string[], wrote: [] as unknown[] };
	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			state.seen.push(`${req.method} ${url.pathname}`);
			if (req.method === "PATCH") state.wrote.push(await req.json());
			if (url.pathname === "/v1/users/me") return Response.json({ object: "user", type: "bot", id: BOT }, { status: state.me });
			if (url.pathname.startsWith("/v1/pages/"))
				return Response.json({
					parent: { type: "data_source_id", data_source_id: "ds1" },
					properties: { Pointer: { rich_text: [{ plain_text: `openspec/changes/${state.slug}/` }] }, Assign: { people: state.assign.map((id) => ({ id })) } },
				}, { status: req.method === "PATCH" ? state.patch : 200 });
			if (url.pathname.startsWith("/v1/data_sources/")) return Response.json({ title: [{ plain_text: "Demo" }] });
			const asked = { id: "c1", created_by: { id: BOT }, created_time: "2026-10-24T00:00:00Z", rich_text: [{ plain_text: `${MARK} Ship?` }] };
			if (req.method === "GET") return Response.json({ results: state.pending ? [asked] : [], has_more: false, next_cursor: null });
			return Response.json({}, { status: req.method === "POST" ? state.post : 200 });
		},
	});
	return { state, server };
}

/** One pass with the settings in `home`, or none, against `notion`, its logs cleared first. */
export const against =
	(notion: ReturnType<typeof standIn>) =>
	(dir: string, s: Stubs, home?: string, entry?: string) => {
		notion.state.seen.length = 0;
		notion.state.wrote.length = 0;
		return runAsync(dir, s, { home, entry, env: { HARNESS_NOTION_API_URL: notion.server.url.origin } });
	};

/** A runner home holding each settings file named, at `mode`. */
export function configured(mode = 0o600, ...names: string[]) {
	const home = emptyDir("board-loop-home-");
	mkdirSync(join(home, ".config/harness"), { recursive: true });
	for (const name of names.length ? names : ["notion-bot.json"]) {
		const file = join(home, ".config/harness", name);
		writeFileSync(file, JSON.stringify({ token: TOKEN, user: USER }));
		chmodSync(file, mode);
	}
	return home;
}
