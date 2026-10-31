/**
 * `work.ts status` for a fix card, whose `Pointer` names the pull request that
 * closes it: `done` proven by GitHub's word on that pull request of the
 * repository `origin` names, with no tree read, over `work-status.fixture.ts`.
 * Bracketed numbers are the proposal-stage `/zombies` ideas of
 * `fix-card-done-by-pr`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { basename, dirname } from "node:path";
import { cleanup } from "./diff-budget.fixture.ts";
import { CARD, change, clone, PAGE, PATCH, refused, status } from "./work-status.fixture.ts";

afterAll(cleanup);

const to = (target: string) => ["status", "--card", CARD, "--to", target];
/** Pull request 350 as the REST endpoint answers it, merged into `main` unless `fields` say otherwise. */
const pr = (fields: object = {}) => ({ answer: JSON.stringify({ number: 350, state: "closed", merged_at: "2026-10-31T00:00:00Z", base: { ref: "main" }, ...fields }) });
/** A clone whose `origin/main` holds a change, so a pointer that falls through to the tree reads one; and the query its origin gives. */
function checkout() {
	const { dir, bare } = clone(change("demo"));
	// A local path's last two segments are its owner and name, as remoteRepository() reads them.
	return { dir, query: `api repos/${basename(dirname(bare))}/demo/pulls/350` };
}

describe("a merged pull request proves done", () => {
	// spec: work-status/a-pull-request-merged-into-main
	// spec: task-board/a-fix-card-closed-by-a-pull-request
	test("pr:350 merged into main writes done, fetching nothing [10]", async () => {
		const { dir, query } = checkout();
		const run = await status({ args: to("done"), cwd: dir, page: { pointer: "pr:350" }, gh: pr() });
		expect([run.code, run.last, run.gh]).toEqual([0, `status: ${CARD} approved → done`, [query]]);
		expect(run.git.filter((call) => call === "fetch" || call === "archive")).toEqual([]);
	});

	// spec: work-status/a-pull-request-from-another-board
	test("this repository's own name before it reads as pr:350 [21]", async () => {
		const { dir, query } = checkout();
		const run = await status({ args: to("done"), cwd: dir, page: { pointer: "demo: pr:350" }, gh: pr() });
		expect([run.code, run.gh]).toEqual([0, [query]]);
	});

	// spec: work-status/a-proven-pull-request-at-a-full-limit
	test("from approved, five cards and a proven pull request make no count [22]", async () => {
		const run = await status({ args: to("done"), cwd: checkout().dir, page: { pointer: "pr:350" }, cards: 5, gh: pr() });
		expect([run.code, run.seen]).toEqual([0, [PAGE, PATCH]]);
	});
});

describe("a pull request that does not prove done", () => {
	// spec: work-status/a-pull-request-still-open
	test("an open one refuses naming it [13]", async () => {
		const run = await status({ args: to("done"), cwd: checkout().dir, page: { pointer: "pr:350" }, gh: pr({ state: "open", merged_at: null }) });
		refused(run, "no-evidence");
		expect([run.last.includes("350"), run.refusals[0].commit]).toEqual([true, undefined]);
	});

	// spec: work-status/a-pull-request-merged-into-another-branch
	test("one merged into release refuses naming the base [14]", async () => {
		const run = await status({ args: to("done"), cwd: checkout().dir, page: { pointer: "pr:350" }, gh: pr({ base: { ref: "release" } }) });
		refused(run, "no-evidence");
		expect(run.last).toContain("release");
	});

	// spec: work-status/a-pull-request-closed-without-merging
	test("one closed unmerged refuses [17]", async () => {
		refused(await status({ args: to("done"), cwd: checkout().dir, page: { pointer: "pr:350" }, gh: pr({ merged_at: null }) }), "no-evidence");
	});

	// spec: work-status/applied-asked-of-a-pull-request
	test.each(["applied", "proposed"])("--to %s refuses without reading it [15, 16]", async (target) => {
		const run = await status({ args: to(target), cwd: checkout().dir, page: { pointer: "pr:350" }, gh: pr() });
		refused(run, "no-evidence");
		expect(run.gh).toEqual([]);
	});

	// spec: work-status/github-does-not-answer
	test.each([
		["a gh that exits 1", "[18]", { ...pr(), code: 1 }],
		["no gh at all", "[19]", undefined],
	])("%s refuses under unread %s", async (_, __, gh) => {
		refused(await status({ args: to("done"), cwd: checkout().dir, page: { pointer: "pr:350" }, gh }), "unread");
	});
});

describe("a pointer that names no pull request", () => {
	// spec: work-status/a-pointer-that-is-not-a-number
	// spec: work-status/a-pull-request-from-another-board
	test.each([
		["pr:abc", "[11]"],
		["pr:0", "[11]"],
		["pr:035", "[11]"],
		["pr: 350", "[11]"],
		["PR:350", "[11]"],
		["#350", "[11]"],
		["pr:350 (fix)", "[11]"],
		["pr:350 ", "[12]"],
		["other: pr:350", "[20]"],
	])("%p refuses under no-pointer, quoting it, with no gh call %s", async (pointer) => {
		const run = await status({ args: to("done"), cwd: checkout().dir, page: { pointer }, gh: pr() });
		refused(run, "no-pointer");
		expect([run.last.includes(`"${pointer}"`), run.gh]).toEqual([true, []]);
	});
});
