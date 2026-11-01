/**
 * `work.ts finish` where the checkout tracks `.coderabbit.yaml`: the wait for
 * CodeRabbit's run before the ready switch, and the reads of `HEAD`'s state
 * after it, over `work-finish.fixture.ts` with a 1 ms poll interval and the
 * calls `work-finish-review.fixture.ts` names; the request for a skipped head
 * is in `work-finish-review-ask.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { BRANCH, CARD, checkout, finish } from "./work-finish.fixture.ts";
import {
	ASK,
	COMMENTS,
	DONE,
	DRAFT,
	LIMITED,
	OPENING,
	READ,
	READY,
	RUNNING,
	run,
	runs,
	SKIPPED,
	short,
	times,
	watched,
} from "./work-finish-review.fixture.ts";
import { home, question, stopServers } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

describe("where CodeRabbit is configured", () => {
	// spec: work-finish/a-repository-without-coderabbits-config
	test("no tracked .coderabbit.yaml, and a gitignored untracked one, read no check run and end on the ready line", async () => {
		const bare = await finish({ gh: { before: DRAFT } });
		const ignored = checkout();
		writeFileSync(join(ignored, ".coderabbit.yaml"), "reviews: {}\n");
		writeFileSync(join(ignored, ".git", "info", "exclude"), ".coderabbit.yaml\n");
		const run = await finish({ cwd: ignored, gh: { before: DRAFT } });
		for (const { calls, code, last } of [bare, run]) expect({ calls, code, last }).toEqual({ calls: [READ, "push", READY], code: 0, last: "finish: ready #7" });
	});

	test("a checkout whose tracked files cannot be listed after the push ends on the open draft, exit 1", async () => {
		// The hook runs after `finish` read a clean tree; a broken index makes `git ls-files` fail.
		const run = await finish({ cwd: checkout(true), gh: { before: DRAFT }, during: "printf x > .git/index" });
		expect(run.calls).toEqual([READ, "push"]);
		expect(run.code).toBe(1);
		expect(run.last).toStartWith("finish: draft #7 — the checkout's tracked files could not be listed: ");
	});

	// spec: work-finish/run-from-a-subdirectory
	test("run from a subdirectory of a checkout tracking it at the top, finish reads the check runs", async () => {
		const top = checkout(true);
		const sub = join(top, "sub");
		mkdirSync(sub);
		const run = await finish({ cwd: sub, gh: { before: DRAFT, runs: [[SKIPPED], [RUNNING]] } });
		expect(run.calls).toEqual([READ, "push", runs(top), READY, runs(top)]);
		expect(run.last).toBe(`finish: ready #7 — CodeRabbit reviewing ${short(top)}`);
	});
});

describe("the wait before the ready switch", () => {
	// spec: work-finish/the-drafts-skip-arrives
	test("a first finish: the PR read, the push, the opening and re-read, the reads until a completed run, the ready, then the reads", async () => {
		const cwd = checkout(true);
		writeFileSync(join(cwd, "body.md"), "Body\n");
		const gh = { before: [], after: DRAFT, runs: [[], [], [SKIPPED], [SKIPPED], [SKIPPED, RUNNING]] };
		const run = await finish({ cwd, args: OPENING, gh });
		const create = `pr create --draft -R o/demo --base main --head ${BRANCH} --title Demo --body-file body.md`;
		expect(run.calls).toEqual([READ, "push", create, READ, ...times(3, runs(cwd)), READY, ...times(2, runs(cwd))]);
		expect([run.code, run.last]).toEqual([0, `finish: ready #7 — CodeRabbit reviewing ${short(cwd)}`]);
		// The card's record once, then the question before the wait and again before the ready switch.
		expect(run.seen).toEqual([`GET /v1/pages/${CARD}`, `GET /v1/blocks/${CARD}/children`, "GET /v1/comments", "GET /v1/comments"]);
	});

	test("an in-progress run alone does not end the wait", async () => {
		const run = await watched([[RUNNING], [RUNNING], [SKIPPED, DONE]]);
		expect(run.calls).toEqual([READ, "push", ...times(3, runs(run.cwd)), READY, runs(run.cwd)]);
		expect(run.last).toBe(`finish: ready #7 — CodeRabbit reviewed ${short(run.cwd)}`);
	});

	// spec: work-finish/no-run-within-the-wait
	test("no completed run in 12 reads says so and still marks ready", async () => {
		const run = await watched([]);
		expect(run.calls).toEqual([READ, "push", ...times(12, runs(run.cwd)), READY, ...times(18, runs(run.cwd))]);
		expect(run.out).toContain(`finish: no completed CodeRabbit run on ${short(run.cwd)} after 12 reads\n`);
		expect([run.code, run.last]).toEqual([0, `finish: ready #7 — no CodeRabbit run on ${short(run.cwd)} after 18 reads`]);
	});

	// spec: work-finish/a-branch-pushed-before-its-draft
	test("origin already at HEAD and the draft opened in this call: the reads go on until a completed run appears", async () => {
		const cwd = checkout(true);
		writeFileSync(join(cwd, "body.md"), "Body\n");
		git(cwd, "push", "-q", "--no-verify", "origin", BRANCH);
		const run = await finish({ cwd, args: OPENING, gh: { before: [], after: DRAFT, runs: [[], [], [], [SKIPPED], [RUNNING]] } });
		const create = `pr create --draft -R o/demo --base main --head ${BRANCH} --title Demo --body-file body.md`;
		expect(run.calls).toEqual([READ, create, READ, ...times(4, runs(cwd)), READY, runs(cwd)]);
		expect(run.last).toBe(`finish: ready #7 — CodeRabbit reviewing ${short(cwd)}`);
	});

	// The user's answer 10 b (2026-11-01): three failed reads in a row end a wait.
	// spec: work-finish/three-failed-reads-before-the-switch
	test("three failed reads in a row end the wait before the switch, saying the last one's reason, and still mark ready", async () => {
		const run = await watched([1, 1, 1, [SKIPPED, RUNNING]]);
		expect(run.calls).toEqual([READ, "push", ...times(3, runs(run.cwd)), READY, runs(run.cwd)]);
		expect(run.out).toContain(`finish: no completed CodeRabbit run on ${short(run.cwd)} after 3 reads; the last read failed: gh exited 1\n`);
		expect(run.last).toBe(`finish: ready #7 — CodeRabbit reviewing ${short(run.cwd)}`);
	});

	test("a read that answers between failures starts the count again", async () => {
		const run = await watched([1, 1, [], 1, 1, [SKIPPED], [RUNNING]]);
		expect(run.calls).toEqual([READ, "push", ...times(6, runs(run.cwd)), READY, runs(run.cwd)]);
	});

	test("missing ask settings end the call before any wait", async () => {
		const cwd = checkout(true);
		const run = await finish({ cwd, gh: { before: DRAFT, runs: [[SKIPPED]] }, config: home(false) });
		expect(run.calls).toEqual([READ, "push"]);
		expect(run.code).toBe(1);
	});

	test("a failed read before the ready switch counts as none and the reads go on", async () => {
		const run = await watched([1, [SKIPPED], [RUNNING]]);
		expect(run.calls).toEqual([READ, "push", ...times(2, runs(run.cwd)), READY, runs(run.cwd)]);
		expect(run.out).not.toContain("no completed CodeRabbit run");
	});

	test("with no --card, finish still waits for a completed run before the ready switch", async () => {
		const cwd = checkout(true);
		const run = await finish({ cwd, args: ["finish"], gh: { before: DRAFT, runs: [[], [SKIPPED], [RUNNING]] } });
		expect(run.calls).toEqual([READ, "push", ...times(2, runs(cwd)), READY, runs(cwd)]);
		expect(run.last).toBe(`finish: ready #7 — CodeRabbit reviewing ${short(cwd)}`);
	});

	test("a ready switch gh refuses ends on the draft, exit 1, with no read after it", async () => {
		const run = await watched([[SKIPPED]], { ready: 1 });
		expect(run.calls).toEqual([READ, "push", runs(run.cwd), READY]);
		expect([run.code, run.last]).toEqual([1, "finish: draft #7 — gh pr ready 7 failed"]);
	});

	// spec: work-finish/a-question-already-waits
	// The user's answer 12 b (2026-11-01): the question is read before the wait too.
	test("a question already waiting leaves the draft with no wait and no check-run read", async () => {
		const cwd = checkout(true);
		const run = await finish({ cwd, gh: { before: DRAFT, runs: [[], [SKIPPED]] }, stub: { comments: [[question("2026-10-27T00:00:00.000Z")]] } });
		expect(run.calls).toEqual([READ, "push"]);
		expect([run.code, run.last]).toEqual([0, `finish: draft #7 — a question waits on ${CARD}`]);
	});
});

describe("the reads after the ready switch", () => {
	// spec: work-finish/the-review-starts
	test("reviewing after ready ends on the reviewing line", async () => {
		const run = await watched([[SKIPPED], [SKIPPED], [SKIPPED, RUNNING]]);
		expect([run.code, run.last]).toEqual([0, `finish: ready #7 — CodeRabbit reviewing ${short(run.cwd)}`]);
	});

	// spec: work-finish/one-failed-read-among-others
	test("a failed read after the switch, then reviewing, ends on reviewing", async () => {
		const run = await watched([[SKIPPED], [SKIPPED], 1, [RUNNING]]);
		expect(run.calls).toEqual([READ, "push", runs(run.cwd), READY, ...times(3, runs(run.cwd))]);
		expect([run.code, run.last]).toEqual([0, `finish: ready #7 — CodeRabbit reviewing ${short(run.cwd)}`]);
	});

	// spec: work-finish/a-rate-limit
	test("reviewed, rate limited and another conclusion end on their lines", async () => {
		const reviewed = await watched([[SKIPPED], [SKIPPED, DONE]]);
		const limited = await watched([[SKIPPED], [SKIPPED, LIMITED]]);
		const other = await watched([[SKIPPED], [SKIPPED, run("completed", "failure", "Review failed")]]);
		expect([reviewed, limited, other].map(({ code, last }) => [code, last])).toEqual([
			[0, `finish: ready #7 — CodeRabbit reviewed ${short(reviewed.cwd)}`],
			[0, `finish: ready #7 — CodeRabbit rate limited on ${short(limited.cwd)}; no review asked for`],
			[0, `finish: ready #7 — CodeRabbit failure "Review failed" on ${short(other.cwd)}`],
		]);
	});

	// spec: work-finish/still-skipped-when-the-reads-end
	// spec: work-finish/a-last-read-that-fails-after-skips
	test("18 reads of skipped, and 17 then a failure, go on to the request", async () => {
		const all = await watched([[SKIPPED]]);
		const failing = await watched([[SKIPPED], ...times(17, "").map(() => [SKIPPED]), 1, [SKIPPED]]);
		for (const run of [all, failing]) {
			expect(run.calls).toEqual([READ, "push", runs(run.cwd), READY, ...times(18, runs(run.cwd)), COMMENTS, runs(run.cwd), ASK]);
			expect([run.code, run.last]).toEqual([0, `finish: ready #7 — CodeRabbit skipped ${short(run.cwd)}; asked for a review`]);
		}
	});

	// spec: work-finish/unread
	test("every read after the switch failing ends unread after three", async () => {
		const run = await watched([[SKIPPED], 1]);
		expect(run.calls).toEqual([READ, "push", runs(run.cwd), READY, ...times(3, runs(run.cwd))]);
		expect([run.code, run.last]).toEqual([0, `finish: ready #7 — CodeRabbit's runs on ${short(run.cwd)} unread: gh exited 1`]);
	});
});
