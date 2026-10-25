/**
 * The pause notice against the stand-in Notion API of `notion-bot.fixture.ts`:
 * which card it goes on, what it sends, and where a failed call stops it
 * (`openspec/changes/pause-notice/design.md`).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CARD, FILED, standIn, TOKEN, USER } from "./notion-bot.fixture.ts";
import { notice } from "./notion-pause.ts";

const BOARD = "3cd39875c31b80d9929d000b8ddd8190";
const dirs: string[] = [];
const servers: { stop(force: boolean): void }[] = [];
afterAll(() => {
	for (const server of servers) server.stop(true);
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A runner's state: its settings at `settings`, unless null, and `<clone>.stop` holding `line`. */
function host(line: string, settings: Record<string, string> | null = { token: TOKEN, user: USER, board: BOARD }) {
	const dir = mkdtempSync(join(tmpdir(), "notion-pause-"));
	dirs.push(dir);
	const path = join(dir, "notion-bot.json");
	if (settings) {
		writeFileSync(path, JSON.stringify(settings));
		chmodSync(path, 0o600);
	}
	const stop = join(dir, "demo.stop");
	writeFileSync(stop, `${line}\n`);
	return { path, stop, log: join(dir, "passes", "20261025T120000Z-demo.log") };
}

/** A fresh stand-in, the cards its query finds, and the calls that fail. */
function notion(cards: unknown[] = [], fail: Record<string, number> = {}) {
	const { state, server } = standIn();
	servers.push(server);
	Object.assign(state, { cards, fail });
	process.env.HARNESS_NOTION_API_URL = server.url.origin;
	return state;
}

/** The line the notice prints for `h`, which never holds the token. */
async function run(h: ReturnType<typeof host>, log = true): Promise<string> {
	const printed = await notice(log ? [h.stop, h.log] : [h.stop], h.path, 2000);
	expect(printed).not.toContain(TOKEN);
	return printed;
}

const card = (id: string, pointer = "openspec/changes/demo/") => ({ id, properties: { Pointer: { rich_text: [{ plain_text: pointer }] } } });
const OPEN = "20261025T120000Z exit 1: board-loop: open — apply demo step 1: goal open: group 1 is not complete";
const HALT = "20261025T120000Z exit 1: orchestrator: /run/secrets/claude_oauth_token is missing or holds no token";
const MENTION = { type: "mention", mention: { type: "user", user: { id: USER } } };
const QUERY = `POST /v1/data_sources/${BOARD}/query`;

/** The comment's text as posted: the runs after the mark and the mention. */
const posted = (body: unknown) =>
	(body as { rich_text: { text: { content: string } }[] }).rich_text
		.slice(2)
		.map((run) => run.text.content)
		.join("");

describe("a step's card", () => {
	// spec: orchestrator/a-step-s-pass-exits-1
	test("one card names the step: the comment is posted there, then Assign", async () => {
		const state = notion([card(CARD)]);
		const h = host(OPEN);
		expect(await run(h)).toBe(`pause: notice posted on ${CARD}, Assign set`);
		expect(state.seen).toEqual([QUERY, "POST /v1/comments", `PATCH /v1/pages/${CARD}`]);
		expect(state.bodies[0]).toEqual({ filter: { property: "Pointer", rich_text: { equals: "openspec/changes/demo/" } } });
		const body = state.bodies[1] as { parent: unknown; rich_text: unknown[] };
		expect(body.parent).toEqual({ page_id: CARD });
		expect(body.rich_text.slice(0, 2)).toEqual([{ type: "text", text: { content: "harness-pause" }, annotations: { code: true } }, MENTION]);
		expect(posted(body)).toBe(
			[
				` The board loop paused the clone demo: ${OPEN}`,
				`Log: ${h.log}`,
				`Resume: docker compose exec -u runner runner rm ${h.stop}, then clear this card's Assign`,
			].join("\n"),
		);
		expect(state.bodies[2]).toEqual({ properties: { Assign: { people: [{ id: USER }] } } });
	});

	test("a card whose Pointer only resembles the slug's is not taken", async () => {
		const state = notion([card(CARD, "openspec/changes/demo/x")]);
		expect(await run(host(OPEN))).toBe(`pause: notice posted on new card ${FILED}`);
		expect(state.seen).toEqual([QUERY, "POST /v1/pages", "POST /v1/comments"]);
	});

	test.each([
		["a timeout", "20261025T120000Z exit 1: board-loop: timeout — apply demo step 2 ran past 60 minutes"],
		["a process group that outlived the step", "20261025T120000Z exit 1: board-loop: refused — process group 42 outlived apply demo step 1 — see pgrep -g 42"],
	])("%s names the step", async (_, line) => {
		const state = notion([card(CARD)]);
		expect(await run(host(line))).toBe(`pause: notice posted on ${CARD}, Assign set`);
		expect(state.seen[0]).toBe(QUERY);
	});
});

describe("a card of its own", () => {
	/** The reason the new card's body gives, its last paragraph. */
	const reason = (body: unknown) => {
		const children = (body as { children: { paragraph: { rich_text: { text: { content: string } }[] } }[] }).children;
		return children.at(-1)?.paragraph.rich_text[0].text.content;
	};

	// spec: orchestrator/a-host-that-cannot-start-the-pass
	test("a halt files a new card at approved, assigned to the user, and posts the notice there", async () => {
		const state = notion();
		const h = host(HALT);
		expect(await run(h, false)).toBe(`pause: notice posted on new card ${FILED}`);
		expect(state.seen).toEqual(["POST /v1/pages", "POST /v1/comments"]);
		const filed = state.bodies[0] as { parent: unknown; properties: Record<string, unknown> };
		expect(filed.parent).toEqual({ type: "data_source_id", data_source_id: BOARD });
		expect(filed.properties).toEqual({
			Name: { title: [{ text: { content: "The loop paused demo" } }] },
			Status: { select: { name: "approved" } },
			Assign: { people: [{ id: USER }] },
		});
		expect(reason(filed)).toBe("No step's card took this notice: the stop line names no step.");
		const body = state.bodies[1] as { parent: unknown; rich_text: unknown[] };
		expect(body.parent).toEqual({ page_id: FILED });
		expect(body.rich_text[1]).toEqual(MENTION);
		expect(posted(body)).toContain(`: ${HALT}\nLog: no log, the pass did not start\nResume:`);
	});

	// spec: orchestrator/no-card-names-the-step
	test.each([
		["no card", [], "no card's Pointer names demo"],
		["two cards", [card(CARD), card(FILED)], "2 cards' Pointer names demo"],
	])("%s for the slug files a new card naming why", async (_, cards, why) => {
		const state = notion(cards);
		expect(await run(host(OPEN))).toBe(`pause: notice posted on new card ${FILED}`);
		expect(state.seen).toEqual([QUERY, "POST /v1/pages", "POST /v1/comments"]);
		expect(reason(state.bodies[1])).toBe(`No step's card took this notice: ${why}.`);
	});

	test.each([
		["exit 2", OPEN.replace("exit 1", "exit 2")],
		["a line not opening with board-loop: ", "20261025T120000Z exit 1: claude: board-loop: open — apply demo step 1: x"],
		["an exit 1 with no step", "20261025T120000Z exit 1: board-loop: refused — tracked files differ from HEAD"],
	])("%s reads no step, and queries nothing", async (_, line) => {
		const state = notion([card(CARD)]);
		expect(await run(host(line))).toBe(`pause: notice posted on new card ${FILED}`);
		expect(state.seen).toEqual(["POST /v1/pages", "POST /v1/comments"]);
	});

	test("a stop line over 1000 characters is cut at 1000", async () => {
		const state = notion();
		const line = `20261025T120000Z exit 137: ${"x".repeat(2000)}`;
		await run(host(line));
		expect(posted(state.bodies[1])).toContain(`demo: ${line.slice(0, 1000)}\nLog:`);
	});
});

describe("no notice", () => {
	// spec: orchestrator/no-board-is-configured
	test.each([
		["no settings", null, "is missing"],
		["no board", { token: TOKEN, user: USER }, "names no `board`"],
	])("%s posts nothing and says why", async (_, settings, why) => {
		const state = notion([card(CARD)]);
		const h = host(OPEN, settings);
		expect(await run(h)).toBe(`pause: no notice — ${h.path} ${why}`);
		expect(state.seen).toEqual([]);
	});

	test("settings the runner cannot use post nothing, naming the key", async () => {
		const state = notion();
		const h = host(OPEN, { token: TOKEN, user: USER, board: "Harness" });
		expect(await run(h)).toStartWith(`pause: no notice — notion-bot: ${h.path}: \`board\``);
		expect(state.seen).toEqual([]);
	});

	// spec: orchestrator/notion-refuses-a-call
	test.each([
		["the query", OPEN, QUERY, "the board's query answered 500", [QUERY]],
		["the creation", HALT, "POST /v1/pages", "the card's creation answered 500", ["POST /v1/pages"]],
		["the post on a step's card", OPEN, "POST /v1/comments", "the comment's post answered 500", [QUERY, "POST /v1/comments"]],
		["the post on a new card", HALT, "POST /v1/comments", `the comment's post answered 500 (new card ${FILED} filed)`, ["POST /v1/pages", "POST /v1/comments"]],
	])("%s failing prints which and makes no call after it", async (_, line, failing, why, calls) => {
		const state = notion([card(CARD)], { [failing]: 500 });
		expect(await run(host(line))).toBe(`pause: no notice — ${why}`);
		expect(state.seen).toEqual(calls);
	});

	test("the Assign write failing says the notice is posted", async () => {
		notion([card(CARD)], { [`PATCH /v1/pages/${CARD}`]: 500 });
		expect(await run(host(OPEN))).toBe(`pause: notice posted on ${CARD}, Assign not set — the Assign write answered 500`);
	});

	test("the command prints its line and exits 0 when it posts nothing", () => {
		const h = host(OPEN, null);
		const done = Bun.spawnSync([process.execPath, join(import.meta.dir, "notion-pause.ts"), h.stop], {
			env: { PATH: process.env.PATH ?? "", HOME: join(h.path, "..", "home") },
		});
		expect(done.exitCode).toBe(0);
		expect(done.stdout.toString()).toStartWith("pause: no notice — ");
	});
});
