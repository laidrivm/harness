/**
 * `work.ts finish` asking CodeRabbit once to review a head whose review it
 * skipped, over `work-finish.fixture.ts` and the calls
 * `work-finish-review.fixture.ts` names.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import { out } from "./goal-check.fixture.ts";
import { checkout, finish } from "./work-finish.fixture.ts";
import {
	ASK,
	COMMENTS,
	DRAFT,
	LIMITED,
	RUNNING,
	runs,
	SKIPPED,
	short,
	times,
	watched,
} from "./work-finish-review.fixture.ts";
import { stopServers } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

/** A `@coderabbitai review` comment as `--jq` prints it, posted at `at`. */
const asked = (at: string, body = "@coderabbitai review") => ({ created_at: at, body });
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * `finish` on draft #7 in a checkout naming CodeRabbit, the comments made from
 * `HEAD`'s committer date in ms, the check runs answering `answers` in turn.
 */
async function dated(comments: (committed: number) => object[], answers: (object[] | number)[] = [[]]) {
	const cwd = checkout(true);
	const committed = Date.parse(out(cwd, "show", "-s", "--format=%cI", "HEAD"));
	return finish({ cwd, gh: { before: DRAFT, runs: answers, comments: comments(committed) } });
}

describe("the request for a skipped head", () => {
	// spec: work-finish/a-first-request
	test("skipped and no request posts exactly one and says it asked", async () => {
		const run = await watched([[SKIPPED]], { comments: [{ created_at: "2026-10-31T09:56:00Z", body: "LGTM" }] });
		expect(run.calls.filter((call) => call.startsWith("pr comment"))).toEqual([ASK]);
		expect(run.calls.slice(-3)).toEqual([COMMENTS, runs(run.cwd), ASK]);
		expect([run.code, run.last]).toEqual([
			0,
			`finish: ready #7 — CodeRabbit skipped ${short(run.cwd)}; asked for a review`,
		]);
	});

	// spec: work-finish/already-asked-for-this-head
	test.each([
		["at the head's earliest run's start", asked("2026-10-31T09:55:22Z")],
		["padded with whitespace", asked("2026-10-31T10:30:00Z", "  @coderabbitai review\n")],
		// The user's answer 11 b (2026-11-01).
		["for a full review", asked("2026-10-31T10:30:00Z", "@coderabbitai full review")],
	])("a request %s counts as asked", async (_, comment) => {
		const run = await watched([[SKIPPED]], { comments: [comment] });
		expect(run.calls.at(-1)).toBe(COMMENTS);
		expect([run.code, run.last]).toEqual([
			0,
			`finish: ready #7 — CodeRabbit skipped ${short(run.cwd)}; a review was already asked for`,
		]);
	});

	// spec: work-finish/an-older-request
	test.each([
		["a second earlier", asked("2026-10-31T09:55:21Z")],
		["asking more than the review", asked("2026-10-31T10:30:00Z", "@coderabbitai review please")],
	])("a request %s does not count", async (_, comment) => {
		const run = await watched([[SKIPPED]], { comments: [comment] });
		expect(run.calls.at(-1)).toBe(ASK);
		expect(run.last).toEndWith("; asked for a review");
	});

	test("with no start time on the head's runs, a request at the committer date counts as asked", async () => {
		const run = await dated((c) => [asked(iso(c))], [[{ ...SKIPPED, started_at: null }]]);
		expect(run.last).toEndWith("; a review was already asked for");
	});

	test("with the head's runs out of time order, the earliest start is the one compared", async () => {
		const later = { ...SKIPPED, started_at: "2026-10-31T09:55:30Z" };
		const run = await watched([[later, SKIPPED]], { comments: [asked("2026-10-31T09:55:25Z")] });
		expect(run.last).toEndWith("; a review was already asked for");
	});

	// spec: work-finish/a-rate-limit-by-the-read-before-the-post
	// spec: work-finish/the-read-before-the-post-fails
	test("a read right before the post giving rate limited, or failing, posts nothing and says which", async () => {
		const skips = times(19, "").map(() => [SKIPPED]);
		const limited = await watched([...skips, [SKIPPED, LIMITED]]);
		const failed = await watched([...skips, 1]);
		for (const run of [limited, failed]) expect(run.calls.slice(-2)).toEqual([COMMENTS, runs(run.cwd)]);
		expect([limited.code, limited.last]).toEqual([
			0,
			`finish: ready #7 — CodeRabbit rate limited on ${short(limited.cwd)}; no review asked for`,
		]);
		expect([failed.code, failed.last]).toEqual([
			0,
			`finish: ready #7 — CodeRabbit's runs on ${short(failed.cwd)} unread: gh exited 1`,
		]);
	});

	// spec: work-finish/the-comments-cannot-be-read
	test("a failed comment read posts nothing and names why", async () => {
		const run = await watched([[SKIPPED]], { comments: 1 });
		expect(run.calls.at(-1)).toBe(COMMENTS);
		expect([run.code, run.last]).toEqual([
			0,
			`finish: ready #7 — CodeRabbit skipped ${short(run.cwd)}; comments unread, nothing asked: gh exited 1`,
		]);
	});

	// spec: work-finish/the-post-fails
	test("a post gh refuses is made once and named", async () => {
		const run = await watched([[SKIPPED]], { comment: 1 });
		expect(run.calls.filter((call) => call === ASK)).toHaveLength(1);
		expect([run.code, run.last]).toEqual([
			0,
			`finish: ready #7 — CodeRabbit skipped ${short(run.cwd)}; the request failed, gh exited 1`,
		]);
	});

	test.each<[string, object[] | number]>([
		["rate limited", [SKIPPED, LIMITED]],
		["reviewing", [SKIPPED, RUNNING]],
		["unread", 1],
	])("%s reads no comments", async (_, after) => {
		const run = await watched([[SKIPPED], after]);
		expect(run.code).toBe(0);
		expect(run.calls.filter((call) => call === COMMENTS || call.startsWith("pr comment"))).toEqual([]);
	});
});

describe("the request for a head with no run", () => {
	const none = (cwd: string) => `finish: ready #7 — no CodeRabbit run on ${short(cwd)} after 18 reads`;

	// spec: work-finish/a-first-request-for-a-head-with-no-run
	test("no run through the reads and the read before the post, and no request since the commit, posts one", async () => {
		const run = await dated((c) => [{ created_at: iso(c + 1000), body: "LGTM" }]);
		expect(run.calls.filter((call) => call.startsWith("pr comment"))).toEqual([ASK]);
		expect(run.calls.slice(-3)).toEqual([COMMENTS, runs(run.cwd), ASK]);
		expect([run.code, run.last]).toEqual([0, `${none(run.cwd)}; asked for a review`]);
	});

	// spec: work-finish/already-asked-for-a-head-with-no-run
	test.each<[string, (c: number) => object[]]>([
		["at the committer date", (c) => [asked(iso(c))]],
		["a minute after it", (c) => [asked(iso(c + 60_000))]],
		// The user's answer 11 b (2026-11-01).
		["for a full review after it", (c) => [asked(iso(c + 60_000), "@coderabbitai full review")]],
	])("a request %s counts as asked", async (_, comments) => {
		const run = await dated(comments);
		expect(run.calls.at(-1)).toBe(COMMENTS);
		expect([run.code, run.last]).toEqual([0, `${none(run.cwd)}; a review was already asked for`]);
	});

	// spec: work-finish/an-older-request
	test("a request a second before the committer date does not count", async () => {
		const run = await dated((c) => [asked(iso(c - 1000))]);
		expect(run.calls.at(-1)).toBe(ASK);
		expect(run.last).toBe(`${none(run.cwd)}; asked for a review`);
	});

	// spec: work-finish/a-run-that-starts-after-the-request
	test("a request after the commit and before a skipped run's later start counts as asked", async () => {
		const cwd = checkout(true);
		const c = Date.parse(out(cwd, "show", "-s", "--format=%cI", "HEAD"));
		const late = { ...SKIPPED, started_at: iso(c + 10_000) };
		const run = await finish({ cwd, gh: { before: DRAFT, runs: [[late]], comments: [asked(iso(c + 5000))] } });
		expect(run.calls.at(-1)).toBe(COMMENTS);
		expect(run.last).toBe(`finish: ready #7 — CodeRabbit skipped ${short(cwd)}; a review was already asked for`);
	});

	test.each<[string, object[], string]>([
		["skipped posts", [SKIPPED], "; asked for a review"],
		["reviewing posts nothing and ends on reviewing", [RUNNING], ""],
	])("no run through the reads and the read before the post giving %s", async (_, fresh, tail) => {
		const run = await dated(() => [], [...times(30, "").map(() => []), fresh]);
		const ends = tail ? [COMMENTS, runs(run.cwd), ASK] : [COMMENTS, runs(run.cwd)];
		expect(run.calls.slice(-ends.length)).toEqual(ends);
		expect(run.last).toBe(
			tail ? `${none(run.cwd)}${tail}` : `finish: ready #7 — CodeRabbit reviewing ${short(run.cwd)}`,
		);
	});
});
