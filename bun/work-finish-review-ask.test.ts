/**
 * `work.ts finish` asking CodeRabbit once to review a head whose review it
 * skipped, over `work-finish.fixture.ts` and the calls
 * `work-finish-review.fixture.ts` names.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import { ASK, COMMENTS, LIMITED, RUNNING, runs, SKIPPED, short, times, watched } from "./work-finish-review.fixture.ts";
import { stopServers } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

/** A `@coderabbitai review` comment as `--jq` prints it, posted at `at`. */
const asked = (at: string, body = "@coderabbitai review") => ({ created_at: at, body });

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

	test("with no start time on the head's runs, an exact request still counts as asked", async () => {
		const run = await watched([[{ ...SKIPPED, started_at: null }]], { comments: [asked("2026-10-31T09:55:25Z")] });
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
