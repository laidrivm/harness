/**
 * What `work.ts take`'s two test files share: the command run as a session
 * runs it, in a checkout of the case's own, with a config home, a Notion stub
 * reached through `HARNESS_NOTION_API_URL` and a `PATH` holding git and,
 * where the case wants one, an `openspec` stub. The stub records each call's
 * method, path and `Notion-Version`, as `notion()` in `notion-ask.test.ts`
 * does.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "bun";
import { emptyDir, repo } from "./diff-budget.fixture.ts";
import { advance } from "./notion-bot.fixture.ts";

export const TOKEN = "ntn_secret0value";
export const USER = "0123456789abcdef0123456789abcdef";
export const BOT = "ffffeeee-dddd-cccc-bbbb-aaaa99998888";
export const CARD = "aaaabbbbccccddddeeeeffff00001111";
export const LISTING = "Changes:\n  demo     0/1 tasks\n";

const servers: Server[] = [];
export const stopServers = () => {
	for (const server of servers) server.stop(true);
	servers.length = 0;
};

type Run = { plain_text: string; annotations?: { code: boolean } };
export const said = (author: string, time: string, ...runs: Run[]) => ({ created_by: { id: author }, created_time: time, rich_text: runs });
export const question = (time: string) => said(BOT, time, { plain_text: "harness-question", annotations: { code: true } }, { plain_text: " Ship?" });

/** A card's page with every property set, `properties` replacing any of them; `Assign` holds no one, so the release reads no comments. */
export const page = (pointer = "", properties: Record<string, unknown> = {}) => ({
	object: "page",
	parent: { type: "data_source_id", data_source_id: "ds1" },
	properties: {
		Name: { type: "title", title: [{ plain_text: "Demo " }, { plain_text: "card" }] },
		Status: { type: "status", status: { name: "proposing" } },
		Pointer: { type: "rich_text", rich_text: pointer ? [{ plain_text: pointer }] : [] },
		Labels: { type: "multi_select", multi_select: [{ name: "pivot-step-2-1" }, { name: "later" }] },
		Assign: { type: "people", people: [] },
		...properties,
	},
});

/** Notion's answer to the markdown read. */
export const body = (markdown: string, truncated = false, unknown_block_ids: string[] = []) => ({
	object: "page_markdown",
	id: CARD,
	markdown,
	truncated,
	unknown_block_ids,
});

/**
 * `fail` answers a call, as `seen` names it, with that status; a comments or
 * blocks page past the first is named `#<cursor>`. `blocks` are the card's
 * top-level blocks, page by page, and `board` the data source's title.
 * `assign`, when set, is the ids the page's `Assign` holds, which a `PATCH` replaces; `next`, for a call as `seen`
 * names it, what to merge into the stub after each of its answers in turn.
 */
export type Stub = {
	page?: unknown;
	markdown?: unknown;
	comments?: unknown[][];
	blocks?: unknown[][];
	board?: string;
	fail?: Record<string, number>;
	assign?: string[];
	next?: Record<string, Partial<Stub>[]>;
};

/** Serves Notion as `stub` says, and the calls it saw with the body each sent. */
export function notion(stub: Stub = {}) {
	const seen: { call: string; version: string | null; auth: string | null; body?: unknown }[] = [];
	/** The page as the stub holds it, its `Assign` the stub's people when it names some. */
	const card = () => {
		const read = (stub.page ?? page()) as { properties?: Record<string, unknown> };
		if (!stub.assign) return read;
		return {
			...read,
			properties: {
				...read.properties,
				Assign: { type: "people", people: stub.assign.map((id) => ({ object: "user", id })) },
			},
		};
	};
	const respond = (
		req: Request,
		url: URL,
		call: string,
		cursor: string | null,
		sent: Awaited<ReturnType<Request["json"]>>,
	) => {
		const status = stub.fail?.[call];
		if (status) return Response.json({}, { status });
		if (/^\/v1\/pages\/[^/]+\/markdown$/.test(url.pathname)) return Response.json(stub.markdown ?? body("# Card\n"));
		if (req.method === "PATCH") {
			const people = sent?.properties?.Assign?.people;
			if (Array.isArray(people)) stub.assign = people.map((p: { id: string }) => p.id);
		}
		// A `Pointer` write answers the page as written, as Notion does.
		const pointer = sent?.properties?.Pointer?.rich_text?.[0]?.text?.content;
		if (/^\/v1\/pages\/[^/]+$/.test(url.pathname)) return Response.json(pointer === undefined ? card() : page(pointer));
		if (/^\/v1\/data_sources\/[^/]+$/.test(url.pathname))
			return Response.json({ title: [{ plain_text: stub.board ?? "Harness" }] });
		const blocks = /^\/v1\/blocks\/[^/]+\/children$/.test(url.pathname);
		if (blocks && req.method === "PATCH") return Response.json({ object: "list", results: sent.children });
		if (!blocks && url.pathname !== "/v1/comments") return Response.json({}, { status: 404 });
		const pages = (blocks ? stub.blocks : stub.comments) ?? [[]];
		const at = Number(cursor ?? 0);
		const more = at + 1 < pages.length;
		return Response.json({ results: pages[at], has_more: more, next_cursor: more ? String(at + 1) : null });
	};
	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			const cursor = url.searchParams.get("start_cursor");
			const call = `${req.method} ${url.pathname}${cursor ? `#${cursor}` : ""}`;
			// Read once: the PATCH of `Assign` and the `Pointer` write both need it.
			const sent = req.method === "GET" ? undefined : await req.json();
			seen.push({
				call,
				version: req.headers.get("Notion-Version"),
				auth: req.headers.get("Authorization"),
				body: sent,
			});
			const answered = respond(req, url, call, cursor, sent);
			advance(stub, stub.next, call);
			return answered;
		},
	});
	servers.push(server);
	return { seen, url: server.url.origin };
}

/** A home whose config holds the ask settings at `mode`, or none. */
export function home(settings = true, mode = 0o600): string {
	const dir = emptyDir("work-take-home-");
	if (!settings) return dir;
	mkdirSync(join(dir, "harness"));
	writeFileSync(join(dir, "harness", "notion-ask.json"), JSON.stringify({ token: TOKEN, user: USER }));
	chmodSync(join(dir, "harness", "notion-ask.json"), mode);
	return dir;
}

/** Every file under `dir`, relative to it. */
export const files = (dir: string) =>
	readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((path) => statSync(join(dir, path)).isFile())
		.sort();

/** A `PATH` of git alone, and an `openspec` printing `LISTING` and exiting `code` unless `code` is null. */
export function bin(code: number | null = 0) {
	const dir = emptyDir("work-take-bin-");
	const git = Bun.which("git");
	if (!git) throw new Error("no git on PATH");
	symlinkSync(git, join(dir, "git"));
	const log = join(dir, "openspec.log");
	if (code !== null) {
		writeFileSync(join(dir, "openspec"), `#!/bin/sh\necho "OPENSPEC_TELEMETRY=$OPENSPEC_TELEMETRY $*" >> '${log}'\nprintf '${LISTING.replaceAll("\n", "\\n")}'\nexit ${code}\n`);
		chmodSync(join(dir, "openspec"), 0o755);
	}
	return { dir, ran: () => (existsSync(log) ? readFileSync(log, "utf8") : "") };
}

/** A checkout holding `tree`, committed. */
export const checkout = (tree: Record<string, string> = {}) => repo(tree, {});

export type Take = { stub?: Stub; args?: string[]; cwd?: string; config?: string; path?: ReturnType<typeof bin> };

/** `bun bun/work.ts take --card CARD`, or `args`, and what it printed, which never holds the token. */
export async function take({ stub, args = ["take", "--card", CARD], cwd = checkout(), config = home(), path = bin() }: Take = {}) {
	const api = notion(stub);
	const child = Bun.spawn([process.execPath, join(import.meta.dir, "work.ts"), ...args], {
		cwd,
		env: { PATH: path.dir, HOME: config, XDG_CONFIG_HOME: config, HARNESS_NOTION_API_URL: api.url },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if ((out + err).includes(TOKEN)) throw new Error("the token was printed");
	return { out, err, code, seen: api.seen, ran: path.ran(), cwd, config };
}
