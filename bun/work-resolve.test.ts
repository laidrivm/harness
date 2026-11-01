/**
 * `bun bun/work.ts resolve` run as a session runs it, over
 * `work-resolve.fixture.ts`: the usage, the pull request and its head, placing
 * the ids, and the resolves.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { USAGE } from "./work.ts";
import { checkout } from "./work-finish.fixture.ts";
import { A, B, open, page, resolve, thread } from "./work-resolve.fixture.ts";

afterAll(() => {
	cleanup();
});

const PR7 = { pulls: [[open(7)]] };
const args = (...ids: string[]) => ["resolve", "--pr", "7", "--head", A, ...ids.flatMap((id) => ["--comment", id])];

/** A run that refused: exit 1, the refusal its last line, no mutation. */
function refused(run: Awaited<ReturnType<typeof resolve>>, ...said: string[]) {
	expect(run.code).toBe(1);
	expect(run.lines.at(-1)).toStartWith("resolve: refused — ");
	for (const part of said) expect(run.lines.at(-1)).toContain(part);
	expect(run.mutations).toEqual([]);
}

describe("the arguments", () => {
	// spec: work-resolve/a-short-or-missing-head
	// spec: work-resolve/no-comment-named
	// spec: work-resolve/a-comment-id-with-a-tail
	// spec: work-resolve/two-pull-requests-named
	test.each([
		["no --comment", ["resolve", "--pr", "7", "--head", A]],
		["--comment 123x", args("123x")],
		['--comment ""', args("")],
		["--comment -1", args("-1")],
		["--pr 0", ["resolve", "--pr", "0", "--head", A, "--comment", "1"]],
		["no --pr", ["resolve", "--head", A, "--comment", "1"]],
		["--pr 7 --pr 8", ["resolve", "--pr", "7", "--pr", "8", "--head", A, "--comment", "1"]],
		["no --head", ["resolve", "--pr", "7", "--comment", "1"]],
		["--head 1a2b3c4", ["resolve", "--pr", "7", "--head", "1a2b3c4", "--comment", "1"]],
		["--head PUSHED_SHA", ["resolve", "--pr", "7", "--head", "PUSHED_SHA", "--comment", "1"]],
		["two --head", ["resolve", "--pr", "7", "--head", A, "--head", A, "--comment", "1"]],
		["a positional", [...args("1"), "more"]],
		["an unknown option", [...args("1"), "--force"]],
	])("%s prints the usage and exits 2, calling neither git nor gh", async (_, given) => {
		const run = await resolve({ args: given });
		expect([run.code, run.err.trim(), run.calls]).toEqual([2, USAGE.join("\n"), []]);
	});

	// spec: work-resolve/several-comments
	test("both ids of --comment 1 --comment 2 reach the command", async () => {
		const run = await resolve({ args: args("1", "2"), gh: { ...PR7, pages: [page(thread("1"), thread("2"))] } });
		expect([run.code, run.lines]).toEqual([0, ["resolve: 1 resolved", "resolve: 2 resolved"]]);
	});
});

describe("the pull request", () => {
	// spec: work-resolve/a-detached-head
	test("a detached HEAD refuses before any thread read", async () => {
		const cwd = checkout();
		git(cwd, "checkout", "-q", "--detach");
		const run = await resolve({ cwd, gh: PR7 });
		refused(run, "HEAD names no branch");
		expect(run.threads).toEqual([]);
	});

	// spec: work-resolve/another-branchs-pull-request
	test("--pr 8 on a branch open as #7 refuses naming #7", async () => {
		const run = await resolve({ args: ["resolve", "--pr", "8", "--head", A, "--comment", "11"], gh: PR7 });
		refused(run, "#8", "#7");
		expect(run.threads).toEqual([]);
	});

	// spec: work-resolve/a-branch-open-into-two-bases
	test("--pr 9 on a branch open as #7 and #9 reads #9's threads", async () => {
		const run = await resolve({ args: ["resolve", "--pr", "9", "--head", A, "--comment", "11"], gh: { pulls: [[open(7, B), open(9)]], pages: [page(thread("11"))] } });
		expect([run.code, run.lines]).toEqual([0, ["resolve: 11 resolved"]]);
		expect(run.threads[0].gh).toContain("n=9");
	});

	test("a failed pull-request read refuses naming gh auth status", async () => {
		refused(await resolve({ gh: { ...PR7, pullsCode: [1] } }), "gh auth status");
	});

	test("HARNESS_GITHUB_APP_MINT set refuses before any gh call", async () => {
		const run = await resolve({ gh: PR7, env: { HARNESS_GITHUB_APP_MINT: "/nowhere" } });
		refused(run, "HARNESS_GITHUB_APP_MINT");
		expect(run.calls.filter((c) => c.gh)).toEqual([]);
	});
});

describe("the head", () => {
	// spec: work-resolve/the-head-matches
	test("--head A with #7's head A reads the pull requests once and goes on", async () => {
		const run = await resolve({ gh: { ...PR7, pages: [page(thread("11"))] } });
		expect([run.code, run.reads.length, run.threads.length]).toEqual([0, 1, 1]);
	});

	// spec: work-resolve/the-api-catches-up
	test("B then A goes on after two reads, the second 2 s after the first", async () => {
		const run = await resolve({ gh: { pulls: [[open(7, B)], [open(7)]], pages: [page(thread("11"))] } });
		expect([run.code, run.reads.length, run.threads.length]).toEqual([0, 2, 1]);
		expect(run.reads[1].at - run.reads[0].at).toBeGreaterThanOrEqual(2000);
	}, 10_000);

	// spec: work-resolve/another-head
	test("B twice refuses naming A and B, reading no thread", async () => {
		const run = await resolve({ gh: { pulls: [[open(7, B)]], pages: [page(thread("11"))] } });
		refused(run, A, B);
		expect([run.reads.length, run.threads]).toEqual([2, []]);
	}, 10_000);

	test("a second read that fails refuses the same way", async () => {
		const run = await resolve({ gh: { pulls: [[open(7, B)]], pullsCode: [0, 1], pages: [page(thread("11"))] } });
		refused(run, A, B);
		expect([run.reads.length, run.threads]).toEqual([2, []]);
	}, 10_000);
});

describe("placing the ids", () => {
	test("no threads at all refuses the id as unplaced", async () => {
		refused(await resolve({ gh: { ...PR7, pages: [page()] } }), "11");
	});

	// spec: work-resolve/a-replys-id
	test("a reply's id inside the bot's thread refuses", async () => {
		refused(await resolve({ args: args("12"), gh: { ...PR7, pages: [page(thread("11", { replies: ["12"] }))] } }), "12");
	});

	// spec: work-resolve/a-thread-the-user-opened
	test("one of two ids opening the user's thread refuses the whole call", async () => {
		const run = await resolve({ args: args("11", "12"), gh: { ...PR7, pages: [page(thread("11"), thread("12", { login: "laidrivm" }))] } });
		refused(run, "12");
		expect(run.lines.at(-1)).not.toContain("11");
	});

	// spec: work-resolve/a-login-that-only-starts-like-the-bots
	// spec: work-resolve/a-thread-whose-author-is-gone
	test.each([
		["coderabbitai-x", "coderabbitai-x"],
		["a null author", null],
	])("%s refuses", async (_, login) => {
		refused(await resolve({ gh: { ...PR7, pages: [page(thread("11", { login }))] } }), "11");
	});

	test("a failed thread read refuses", async () => {
		refused(await resolve({ gh: { ...PR7, threadsCode: 1 } }), "#7");
	});

	// spec: work-resolve/threads-past-the-first-page
	test("an id opening the 101st thread, on the second page, is placed", async () => {
		const first = page(...Array.from({ length: 100 }, (_, i) => thread(String(i + 1))));
		const run = await resolve({ args: args("101"), gh: { ...PR7, pages: [first, page(thread("101"))] } });
		expect([run.code, run.lines, run.mutations]).toEqual([0, ["resolve: 101 resolved"], ["T_101"]]);
		expect(run.threads[0].gh).toEqual(expect.arrayContaining(["--paginate", "--slurp"]));
	});

	test("4433138725, past 2^31, is placed by its fullDatabaseId string", async () => {
		const run = await resolve({ args: args("4433138725"), gh: { ...PR7, pages: [page(thread("4433138725"))] } });
		expect([run.code, run.mutations]).toEqual([0, ["T_4433138725"]]);
	});
});

describe("the resolves", () => {
	test("one unresolved id makes one call with its thread's id", async () => {
		const run = await resolve({ gh: { ...PR7, pages: [page(thread("11"))] } });
		expect([run.code, run.lines, run.mutations]).toEqual([0, ["resolve: 11 resolved"], ["T_11"]]);
	});

	// spec: work-resolve/one-resolved-one-open
	test("a resolved and an unresolved one: one call, a skip and a resolved line", async () => {
		const run = await resolve({ args: args("1", "2"), gh: { ...PR7, pages: [page(thread("1", { resolved: true }), thread("2"))] } });
		expect([run.code, run.lines, run.mutations]).toEqual([0, ["resolve: 1 already resolved, skipped", "resolve: 2 resolved"], ["T_2"]]);
	});

	test("the same id named twice resolves once", async () => {
		const run = await resolve({ args: args("11", "11"), gh: { ...PR7, pages: [page(thread("11"))] } });
		expect([run.code, run.mutations]).toEqual([0, ["T_11"]]);
	});

	// spec: work-resolve/an-outdated-thread
	test("an outdated unresolved thread is resolved", async () => {
		const run = await resolve({ gh: { ...PR7, pages: [page(thread("11", { outdated: true }))] } });
		expect([run.code, run.mutations]).toEqual([0, ["T_11"]]);
	});

	// spec: work-resolve/a-resolve-that-fails
	test("the second of three failing leaves the first, names the second, skips the third", async () => {
		const run = await resolve({ args: args("1", "2", "3"), gh: { ...PR7, pages: [page(thread("1"), thread("2"), thread("3"))], fail: [1] } });
		expect(run.code).toBe(1);
		expect(run.mutations).toEqual(["T_1", "T_2"]);
		expect(run.lines).toEqual(["resolve: 1 resolved", "resolve: 2 failed — GraphQL: stub failure"]);
	});
});
