/**
 * `bun bun/work.ts status` run as a session runs it, over
 * `work-status.fixture.ts`: the arguments, the user's statuses, the WIP limit,
 * the reads and the write. The evidence on `origin/main` and the `Pointer` are
 * `work-status-tree.test.ts`'s.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { ASKED, USER } from "./notion-bot.fixture.ts";
import { USAGE } from "./work.ts";
import { archived, CARD, change, clone, PAGE, PATCH, refused, status } from "./work-status.fixture.ts";
import { NEXT } from "./work-status.ts";
import { home } from "./work-take.fixture.ts";

afterAll(cleanup);

const to = (target: string) => ["status", "--card", CARD, "--to", target];
const QUERY = "POST /v1/data_sources/ds1/query";
const RANGE = ["exploring", "explored", "proposing", "proposed", "applying", "applied", "archiving"];

describe("the arguments", () => {
	// spec: work-status/a-status-the-board-does-not-have
	test.each([
		["no arguments", ["status"]],
		["--card alone", ["status", "--card", CARD]],
		["--to alone", ["status", "--to", "exploring"]],
		["--to merged", to("merged")],
		["a positional", [...to("exploring"), "more"]],
		["an unknown option", [...to("exploring"), "--force"]],
		["a 31-hex card", ["status", "--card", CARD.slice(1), "--to", "exploring"]],
	])("%s prints the usage and exits 2, calling nothing", async (_, args) => {
		const run = await status({ args });
		expect([run.code, run.err.trim(), run.seen, run.git, run.refusals]).toEqual([2, USAGE.join("\n"), [], [], []]);
	});
});

describe("the user's statuses", () => {
	// spec: work-status/approved-as-the-target
	test.each(["idea", "approved", "discarded"])("--to %s refuses naming the user, calling nothing", async (target) => {
		const run = await status({ args: to(target) });
		refused(run, "user-only");
		expect([run.seen, run.last.includes("user")]).toEqual([[], true]);
	});

	// spec: work-status/a-discarded-card
	test.each(["exploring", "done"])("a discarded card refuses --to %s after the page read alone", async (target) => {
		const run = await status({ args: to(target), page: { status: "discarded" } });
		refused(run, "user-only");
		expect(run.seen).toEqual([PAGE]);
	});
});

describe("the WIP limit", () => {
	// spec: work-status/the-limit-reached
	// spec: work-status/an-idea-card-a-session-is-directed-at
	test.each(["approved", "idea"])("from %s, five cards in the range refuse and four write", async (from) => {
		const full = await status({ args: to("exploring"), page: { status: from }, cards: 5 });
		refused(full, "wip-full");
		expect([full.seen, full.last.includes("5")]).toEqual([[PAGE, QUERY], true]);
		const room = await status({ args: to("exploring"), page: { status: from }, cards: 4 });
		expect([room.code, room.seen, room.last]).toEqual([
			0,
			[PAGE, QUERY, PATCH, PAGE],
			`status: ${CARD} ${from} → exploring`,
		]);
	});

	// spec: work-status/a-move-within-the-range
	test("from proposing to a proven proposed, five cards make no count", async () => {
		const run = await status({
			args: to("proposed"),
			cwd: clone(change("demo")).dir,
			page: { status: "proposing" },
			cards: 5,
		});
		expect([run.code, run.seen]).toEqual([0, [PAGE, PATCH, PAGE]]);
	});

	// spec: work-status/a-card-behind-its-floor-at-a-full-limit
	test.each([
		["proposed", change("demo")],
		["done", archived("demo")],
	])("from approved to a %s origin/main proves, five cards make no count", async (target, tree) => {
		const run = await status({ args: to(target), cwd: clone(tree).dir, cards: 5 });
		expect([run.code, run.seen, run.out.split("\n")[0]]).toEqual([
			0,
			[PAGE, PATCH, PAGE],
			`status: ${CARD} approved → ${target}`,
		]);
	});

	test("HARNESS_WIP_LIMIT=2 with two cards refuses", async () => {
		refused(await status({ args: to("exploring"), cards: 2, env: { HARNESS_WIP_LIMIT: "2" } }), "wip-full");
	});

	// spec: work-status/a-limit-that-is-not-a-number
	test.each(["five", "-1", "5x", ""])("HARNESS_WIP_LIMIT=%p refuses naming the variable", async (limit) => {
		const run = await status({ args: to("exploring"), env: { HARNESS_WIP_LIMIT: limit } });
		refused(run, "wip-limit");
		expect([run.seen, run.last.includes("HARNESS_WIP_LIMIT")]).toEqual([[PAGE], true]);
	});

	test("the query names the seven range statuses on the card's own board", async () => {
		const run = await status({ args: to("exploring") });
		expect(run.bodies[1]).toEqual({
			filter: { or: RANGE.map((name) => ({ property: "Status", select: { equals: name } })) },
			page_size: 100,
		});
	});

	// spec: work-status/more-cards-than-one-page
	test("has_more refuses whatever the limit", async () => {
		refused(await status({ args: to("exploring"), more: true, env: { HARNESS_WIP_LIMIT: "150" } }), "wip-full");
	});
});

describe("the reads and the write", () => {
	// spec: work-status/a-jump-the-order-skips
	test("from approved with room, --to archiving writes", async () => {
		const run = await status({ args: to("archiving") });
		expect([run.code, run.last]).toEqual([0, `status: ${CARD} approved → archiving`]);
	});

	// spec: work-status/explored-needs-no-evidence
	test("exploring to explored writes and runs no git", async () => {
		const run = await status({ args: to("explored"), page: { status: "exploring" } });
		expect([run.code, run.seen, run.git]).toEqual([0, [PAGE, PATCH, PAGE], []]);
	});

	// spec: work-status/notion-does-not-answer
	test.each([
		["no ask settings", { config: home(false) }],
		["a page read answering 500", { fail: { [PAGE]: 500 } }],
		["a query answering 500", { fail: { [QUERY]: 500 } }],
		["a page on no data source", { page: { parent: { type: "page_id", page_id: "p" } } }],
		["a Status that is no status", { page: { status: "merged" } }],
	])("%s refuses under unread", async (_, given) => {
		refused(await status({ args: to("exploring"), ...given }), "unread");
	});

	// spec: work-status/a-move-written
	test("a write sends the Status alone and prints Notion's answer", async () => {
		const run = await status({ args: to("exploring") });
		expect([run.code, run.bodies[2], run.last, run.refusals]).toEqual([
			0,
			{ properties: { Status: { select: { name: "exploring" } } } },
			`status: ${CARD} approved → exploring`,
			[],
		]);
	});

	test("a write Notion answers with another status prints it and exits 1", async () => {
		const run = await status({ args: to("exploring"), page: { answer: "applying" } });
		expect([run.code, run.last, run.refusals]).toEqual([1, `status: ${CARD} approved → applying`, []]);
	});

	test("a write answering 500 exits 1 and records nothing", async () => {
		const run = await status({ args: to("exploring"), fail: { [PATCH]: 500 } });
		expect([run.code, run.last.startsWith("status: refused"), run.refusals]).toEqual([1, false, []]);
	});

	// spec: gate-ledger/a-status-move-refused
	test.each([
		["a checkout's subdirectory", "checkout"],
		["a directory outside any checkout", "outside"],
	])(
		"a refusal's record from %s carries its id and the checkout as its project, whatever CLAUDE_PROJECT_DIR says",
		async (_, where) => {
			const top = where === "checkout" ? clone(change("demo")).dir : emptyDir("work-status-cwd-");
			const env = { CLAUDE_PROJECT_DIR: emptyDir("work-status-elsewhere-") };
			const run = await status({ args: to("approved"), cwd: where === "checkout" ? join(top, "openspec") : top, env });
			expect(run.refusals.map(({ decision, rule, project }) => ({ decision, rule, project }))).toEqual([
				{ decision: "block", rule: "user-only", project: realpathSync(top) },
			]);
		},
	);
});

describe("the next step", () => {
	const lines = (run: Awaited<ReturnType<typeof status>>) => run.out.trim().split("\n");
	const nexts = (run: Awaited<ReturnType<typeof status>>) => lines(run).filter((line) => line.startsWith("next:"));
	const COMMENTS = "GET /v1/comments";

	// spec: work-status/a-card-moved-to-done
	test("a card at archiving moved to done prints the move, the release, then the next line", async () => {
		const run = await status({
			args: to("done"),
			cwd: clone(archived("demo")).dir,
			page: { status: "archiving" },
			assign: [USER],
		});
		expect([run.code, lines(run)]).toEqual([
			0,
			[`status: ${CARD} archiving → done`, `assign: removed the user from ${CARD}`, NEXT],
		]);
	});

	// spec: work-status/a-failed-restore-after-done
	test("a failed restore after done still prints the next line last, and exits 1", async () => {
		const next = { [COMMENTS]: [{ comments: [ASKED] }], [PATCH]: [{}, { fail: { [PATCH]: 500 } }] };
		const run = await status({
			args: to("done"),
			cwd: clone(archived("demo")).dir,
			page: { status: "archiving" },
			assign: [USER],
			next,
		});
		expect([run.code, lines(run).at(-2)?.startsWith("assign: failed — "), run.last]).toEqual([1, true, NEXT]);
	});

	// spec: work-status/a-card-moved-to-done
	test("a fix card moved to done by its merged pull request prints the next line last (/zombies)", async () => {
		const gh = {
			answer: JSON.stringify({
				number: 350,
				state: "closed",
				merged_at: "2026-10-31T00:00:00Z",
				base: { ref: "main" },
			}),
		};
		const run = await status({ args: to("done"), cwd: clone(change("demo")).dir, page: { pointer: "pr:350" }, gh });
		expect([run.code, run.last]).toEqual([0, NEXT]);
	});

	// The requirement's "a failed write", which no scenario names.
	test("a done write answering 500 prints no next line (/zombies)", async () => {
		const run = await status({ args: to("done"), cwd: clone(archived("demo")).dir, fail: { [PATCH]: 500 } });
		expect([run.code, lines(run)]).toEqual([1, [expect.stringContaining(`status: ${CARD} not written — `)]]);
	});

	// spec: work-status/a-move-to-another-status
	test("a move to applied prints no next line", async () => {
		const run = await status({ args: to("applied"), cwd: clone(change("demo")).dir, page: { status: "applying" } });
		expect([run.code, nexts(run)]).toEqual([0, []]);
	});

	// spec: work-status/a-refused-done
	test("a done refused for want of evidence prints the refusal alone", async () => {
		const run = await status({ args: to("done"), cwd: clone(change("demo")).dir, page: { status: "archiving" } });
		refused(run, "no-evidence");
		expect(lines(run).length).toBe(1);
	});

	// spec: work-status/notion-answers-another-status
	test("a done write Notion answers with archiving prints no next line, and exits 1", async () => {
		const run = await status({
			args: to("done"),
			cwd: clone(archived("demo")).dir,
			page: { status: "archiving", answer: "archiving" },
		});
		expect([run.code, nexts(run)]).toEqual([1, []]);
	});

	// spec: work-status/a-card-already-done
	test("a card already at done written to done again prints no next line", async () => {
		const run = await status({ args: to("done"), cwd: clone(archived("demo")).dir, page: { status: "done" } });
		expect([run.code, run.last, nexts(run)]).toEqual([0, `status: ${CARD} done → done`, []]);
	});

	// spec: work-status/the-skill-the-line-names
	test("the skill the line names is one Claude Code finds, and the harness allows it", () => {
		const name = /\/([\w:-]+)/.exec(NEXT)?.[1] ?? "";
		const root = join(import.meta.dir, "..");
		const skill = readFileSync(join(root, ".claude", "skills", name, "SKILL.md"), "utf8");
		const allow = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8")).permissions.allow;
		expect([name, skill.match(/^name:\s*(\S+)\s*$/m)?.[1], allow.includes(`Skill(${name})`)]).toEqual([
			"session-wrapup",
			name,
			true,
		]);
	});
});
