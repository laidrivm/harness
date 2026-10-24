/**
 * The runner's Notion settings, for the pass cases of
 * `board-loop-question.test.ts` and `notion-triage-pass.test.ts`: a home
 * holding the settings files, and the values written into them.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir } from "./diff-budget.fixture.ts";

export const TOKEN = "ntn_secret0value";
export const USER = "0123456789abcdef0123456789abcdef";
export const CARD = "aaaabbbbccccddddeeeeffff00001111";

/** The integration's own id, as the stand-in's `GET /v1/users/me` answers it. */
export const BOT = "ffffeeee-dddd-cccc-bbbb-aaaa99998888";

/** A stand-in Notion API: `state.seen`, every call it took; `state.me`, the status of the id read. */
export function standIn() {
	const state = { me: 200, seen: [] as string[] };
	const server = Bun.serve({
		port: 0,
		fetch(req) {
			const url = new URL(req.url);
			state.seen.push(`${req.method} ${url.pathname}`);
			if (url.pathname === "/v1/users/me") return Response.json({ object: "user", type: "bot", id: BOT }, { status: state.me });
			if (url.pathname.startsWith("/v1/pages/"))
				return Response.json({
					parent: { type: "data_source_id", data_source_id: "ds1" },
					properties: { Pointer: { rich_text: [{ plain_text: "openspec/changes/demo/" }] } },
				});
			if (url.pathname.startsWith("/v1/data_sources/")) return Response.json({ title: [{ plain_text: "Demo" }] });
			if (req.method === "GET") return Response.json({ results: [], has_more: false, next_cursor: null });
			return Response.json({});
		},
	});
	return { state, server };
}

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
