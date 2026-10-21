import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { change, clone, commit, lowered, ONE, run, runAsync, SAID, type Stubs, TICKED } from "./board-loop.fixture.ts";
import { MARK, RUNNER_ASKS } from "./question-gate.ts";

/**
 * The stage prompt's line on asking the user, against the question gate's
 * mark and `core/feature-workflow.md`'s launch form, and the question the
 * runner posts from the Notion integration. [n]: `question-gate-reason`'s
 * `/zombies` ideas in the first describe, `notion-bot-questions`' (#184) after.
 */

afterAll(cleanup);

/** The stage session's prompt, line by line, out of the stub `claude`'s calls. */
const stage = (calls: string) => {
	const from = calls.indexOf("\nclaude -p /goal ") + 1;
	expect(from).toBeGreaterThan(0);
	return calls.slice(from, calls.indexOf(" --permission-mode", from)).split("\n");
};

/** The workflow doc's lines that open as the fourth line does. */
const forms = () =>
	readFileSync(join(import.meta.dir, "../core/feature-workflow.md"), "utf8")
		.split("\n")
		.filter((line) => line.startsWith("A question only the user"));

describe("the launch form's question line", () => {
	// spec: stage-goal/a-stage-asks-its-question
	test.each([
		["an apply step [20] [23]", ONE],
		["an answer step [21]", TICKED],
	])("%s: the fourth line names the gate's mark and the comment's form, as the workflow doc does", (_, tasks) => {
		const { dir } = clone(change("demo", tasks));
		const lines = stage(run(dir).calls);
		expect(lines).toHaveLength(5);
		for (const part of [MARK, "`page_id`", "`markdown`", "page-level"]) expect(lines[3]).toContain(part);
		// The doc's form closes the shell's single quote on this line.
		expect(forms()).toContain(`${lines[3]}'`);
	});
});

const TOKEN = "ntn_secret0value";
const USER = "0123456789abcdef0123456789abcdef";
const CARD = "aaaabbbbccccddddeeeeffff00001111";
const WITHHELD = "--disallowedTools mcp__*__notion-create-comment";
/** A final message naming a question, then the pull request's title and body. */
const ASKED = `BLOCKED — a choice only the user can make\nQUESTION: ${CARD}\n${MARK} Ship it as one group?\n${SAID.slice("Done.\n".length)}`;
const POSTED = `question: posted on ${CARD}, Assign set`;

/** A runner home holding each settings file named, at `mode`. */
function configured(mode = 0o600, ...names: string[]) {
	const home = emptyDir("board-loop-home-");
	mkdirSync(join(home, ".config/harness"), { recursive: true });
	for (const name of names.length ? names : ["notion-bot.json"]) {
		const file = join(home, ".config/harness", name);
		writeFileSync(file, JSON.stringify({ token: TOKEN, user: USER }));
		chmodSync(file, mode);
	}
	return home;
}

const seen: string[] = [];
const notion = Bun.serve({
	port: 0,
	fetch(req) {
		const url = new URL(req.url);
		seen.push(`${req.method} ${url.pathname}`);
		if (url.pathname.startsWith("/v1/pages/"))
			return Response.json({
				parent: { type: "data_source_id", data_source_id: "ds1" },
				properties: { Pointer: { rich_text: [{ plain_text: "openspec/changes/demo/" }] } },
			});
		if (url.pathname.startsWith("/v1/data_sources/")) return Response.json({ title: [{ plain_text: "Demo" }] });
		if (req.method === "GET") return Response.json({ results: [], has_more: false, next_cursor: null });
		return Response.json({});
	},
});
afterAll(() => notion.stop(true));

/** One pass with the settings in `home`, or none, against the stand-in; its log cleared first. */
const pass = (dir: string, s: Stubs, home?: string, entry?: string) => {
	seen.length = 0;
	return runAsync(dir, s, { home, entry, env: { HARNESS_NOTION_API_URL: notion.url.origin } });
};

describe("the runner posts the question", () => {
	// spec: board-loop/no-settings-file
	test("no settings file: today's fourth line, no variable, no withheld tool, no call [1]", async () => {
		const { dir } = clone();
		const r = await pass(dir, {});
		expect(stage(r.calls)[3]).toContain("`page_id`");
		for (const s of ["pick", "stage"]) expect(r.env(s)?.[RUNNER_ASKS.name]).toBeUndefined();
		expect(r.calls).not.toContain("--disallowedTools");
		expect(seen).toEqual([]);
	});

	// spec: board-loop/a-usable-settings-file stage-goal/a-stage-whose-launcher-posts-its-question
	test("settings: the fourth line names QUESTION: and the mark, as the doc's variant does [35]", async () => {
		const { dir } = clone();
		const lines = stage((await pass(dir, {}, configured())).calls);
		expect(lines).toHaveLength(5);
		for (const part of ["`QUESTION: ", MARK, "posts no comment"]) expect(lines[3]).toContain(part);
		expect(forms()).toContain(lines[3]);
	});

	// spec: stage-goal/a-stage-launched-where-the-ask-integration-is-configured
	test("ask settings alone: the fourth line names the ask command and the mark, as the doc's variant does, and nothing is withheld [62]", async () => {
		const { dir } = clone();
		const r = await pass(dir, {}, configured(0o600, "notion-ask.json"));
		const lines = stage(r.calls);
		expect(lines).toHaveLength(5);
		for (const part of ["`bun node_modules/harness/bun/notion-ask.ts <the id of the card of the change> <that file>`", MARK]) expect(lines[3]).toContain(part);
		expect(forms()).toContain(lines[3]);
		for (const s of ["pick", "stage"]) expect(r.env(s)?.[RUNNER_ASKS.name]).toBeUndefined();
		expect(r.calls).not.toContain("--disallowedTools");
	});

	test("both settings files: the runner posts, so the fourth line names QUESTION: [62]", async () => {
		const { dir } = clone();
		const lines = stage((await pass(dir, {}, configured(0o600, "notion-bot.json", "notion-ask.json"))).calls);
		expect(lines[3]).toContain("`QUESTION: ");
	});

	// spec: board-loop/a-usable-settings-file agent-permissions/a-hook-that-cannot-read-the-variable
	test("both sessions carry the variable and the withheld tool, and none holds the token [8] [84]", async () => {
		const { dir } = clone();
		const r = await pass(dir, {}, configured());
		for (const s of ["pick", "stage"]) {
			expect(r.env(s)?.[RUNNER_ASKS.name]).toBe(RUNNER_ASKS.value);
			expect(Object.values(r.env(s) ?? {}).join("\n")).not.toContain(TOKEN);
		}
		expect(r.calls.split(WITHHELD)).toHaveLength(3);
		expect(r.calls).not.toContain(TOKEN);
	});

	// spec: board-loop/a-settings-file-others-may-read
	test("a settings file its group may read refuses the pass before any session", async () => {
		const { dir } = clone();
		const r = await pass(dir, {}, configured(0o640));
		expect(r.last).toStartWith("board-loop: refused — notion-bot: ");
		expect(r.last).toContain("mode 0640");
		expect(r.calls).not.toContain("claude ");
		expect(r.text).not.toContain(TOKEN);
	});

	// spec: board-loop/a-question-posted
	test("a posted question leaves the outcome the goal check's [32]", async () => {
		const { dir } = clone();
		const r = await pass(dir, { said: ASKED }, configured());
		expect(r.text).toContain(POSTED);
		expect(seen).toContain("POST /v1/comments");
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	test("the question is posted before the push, so a refused push still prints it [33]", async () => {
		const { dir, origin } = clone();
		const other = emptyDir("board-loop-other-");
		git(other, "clone", "-q", origin, ".");
		git(other, "switch", "-qc", "feat/demo");
		commit(other);
		git(other, "push", "-q", "origin", "feat/demo");
		git(dir, "switch", "-qc", "feat/demo");
		commit(dir);
		git(dir, "switch", "-q", "main");
		const r = await pass(dir, { said: ASKED }, configured());
		expect(r.text).toContain(POSTED);
		expect(r.last).toStartWith("board-loop: open — apply demo step 1: origin refused the push");
	});

	// spec: board-loop/no-question
	test("no QUESTION: line: no call and nothing printed about a question", async () => {
		const { dir } = clone();
		const r = await pass(dir, {}, configured());
		expect(seen).toEqual([]);
		expect(r.text).not.toContain("question:");
	});

	// spec: board-loop/a-question-with-no-integration
	test("a QUESTION: line with no settings file prints that no integration is configured [34]", async () => {
		const { dir } = clone();
		const r = await pass(dir, { said: ASKED });
		expect(r.text).toContain("question: not posted — no integration is configured");
		expect(seen).toEqual([]);
	});

	// spec: board-loop/a-malformed-question-line
	test("a malformed QUESTION: line posts nothing and prints why", async () => {
		const { dir } = clone();
		const r = await pass(dir, { said: `QUESTION: ${CARD}x\n${MARK} Ship?` }, configured());
		expect(r.text).toContain("question: not posted — the QUESTION: line names no card id");
		expect(seen).toEqual([]);
	});

	// spec: board-loop/a-session-that-did-not-end-clean
	test("a stage session past its limit makes no call [31]", async () => {
		const { dir } = clone();
		const r = await pass(dir, { said: ASKED, sleep: 60 }, configured(), lowered(5000));
		expect(r.last).toStartWith("board-loop: timeout — apply demo step 1");
		expect(seen).toEqual([]);
	}, 40_000);
});
