/**
 * The release of `Assign` as `bun bun/work.ts status`, `take` and `finish
 * --card` run it, over each command's fixture: where its line goes, and what
 * a failed release or restore changes. `cleared()` itself is
 * `notion-release.test.ts`'s. [n]: the proposal-stage `/zombies` list of
 * `notion-ask-sets-assign`'s tasks.md.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import { ASKED, OTHER, USER } from "./notion-bot.fixture.ts";
import { finish, pull } from "./work-finish.fixture.ts";
import { CARD, change, clone, PAGE, PATCH, refused, status } from "./work-status.fixture.ts";
import { question, said, stopServers, take } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

const COMMENTS = "GET /v1/comments";
const REMOVED = `assign: removed the user from ${CARD}`;
/** `USER` as the API writes an id, and someone beside the user. */
const UUID = "01234567-89ab-cdef-0123-456789abcdef";
const ELSE = "99999999-8888-7777-6666-555555555555";
const to = (target: string) => ["status", "--card", CARD, "--to", target];
const later = () => [[question("2026-10-20T11:00:00Z")]];

describe("status", () => {
	// spec: work-status/a-move-releases task-board/a-move-after-the-answer
	test.each([
		["exploring [17]", () => ({ args: to("exploring") })],
		["applying [17]", () => ({ args: to("applying"), page: { status: "proposed" } })],
		["applied [24]", () => ({ args: to("applied"), cwd: clone(change("demo")).dir, page: { status: "applying" } })],
	])("a move to %s with nothing waiting prints the move, then the release", async (_, given) => {
		const run = await status({ ...given(), assign: [USER, OTHER] });
		expect([run.code, run.last, run.assign]).toEqual([0, REMOVED, [OTHER]]);
		expect(run.seen.slice(-5)).toEqual([PATCH, PAGE, COMMENTS, PATCH, COMMENTS]);
	});

	// spec: work-status/a-refused-move
	test("a refused move makes no release and reads no comments [21]", async () => {
		const run = await status({ args: to("exploring"), cards: 5, assign: [USER] });
		refused(run, "wip-full");
		expect(run.seen).toEqual([PAGE, "POST /v1/data_sources/ds1/query"]);
	});

	// spec: task-board/the-release-fails
	test("a failed release leaves the move's line and exit [28]", async () => {
		const run = await status({ args: to("exploring"), assign: [USER], fail: { [COMMENTS]: 500 } });
		expect([run.code, run.out.trim().split("\n")]).toEqual([0, [`status: ${CARD} approved → exploring`, "assign: failed — the comments read answered 500"]]);
	});

	// spec: task-board/the-restore-fails
	test("a failed restore exits 1 [38]", async () => {
		const next = { [COMMENTS]: [{ comments: [ASKED] }], [PATCH]: [{}, { fail: { [PATCH]: 500 } }] };
		const run = await status({ args: to("exploring"), assign: [USER], next });
		expect([run.code, run.last.startsWith("assign: failed — ")]).toEqual([1, true]);
	});
});

describe("take", () => {
	// spec: task-board/work-resumed
	test("an answered question: the release's line after the comments, the other person kept", async () => {
		const stub = { comments: [[question("2026-10-20T09:00:00Z"), said(USER, "2026-10-20T10:00:00Z", { plain_text: "Yes." })]], assign: [UUID, ELSE] };
		const run = await take({ stub });
		expect(run.code).toBe(0);
		expect(run.out).toContain(`question waiting: no\n${REMOVED}\n## Change`);
		expect(stub.assign).toEqual([ELSE]);
	});

	// spec: work-take/only-reads task-board/a-question-waits
	test("a waiting question with the user on Assign: every call a GET, no line", async () => {
		const run = await take({ stub: { comments: [[question("2026-10-20T09:00:00Z")]], assign: [UUID] } });
		expect([run.code, run.seen.every((s) => s.call.startsWith("GET ")), run.out.includes("assign:")]).toEqual([0, true, false]);
	});

	// spec: task-board/the-release-fails
	test("a failed release leaves the other lines and the exit [28]", async () => {
		const run = await take({ stub: { assign: [UUID], fail: { [PATCH]: 500 } } });
		expect(run.code).toBe(0);
		expect(run.out).toContain("question waiting: no\nassign: failed — the Assign write answered 500\n## Change");
	});

	// spec: task-board/the-restore-fails
	test("a failed restore exits 1 [38]", async () => {
		const run = await take({ stub: { assign: [UUID], next: { [PATCH]: [{ comments: later(), fail: { [PATCH]: 500 } }] } } });
		expect([run.code, run.out.includes("assign: failed — the restore")]).toEqual([1, true]);
	});
});

describe("finish --card", () => {
	const READ = "api repos/o/demo/pulls?head=o:feature&state=all&per_page=100";
	const READY = "pr ready 7 -R o/demo";
	const DRAFT = { before: [pull(7, "OPEN", true)] };

	// spec: work-finish/a-push-after-the-answer task-board/work-resumed
	test("nothing waits: the release's line before the ready switch, the rest as without it", async () => {
		const run = await finish({ gh: DRAFT, stub: { assign: [UUID] } });
		expect([run.code, run.last, run.calls]).toEqual([0, "finish: ready #7", [READ, "push", READY]]);
		expect(run.out).toContain(`${REMOVED}\nfinish: ready #7`);
	});

	// spec: work-finish/a-question-arrives-during-the-release
	test("a question during the release: the user back, and the draft left [37]", async () => {
		const run = await finish({ gh: DRAFT, stub: { assign: [UUID], next: { [PATCH]: [{ comments: later() }] } } });
		expect([run.code, run.last, run.calls]).toEqual([0, `finish: draft #7 — a question or a pause notice waits on ${CARD}`, [READ, "push"]]);
		expect(run.out).toContain(`assign: restored the user on ${CARD}\n`);
	});

	// spec: work-finish/a-question-arrives-during-the-release
	test("a question that only the release's first read finds: no write, and the draft left (local review)", async () => {
		const run = await finish({ gh: DRAFT, stub: { assign: [UUID], next: { "GET /v1/comments": [{ comments: later() }] } } });
		expect([run.code, run.last, run.calls, run.out.includes("assign:")]).toEqual([
			0,
			`finish: draft #7 — a question or a pause notice waits on ${CARD}`,
			[READ, "push"],
			false,
		]);
	});

	// spec: work-finish/a-question-arrives-during-the-release
	test("the release's second read failing: the user back, the draft left, exit 1 (local review)", async () => {
		const run = await finish({ gh: DRAFT, stub: { assign: [UUID], next: { [PATCH]: [{ fail: { [COMMENTS]: 500 } }] } } });
		expect([run.code, run.last, run.calls]).toEqual([1, "finish: draft #7 — the card's comments could not be read after the release", [READ, "push"]]);
	});

	// spec: task-board/the-release-fails
	test("a failed release leaves the other lines and the exit [28]", async () => {
		const run = await finish({ gh: DRAFT, stub: { assign: [UUID], fail: { [PATCH]: 500 } } });
		expect([run.code, run.last, run.calls]).toEqual([0, "finish: ready #7", [READ, "push", READY]]);
		expect(run.out).toContain("assign: failed — the Assign write answered 500\n");
	});

	// spec: task-board/the-restore-fails
	test("a failed restore exits 1 and leaves the draft [38]", async () => {
		const run = await finish({ gh: DRAFT, stub: { assign: [UUID], next: { [PATCH]: [{ comments: later(), fail: { [PATCH]: 500 } }] } } });
		expect([run.code, run.calls]).toEqual([1, [READ, "push"]]);
		expect(run.out).toContain("assign: failed — the restore");
	});
});
