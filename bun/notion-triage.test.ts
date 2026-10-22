/**
 * The triage's parts: how its final message is read, which source holds, its
 * prompt and a launch that fails. The pass around it is
 * `notion-triage-pass.test.ts`'s. [n]: the extension's `/zombies` list (#191).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { change, clone, commit } from "./board-loop.fixture.ts";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { USER } from "./notion-bot.fixture.ts";
import { ended, holds, triage, triagePrompt } from "./notion-triage.ts";

afterAll(cleanup);

const QUOTE = "Ship it as one group.";
const ANSWER = { source: "docs/rule.md", quote: QUOTE, text: "One group." };
const OTHER = "11112222333344445555666677778888";
const ID = "cccccccc-dddd-eeee-ffff-000011112222";
const said = (id: string, author: string, text: string) => ({ id, created_by: { id: author }, created_time: "2026-10-20T09:00:00Z", rich_text: [{ plain_text: text }] });
const COMMENTS = [said(ID, USER, `We said: ${QUOTE} Settled.`), said("dddddddd-dddd-eeee-ffff-000011112222", OTHER, QUOTE)];

/**
 * A clone whose `origin/main` holds the cited files, an ignored file holding
 * the quote, and a step branch whose `design.md` alone holds it [92].
 */
function repo() {
	const { dir } = clone({
		...change("demo"),
		"docs/rule.md": "Ship   it\nas one group.\n",
		"bun/rule.ts": `// ${QUOTE}\n`,
		"conf.json": `{"rule":"${QUOTE}"}\n`,
		".gitignore": "secret.md\n",
	});
	writeFileSync(join(dir, "secret.md"), `${QUOTE}\n`);
	git(dir, "switch", "-qc", "feat/demo");
	commit(dir, { "openspec/changes/demo/design.md": `# demo\n\n${QUOTE}\n` });
	const at = (...cmd: string[]) => {
		const run = Bun.spawnSync(cmd, { cwd: dir });
		return { ok: run.exitCode === 0, out: run.stdout.toString().trim(), err: run.stderr.toString().trim() };
	};
	return { dir, at };
}

describe("the triage's final message", () => {
	test("an answer reads its source, its quote over lines, and its text", () => {
		expect(ended(`Read it.\nANSWER-SOURCE: docs/rule.md\nANSWER-QUOTE:\nShip it\nas one group.\nANSWER:\nOne group.`)).toEqual({
			source: "docs/rule.md",
			quote: "Ship it\nas one group.",
			text: "One group.",
		});
	});

	test.each([
		["ESCALATE", "Read it.\nESCALATE", "escalated"],
		["two source lines [65]", "ANSWER-SOURCE: a.md\nANSWER-SOURCE: b.md\nANSWER-QUOTE:\nq\nANSWER:\nt", "ended with neither form"],
		["no answer line", "ANSWER-SOURCE: a.md\nANSWER-QUOTE:\nq", "ended with neither form"],
		["an empty answer", "ANSWER-SOURCE: a.md\nANSWER-QUOTE:\nq\nANSWER:\n", "ended with neither form"],
		["nothing", "", "ended with neither form"],
	])("%s is no answer", (_, text, why) => {
		expect(ended(text)).toBe(why);
	});
});

describe("a source that holds", () => {
	// spec: board-loop/an-answer-already-written
	test("a Markdown file on origin/main whose words differ in whitespace alone holds [85]", () => {
		const { at } = repo();
		expect(holds(ANSWER, COMMENTS, USER, "main", at)).toBeUndefined();
	});

	test("a comment of the user's on the card holding the quote holds", () => {
		const { at } = repo();
		expect(holds({ ...ANSWER, source: ID }, COMMENTS, USER, "main", at)).toBeUndefined();
	});
});

describe("a source that does not hold", () => {
	// spec: board-loop/a-source-that-does-not-hold board-loop/a-quote-only-the-steps-branch-holds
	test.each([
		["a quote the file does not hold [85]", { quote: "Ship it as two groups." }, "the quote is not in docs/rule.md on origin/main"],
		["an empty quote", { quote: " \n" }, "the quote is empty"],
		["a quote only the step's branch holds [92]", { source: "openspec/changes/demo/design.md" }, "the quote is not in openspec/changes/demo/design.md on origin/main"],
		["an ignored file [66]", { source: "secret.md" }, "secret.md is no file origin/main tracks"],
		["a path leaving the clone [67]", { source: "../outside.md" }, "../outside.md is no path inside the repository"],
		["an absolute path [67]", { source: "/etc/rule.md" }, "/etc/rule.md is no path inside the repository"],
		["a fragment", { source: "docs/rule.md#ship" }, "docs/rule.md#ship is no path inside the repository"],
		["a TypeScript file holding the quote [88]", { source: "bun/rule.ts" }, "bun/rule.ts is not a Markdown file"],
		["a JSON file holding the quote [88]", { source: "conf.json" }, "conf.json is not a Markdown file"],
		["a comment of another card [68]", { source: "eeeeeeeeddddeeeeffff000011112222" }, "eeeeeeeeddddeeeeffff000011112222 is no comment of the user's on this card"],
		["another author's comment", { source: "dddddddd-dddd-eeee-ffff-000011112222" }, "dddddddd-dddd-eeee-ffff-000011112222 is no comment of the user's on this card"],
		["a quote the comment does not hold [86]", { source: ID, quote: "Ship it as two groups." }, `the quote is not in comment ${ID}`],
	])("%s", (_, change, why) => {
		const { at } = repo();
		expect(holds({ ...ANSWER, ...change }, COMMENTS, USER, "main", at)).toBe(why);
	});

	test("an origin/main the session moved onto its own branch is fetched back first [92]", () => {
		const { dir, at } = repo();
		git(dir, "update-ref", "refs/remotes/origin/main", "feat/demo");
		expect(holds({ ...ANSWER, source: "openspec/changes/demo/design.md" }, COMMENTS, USER, "main", at)).toBe(
			"the quote is not in openspec/changes/demo/design.md on origin/main",
		);
	});
});

describe("the triage's prompt", () => {
	// spec: board-loop/the-triages-reach
	test("the unattended line, the rule that a choice escalates, then the question and the comments as data [71]", () => {
		const lines = triagePrompt("`harness-question` One group or two?", COMMENTS, USER).split("\n");
		expect(lines[0]).toStartWith("Decide whether");
		expect(lines[1]).toBe("This session runs unattended.");
		const rule = lines.findIndex((line) => line.includes("`ESCALATE`") && line.includes("choice"));
		const data = lines.findIndex((line) => line.includes("One group or two?"));
		expect(rule).toBeGreaterThan(1);
		expect(data).toBeGreaterThan(rule);
		expect(lines.slice(data).join("\n")).toContain(ID);
		expect(lines.slice(data).join("\n")).toContain(`We said: ${QUOTE}`);
	});
});

describe("a triage that cannot start", () => {
	test("posts the question as on ESCALATE, with no answer [73]", async () => {
		const { at } = repo();
		const run = triage("`harness-question` One group?", { at, under: ["/nonexistent/launcher"], limit: 60_000, kill: process.kill, base: "main", user: USER });
		expect(await run(COMMENTS)).toEqual({ note: "triage: claude could not be started" });
	});
});
