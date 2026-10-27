/**
 * `bun bun/work.ts take` run as a session runs it, over `work-take.fixture.ts`:
 * the usage, the card, its comments, the change it points at and the open
 * changes, and that it writes nothing. Its failures are in
 * `work-take-fail.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { head } from "./goal-check.fixture.ts";
import { BOT, body, CARD, checkout, files, LISTING, page, question, said, stopServers, TOKEN, take, USER } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

const USAGE = "usage: work.ts take --card <id>";

describe("the arguments", () => {
	// spec: work-take/no-card
	// spec: work-take/a-malformed-card-id
	// spec: work-take/an-option-it-does-not-know
	test.each([
		["no arguments", []],
		["no --card", ["take"]],
		["--card with no value", ["take", "--card"]],
		["an empty --card", ["take", "--card="]],
		["a 31-hex id", ["take", "--card", CARD.slice(1)]],
		["a positional", ["take", "--card", CARD, "more"]],
		["--write", ["take", "--card", CARD, "--write"]],
		["another subcommand", ["give", "--card", CARD]],
	])("%s prints the usage and exits 2, calling nothing", async (_, args) => {
		const run = await take({ args });
		expect([run.code, run.err.trim(), run.out, run.seen, run.ran]).toEqual([2, USAGE, "", [], ""]);
	});

	test.each([
		["a 32-hex id", CARD],
		["a dashed UUID", "aaaabbbb-cccc-dddd-eeee-ffff00001111"],
	])("%s passes", async (_, card) => {
		const run = await take({ args: ["take", "--card", card] });
		expect([run.code, run.err]).toEqual([0, ""]);
	});
});

describe("the card", () => {
	// spec: work-take/a-card
	test("the checkout's HEAD first, the five properties, the body byte for byte", async () => {
		const markdown = "# Plan\n\n- one\n- two\n\n```ts\nconst a = 1;\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
		const cwd = checkout();
		const run = await take({ cwd, stub: { page: page("openspec/changes/demo/"), markdown: body(markdown) } });
		expect(run.code).toBe(0);
		const lines = run.out.split("\n");
		expect(lines[0]).toStartWith("## Checkout: ");
		expect(lines[0]).toEndWith(` at ${head(cwd)}`);
		expect(lines.slice(1, 7)).toEqual([
			"## Card",
			"Name: Demo card",
			"Status: proposing",
			"Pointer: openspec/changes/demo/",
			"Labels: pivot-step-2-1, later",
			"Assign: 0123456789abcdef0123456789abcdef",
		]);
		expect(run.out).toContain(`## Body\n${markdown}`);
		expect(run.out).not.toContain("truncated");
	});

	test("Status, Labels and Assign empty print their names with no value", async () => {
		const empty = { Status: { type: "status", status: null }, Labels: { type: "multi_select", multi_select: [] }, Assign: { type: "people", people: [] } };
		const run = await take({ stub: { page: page("", empty) } });
		expect(run.out.split("\n").slice(1, 7)).toEqual(["## Card", "Name: Demo card", "Status:", "Pointer:", "Labels:", "Assign:"]);
	});

	test("a select Status reads by name, as a status does", async () => {
		const run = await take({ stub: { page: page("", { Status: { type: "select", select: { name: "idea" } } }) } });
		expect(run.out).toContain("\nStatus: idea\n");
	});

	test("an empty body prints its heading and no undefined", async () => {
		const run = await take({ stub: { markdown: body("") } });
		expect(run.out).toContain("## Body\n");
		expect(run.out).not.toContain("undefined");
	});

	// spec: work-take/a-truncated-body
	test("truncated true adds its line", async () => {
		expect((await take({ stub: { markdown: body("Part.", true) } })).out).toContain("Part.\nthe body is truncated: Notion left part of it out\n");
	});

	test("truncated false and no ids left out add no line", async () => {
		expect((await take({ stub: { markdown: body("Whole.") } })).out).toContain("## Body\nWhole.\n## Comments");
	});

	// spec: work-take/blocks-notion-left-out
	test("two ids left out add a line naming two blocks", async () => {
		const run = await take({ stub: { markdown: body("Some.", false, ["b1", "b2"]) } });
		expect(run.out).toContain("Some.\nNotion left 2 blocks out of the body\n");
		expect(run.out).not.toContain("truncated");
	});

	test("an unknown tag with no ids prints unchanged and adds no line", async () => {
		const tag = '<unknown url="https://example.com" alt="bookmark"/>';
		const run = await take({ stub: { markdown: body(`Before.\n${tag}\nAfter.`) } });
		expect(run.out).toContain(`## Body\nBefore.\n${tag}\nAfter.\n## Comments`);
	});

	test("one block left out reads in the singular", async () => {
		expect((await take({ stub: { markdown: body("Some.", false, ["b1"]) } })).out).toContain("Some.\nNotion left 1 block out of the body\n");
	});

	test("the markdown call carries 2026-03-11, every other 2025-09-03, each the ask settings' bearer", async () => {
		const run = await take();
		const auth = `Bearer ${TOKEN}`;
		expect(run.seen).toEqual([
			{ call: `GET /v1/pages/${CARD}`, version: "2025-09-03", auth },
			{ call: `GET /v1/pages/${CARD}/markdown`, version: "2026-03-11", auth },
			{ call: "GET /v1/comments", version: "2025-09-03", auth },
		]);
	});
});

describe("the comments", () => {
	const answer = () => said(USER, "2026-10-20T10:00:00Z", { plain_text: "Yes, ship." });

	// spec: work-take/a-question-with-no-answer
	test("out of order, printed oldest first with each time; an unanswered question waits", async () => {
		const early = said(USER, "2026-10-20T08:00:00Z", { plain_text: "Early." });
		const later = said(BOT, "2026-10-20T11:00:00Z", { plain_text: "Later." });
		const run = await take({ stub: { comments: [[later, question("2026-10-20T09:00:00Z"), early]] } });
		expect(run.out).toContain(
			[
				"## Comments",
				"2026-10-20T08:00:00Z user: Early.",
				"2026-10-20T09:00:00Z ffffeeeeddddccccbbbbaaaa99998888: harness-question Ship?",
				"2026-10-20T11:00:00Z ffffeeeeddddccccbbbbaaaa99998888: Later.",
				"question waiting: yes",
			].join("\n"),
		);
	});

	// spec: work-take/an-answered-question
	test("the user's answer after it: no question waits", async () => {
		const run = await take({ stub: { comments: [[question("2026-10-20T09:00:00Z"), answer()]] } });
		expect(run.out).toContain("2026-10-20T10:00:00Z user: Yes, ship.\nquestion waiting: no\n");
	});

	test("no comments: no question waits", async () => {
		expect((await take()).out).toContain("## Comments\nquestion waiting: no\n");
	});

	// spec: work-take/comments-over-more-than-one-page
	test("two pages joined by next_cursor print all their comments", async () => {
		const run = await take({ stub: { comments: [[question("2026-10-20T09:00:00Z")], [answer()]] } });
		expect(run.out).toContain("harness-question Ship?\n2026-10-20T10:00:00Z user: Yes, ship.\nquestion waiting: no\n");
		expect(run.seen.map((s) => s.call)).toContain("GET /v1/comments#1");
	});
});

const DEMO = {
	"openspec/changes/demo/proposal.md": "# demo proposal\n",
	"openspec/changes/demo/design.md": "# demo design\n",
	"openspec/changes/demo/tasks.md": "- [ ] 1.1 a\n",
	"openspec/changes/demo/specs/task-board/spec.md": "## ADDED Requirements\n",
};

describe("the change", () => {
	// spec: work-take/a-change-in-the-checkout
	test("all four kinds of file, each under its path, and the capability's name", async () => {
		const run = await take({ cwd: checkout(DEMO), stub: { page: page("openspec/changes/demo/") } });
		for (const [path, text] of Object.entries(DEMO)) expect(run.out).toContain(`### ${path}\n${text}`);
		expect(run.out).toContain("capabilities: task-board\n## Open changes");
	});

	test("two deltas print both and name their capabilities sorted", async () => {
		const tree = { ...DEMO, "openspec/changes/demo/specs/agent-rulebook/spec.md": "## MODIFIED Requirements\n" };
		const run = await take({ cwd: checkout(tree), stub: { page: page("openspec/changes/demo/") } });
		expect(run.out).toContain("### openspec/changes/demo/specs/agent-rulebook/spec.md\n## MODIFIED Requirements\n");
		expect(run.out).toContain("capabilities: agent-rulebook, task-board\n");
	});

	test("a change with no design.md prints the rest", async () => {
		const { "openspec/changes/demo/design.md": _, ...rest } = DEMO;
		const run = await take({ cwd: checkout(rest), stub: { page: page("openspec/changes/demo/") } });
		expect(run.out).not.toContain("design.md");
		expect(run.out).toContain("### openspec/changes/demo/tasks.md\n- [ ] 1.1 a\n");
	});

	// spec: work-take/a-change-the-checkout-lacks
	test("a slug the checkout lacks prints its one line and goes on", async () => {
		const cwd = checkout();
		const run = await take({ cwd, stub: { page: page("openspec/changes/demo/") } });
		expect(run.out).toContain(`## Change\nthe change demo is not in this checkout at ${head(cwd)}\n## Open changes`);
		expect(run.code).toBe(0);
	});

	// spec: work-take/a-pointer-to-another-repository
	test.each([
		"mellon: openspec/changes/demo/",
		"openspec/changes/demo/ step 2",
		"openspec/changes/../x/",
		"openspec/changes/Demo/",
		"openspec/changes/archive/",
		"openspec/changes/demo",
	])("%s reads no file and prints its one line", async (pointer) => {
		const run = await take({ cwd: checkout(DEMO), stub: { page: page(pointer) } });
		expect(run.out).toContain(`## Change\nthe pointer names no change of this checkout: ${pointer}\n## Open changes`);
		expect(run.out).not.toContain("demo proposal");
	});

	// spec: work-take/no-pointer
	test("an empty pointer prints that the card points at no change", async () => {
		expect((await take()).out).toContain("## Change\nthe card points at no change\n## Open changes");
	});
});

describe("the open changes and the writes", () => {
	// spec: work-take/open-changes
	test("openspec list's output ends the run unchanged", async () => {
		const run = await take();
		expect(run.out).toEndWith(`## Open changes\n${LISTING}\n`);
		expect(run.ran).toBe("list\n");
	});

	// spec: work-take/only-reads
	test("every call a GET, the checkout clean, and no ledger in the home", async () => {
		const cwd = checkout(DEMO);
		const run = await take({ cwd, stub: { page: page("openspec/changes/demo/"), comments: [[question("2026-10-20T09:00:00Z")]] } });
		expect(run.code).toBe(0);
		expect(run.seen.every((s) => s.call.startsWith("GET "))).toBe(true);
		expect(Bun.spawnSync(["git", "status", "--porcelain"], { cwd }).stdout.toString()).toBe("");
		// Bun's own cache lands in the home too; the ledger would be `.local/state/harness/gates.jsonl`.
		expect(files(run.config).filter((path) => path.includes("harness"))).toEqual(["harness/notion-ask.json"]);
		git(cwd, "diff", "--quiet", "HEAD");
	});
});
