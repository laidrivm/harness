/**
 * `bun bun/work.ts finish` run as a session runs it, over
 * `work-finish.fixture.ts`: the usage, and the refusals that come before the
 * push. The sequence itself is `work-finish-sequence.test.ts`'s.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { head, runRecord, stateWith } from "./goal-check.fixture.ts";
import { USAGE } from "./work.ts";
import { CARD, checkout, finish, pull } from "./work-finish.fixture.ts";
import { stopServers } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

const DRAFT = { before: [pull(7, "OPEN", true)] };

describe("the arguments", () => {
	// spec: work-finish/no-card
	// spec: work-finish/an-option-it-does-not-know
	test.each([
		["no arguments", []],
		["no --card", ["finish"]],
		["--title without --body-file", ["finish", "--card", CARD, "--title", "t"]],
		["--body-file without --title", ["finish", "--card", CARD, "--body-file", "b"]],
		["an empty --title", ["finish", "--card", CARD, "--title", "", "--body-file", "b"]],
		["--force", ["finish", "--card", CARD, "--force"]],
		["a positional", ["finish", "--card", CARD, "more"]],
		["a 31-hex card", ["finish", "--card", CARD.slice(1)]],
	])("%s prints the usage and exits 2, calling nothing", async (_, args) => {
		const run = await finish({ args });
		expect([run.code, run.err.trim(), run.calls, run.seen, run.refusals, run.remote]).toEqual([2, USAGE.join("\n"), [], [], [], ""]);
	});

	test.each([
		["a 32-hex id", CARD],
		["a dashed UUID", "aaaabbbb-cccc-dddd-eeee-ffff00001111"],
	])("%s passes", async (_, card) => {
		const run = await finish({ args: ["finish", "--card", card], gh: DRAFT });
		expect([run.code, run.last]).toEqual([0, "finish: ready #7"]);
	});
});

/** A run that refused before the push: exit 1, nothing pushed, ready or opened, one record of `HEAD` under `rule`. */
function refused(run: Awaited<ReturnType<typeof finish>>, rule: string) {
	expect(run.code).toBe(1);
	expect(run.last).toStartWith("finish: refused — ");
	expect(run.remote).toBe("");
	expect(run.calls.filter((call) => !call.startsWith("api "))).toEqual([]);
	expect(run.seen).toEqual([]);
	expect(run.refusals).toEqual([{ decision: "block", rule, commit: head(run.cwd) }]);
}

describe("the refusals before the push", () => {
	// spec: work-finish/an-uncommitted-edit
	test("a tracked file that differs from HEAD, with no network call", async () => {
		const cwd = checkout();
		writeFileSync(join(cwd, "a.txt"), "edited\n");
		const run = await finish({ cwd, gh: DRAFT });
		refused(run, "dirty");
		expect(run.calls).toEqual([]);
	});

	test("an untracked file alone does not refuse", async () => {
		const cwd = checkout();
		writeFileSync(join(cwd, "new.txt"), "new\n");
		expect((await finish({ cwd, gh: DRAFT })).last).toBe("finish: ready #7");
	});

	test.each([
		["a detached HEAD", "detached", ["checkout", "-q", "--detach"]],
		["main", "main", ["checkout", "-q", "main"]],
	])("%s", async (_, rule, move) => {
		const cwd = checkout();
		git(cwd, ...move);
		const run = await finish({ cwd, gh: DRAFT });
		refused(run, rule);
		expect(run.calls).toEqual([]);
	});

	// spec: work-finish/no-run-record-for-head gate-ledger/a-finish-refused
	test.each([
		["no run record of HEAD", () => []],
		["another step's record alone", (cwd: string) => runRecord(cwd).filter((r) => r.rule !== "diff-budget")],
		["the diff budget's record alone", (cwd: string) => runRecord(cwd).filter((r) => r.rule === "diff-budget")],
		["a failed run", (cwd: string) => runRecord(cwd, "fail")],
		["a record of another commit", (cwd: string) => runRecord(cwd, "pass", "c".repeat(40))],
	])("%s names the missing record", async (_, lines) => {
		const cwd = checkout();
		const run = await finish({ cwd, gh: DRAFT, state: stateWith(...lines(cwd)) });
		refused(run, "unproven");
		expect(run.last).toContain("no passing pre-PR run record");
	});

	test("an unreadable pull request state", async () => {
		const run = await finish({ gh: { ...DRAFT, read: 1 } });
		refused(run, "unread");
	});

	// spec: work-finish/a-ready-pull-request
	test("an open pull request that is not a draft names gh pr ready 7 --undo", async () => {
		const run = await finish({ gh: { before: [pull(7, "OPEN", false)] } });
		refused(run, "ready");
		expect(run.last).toContain("`gh pr ready 7 --undo`");
	});

	// spec: work-finish/a-first-finish-with-no-title
	test("no open pull request and no --title names --title and --body-file", async () => {
		const run = await finish({ gh: { before: [pull(6, "CLOSED", false)] } });
		refused(run, "untitled");
		expect(run.last).toContain("--title");
		expect(run.last).toContain("--body-file");
	});
});
