/**
 * The runner's Notion settings, for the pass cases of
 * `board-loop-question.test.ts` and `notion-triage-pass.test.ts`: a home
 * holding the settings files, and the values written into them; and the
 * stand-in Notion API those cases and `notion-pause.test.ts` call.
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

/** The id the stand-in gives a page created with `POST /v1/pages`. */
export const FILED = "12345678-9abc-def0-1234-56789abcdef0";

/** Someone on a card's `Assign` beside the user. */
export const OTHER = "99998888777766665555444433332222";

/** Merges into `target` the next of `next[call]`, after that call's answer: how a stand-in changes during a run. `work-take.fixture.ts`'s stub runs it too. */
export function advance(target: object, next: Record<string, object[]> | undefined, call: string) {
	const then = next?.[call]?.shift();
	if (then) Object.assign(target, then);
}

/** The question the stand-in's comments read finds while `state.pending`. */
export const ASKED = { id: "c1", created_by: { id: BOT }, created_time: "2026-10-24T00:00:00Z", rich_text: [{ plain_text: `${MARK} Ship?` }] };

/**
 * A stand-in Notion API: `state.seen`, every call it took, and `state.bodies`,
 * the body each sent; `state.me`, the status of the id read; `state.pending`,
 * whether the card already holds an unanswered question; `state.cards`, what a
 * data source query finds; `state.fail`, the status a call, as `seen` names it,
 * is answered with instead; `state.slug`, the change a card's `Pointer` names;
 * `state.assign`, the ids on its `Assign`; `state.status`, its `select`
 * `Status`, which a `PATCH` setting one changes before the page answers;
 * `state.pointer`, a `Pointer` in place of the slug's; `state.parent`, the
 * page's parent; `state.more`, the query's `has_more`; `state.answer`, the
 * `Status` a `PATCH` sets in place of the one it sent. A `PATCH` of `Assign`
 * replaces `state.assign`, unless `state.keep`, and its answer lists no
 * `Assign` with `state.unlisted`; `state.comments`, when set, is what a
 * comments read finds in place of `pending`'s; `state.next`, for a call as
 * `seen` names it, what to merge into `state` after each of its answers in turn.
 */
export function standIn() {
	const state = {
		keep: false,
		unlisted: false,
		comments: undefined as unknown[] | undefined,
		next: {} as Record<string, object[]>,
		me: 200,
		pending: false,
		slug: "demo",
		assign: [USER, OTHER],
		seen: [] as string[],
		bodies: [] as unknown[],
		cards: [] as unknown[],
		fail: {} as Record<string, number>,
		status: "approved",
		pointer: undefined as string | undefined,
		parent: { type: "data_source_id", data_source_id: "ds1" } as object,
		more: false,
		answer: undefined as string | undefined,
	};
	type Sent = { properties?: { Status?: { select?: { name: string } }; Assign?: { people?: { id: string }[] } } };
	const respond = (req: Request, url: URL, call: string) => {
		if (state.fail[call]) return Response.json({}, { status: state.fail[call] });
		if (url.pathname === "/v1/users/me") return Response.json({ object: "user", type: "bot", id: BOT }, { status: state.me });
		if (req.method === "POST" && url.pathname.endsWith("/query")) return Response.json({ results: state.cards, has_more: state.more });
		if (req.method === "POST" && url.pathname === "/v1/pages") return Response.json({ object: "page", id: FILED });
		const sent = state.bodies.at(-1) as Sent | undefined;
		if (req.method === "PATCH") state.status = state.answer ?? sent?.properties?.Status?.select?.name ?? state.status;
		const people = sent?.properties?.Assign?.people;
		if (req.method === "PATCH" && Array.isArray(people) && !state.keep) state.assign = people.map((p) => p.id);
		if (url.pathname.startsWith("/v1/pages/"))
			return Response.json({
				parent: state.parent,
				properties: {
					Pointer: { rich_text: [{ plain_text: state.pointer ?? `openspec/changes/${state.slug}/` }] },
					...(req.method === "PATCH" && state.unlisted ? {} : { Assign: { people: state.assign.map((id) => ({ id })) } }),
					Status: { type: "select", select: { name: state.status } },
				},
			});
		if (url.pathname.startsWith("/v1/data_sources/")) return Response.json({ title: [{ plain_text: "Demo" }] });
		if (req.method === "GET") return Response.json({ results: state.comments ?? (state.pending ? [ASKED] : []), has_more: false, next_cursor: null });
		return Response.json({});
	};
	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			const call = `${req.method} ${url.pathname}`;
			state.seen.push(call);
			state.bodies.push(req.method === "GET" ? undefined : await req.json());
			const answered = respond(req, url, call);
			advance(state, state.next, call);
			return answered;
		},
	});
	return { state, server };
}

/** One pass with the settings in `home`, or none, against `notion`, its logs cleared first. */
export const against =
	(notion: ReturnType<typeof standIn>) =>
	(dir: string, s: Stubs, home?: string, entry?: string) => {
		notion.state.seen.length = 0;
		notion.state.bodies.length = 0;
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
