/**
 * `bun bun/work.ts take`'s failures, over `work-take.fixture.ts`: each exits 1
 * on a line naming its step after what was already printed, and no line holds
 * the token, which `take()` checks on every run.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { bin, CARD, checkout, home, page, question, said, stopServers, take, USER } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

const DEMO = { "openspec/changes/demo/proposal.md": "# demo proposal\n" };
const failed = (out: string) => out.trimEnd().split("\n").at(-1);

describe("take fails closed", () => {
	// spec: work-take/no-ask-settings
	test("no ask settings: no call made", async () => {
		const run = await take({ config: home(false) });
		expect([run.code, failed(run.out), run.seen, run.ran]).toEqual([1, "take: the ask settings read failed — no ask integration is configured", [], ""]);
	});

	test("settings its group may read: the mode named, and no call", async () => {
		const run = await take({ config: home(true, 0o640) });
		expect([run.code, failed(run.out)?.startsWith("take: the ask settings read failed — notion-bot: "), run.seen]).toEqual([1, true, []]);
		expect(failed(run.out)).toContain("has mode 0640");
	});

	// spec: work-take/a-page-the-integration-cannot-read
	test("403 on the page read: the step and the status, and no change file", async () => {
		const run = await take({ cwd: checkout(DEMO), stub: { page: page("openspec/changes/demo/"), fail: { [`GET /v1/pages/${CARD}`]: 403 } } });
		expect([run.code, failed(run.out)]).toEqual([1, "take: the page read failed — the page read answered 403"]);
		expect(run.out).not.toContain("demo proposal");
		expect(run.ran).toBe("");
	});

	test("500 on the markdown read", async () => {
		const run = await take({ stub: { fail: { [`GET /v1/pages/${CARD}/markdown`]: 500 } } });
		expect([run.code, failed(run.out)]).toEqual([1, "take: the markdown read failed — the markdown read answered 500"]);
		expect(run.out).toContain("## Card\n");
	});

	test.each([
		["missing", { object: "page_markdown", truncated: false, unknown_block_ids: [] }],
		["not a string", { object: "page_markdown", markdown: 7, truncated: false, unknown_block_ids: [] }],
	])("a markdown answer whose markdown is %s, with no undefined printed", async (_, markdown) => {
		const run = await take({ stub: { markdown } });
		expect([run.code, failed(run.out)]).toEqual([1, "take: the markdown read failed — the markdown read gave no markdown"]);
		expect(run.out).not.toContain("undefined");
	});

	test("a comments read that fails on its second page", async () => {
		const comments = [[question("2026-10-20T09:00:00Z")], [said(USER, "2026-10-20T10:00:00Z", { plain_text: "Yes." })]];
		const run = await take({ stub: { comments, fail: { "GET /v1/comments#1": 500 } } });
		expect([run.code, failed(run.out)]).toEqual([1, "take: the comments read failed — the comments read answered 500"]);
		expect(run.out).not.toContain("question waiting");
	});

	test("a working directory outside git: no Notion call", async () => {
		const run = await take({ cwd: emptyDir("work-take-nogit-") });
		expect(run.code).toBe(1);
		expect(failed(run.out)).toStartWith("take: the checkout read failed — ");
		expect(run.seen).toEqual([]);
	});

	test.each([
		["an openspec that exits 1", 1, "take: the open changes read failed — openspec list exited 1"],
		["no openspec on PATH", null, "take: the open changes read failed — no openspec on PATH"],
	])("%s", async (_, code, line) => {
		const run = await take({ path: bin(code) });
		expect([run.code, failed(run.out)]).toEqual([1, line]);
		expect(run.out).toContain("question waiting: no\n");
	});
});
