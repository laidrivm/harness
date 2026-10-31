/**
 * `work.ts finish` where the checkout tracks `.coderabbit.yaml`: the wait for
 * CodeRabbit's run before the ready switch, and the reads of `HEAD`'s state
 * after it, over `work-finish.fixture.ts` with a 1 ms poll interval.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { head } from "./goal-check.fixture.ts";
import { BRANCH, CARD, checkout, finish, pull } from "./work-finish.fixture.ts";
import { question, stopServers } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

const READ = `api repos/o/demo/pulls?head=o:${BRANCH}&state=all&per_page=100`;
const READY = "pr ready 7 -R o/demo";
const DRAFT = [pull(7, "OPEN", true)];
const OPENING = ["finish", "--card", CARD, "--title", "Demo", "--body-file", "body.md"];

/** One check run of CodeRabbit's app. */
const run = (status: string, conclusion: string | null, title: string) => ({
	name: "CodeRabbit",
	status,
	conclusion,
	started_at: "2026-10-31T09:55:22Z",
	output: { title },
	app: { slug: "coderabbitai" },
});
const SKIPPED = run("completed", "skipped", "Review skipped");
const RUNNING = run("in_progress", null, "Review in progress");
const DONE = run("completed", "success", "Finished");
const LIMITED = run("completed", "neutral", "Review rate limited");

/** The check-run read of `cwd`'s `HEAD`, as the stub logs it. */
const runs = (cwd: string) => `api repos/o/demo/commits/${head(cwd)}/check-runs?filter=all&per_page=100 --paginate --jq .check_runs[]`;
const times = (n: number, call: string) => Array<string>(n).fill(call);
const short = (cwd: string) => head(cwd).slice(0, 7);

/** `finish` on draft #7 in a checkout tracking `.coderabbit.yaml`, the check runs answering `answers` in turn. */
async function watched(answers: (object[] | number)[], cwd = checkout(true)) {
	return { cwd, ...(await finish({ cwd, gh: { before: DRAFT, runs: answers } })) };
}

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
		expect(run.seen).toEqual(["GET /v1/comments"]);
	});

	test("an in-progress run alone does not end the wait", async () => {
		const run = await watched([[RUNNING], [RUNNING], [SKIPPED, DONE]]);
		expect(run.calls).toEqual([READ, "push", ...times(3, runs(run.cwd)), READY, runs(run.cwd)]);
		expect(run.last).toBe(`finish: ready #7 — CodeRabbit reviewed ${short(run.cwd)}`);
	});

	// spec: work-finish/no-run-within-the-wait
	test("no completed run in 12 reads says so and still marks ready", async () => {
		const run = await watched([[]]);
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

	test("a failed read before the ready switch counts as none and the reads go on", async () => {
		const run = await watched([1, [SKIPPED], [RUNNING]]);
		expect(run.calls).toEqual([READ, "push", ...times(2, runs(run.cwd)), READY, runs(run.cwd)]);
		expect(run.out).not.toContain("no completed CodeRabbit run");
	});

	// spec: work-finish/a-question-waits
	test("a question waiting leaves the draft, and the log ends on the pre-ready reads", async () => {
		const cwd = checkout(true);
		const run = await finish({ cwd, gh: { before: DRAFT, runs: [[], [SKIPPED]] }, stub: { comments: [[question("2026-10-27T00:00:00.000Z")]] } });
		expect(run.calls).toEqual([READ, "push", ...times(2, runs(cwd))]);
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
	test("18 reads of skipped, and 17 then a failure, end on the skipped line", async () => {
		const all = await watched([[SKIPPED]]);
		const failing = await watched([[SKIPPED], ...times(17, "").map(() => [SKIPPED]), 1]);
		for (const run of [all, failing]) {
			expect(run.calls).toEqual([READ, "push", runs(run.cwd), READY, ...times(18, runs(run.cwd))]);
			expect([run.code, run.last]).toEqual([0, `finish: ready #7 — CodeRabbit skipped ${short(run.cwd)}`]);
		}
	});

	// spec: work-finish/unread
	test("every read after the switch failing ends unread", async () => {
		const run = await watched([[SKIPPED], 1]);
		expect([run.code, run.last]).toEqual([0, `finish: ready #7 — CodeRabbit's runs on ${short(run.cwd)} unread: gh exited 1`]);
	});
});
