/**
 * `work.ts finish`'s sequence over `work-finish.fixture.ts`: the push, the
 * draft it opens, the card read and the ready switch, in that order, and the
 * failures after the push, which leave the draft and record nothing. Its
 * usage and refusals are `work-finish.test.ts`'s.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { head } from "./goal-check.fixture.ts";
import { BRANCH, CARD, checkout, finish, pull } from "./work-finish.fixture.ts";
import { home, question, stopServers } from "./work-take.fixture.ts";

afterAll(() => {
	stopServers();
	cleanup();
});

const READ = `api repos/o/demo/pulls?head=o:${BRANCH}&state=all&per_page=100`;
const READY = "pr ready 7 -R o/demo";
const DRAFT = { before: [pull(7, "OPEN", true)] };
const OPENING = ["finish", "--card", CARD, "--title", "Demo", "--body-file", "body.md"];

/** A checkout holding the body file, untracked, which `finish` checks for before the push. */
function withBody() {
	const cwd = checkout();
	writeFileSync(join(cwd, "body.md"), "Body\n");
	return cwd;
}

describe("the sequence", () => {
	// spec: work-finish/a-first-finish
	test("a first finish pushes, opens a draft against main, re-reads its number and marks it ready, in that order", async () => {
		const cwd = withBody();
		const run = await finish({ cwd, args: OPENING, gh: { before: [], after: [pull(7, "OPEN", true)] } });
		expect(run.calls).toEqual([
			READ,
			"push",
			`pr create --draft -R o/demo --base main --head ${BRANCH} --title Demo --body-file body.md`,
			READ,
			READY,
		]);
		expect([run.code, run.last, run.remote, run.refusals]).toEqual([0, "finish: ready #7", head(cwd), []]);
		expect(run.seen).toEqual(["GET /v1/comments"]);
	});

	// spec: work-finish/a-draft-with-a-new-commit
	// spec: work-finish/no-question-on-the-card
	test("a draft with a new commit pushes and marks ready, opening nothing", async () => {
		const cwd = checkout();
		const run = await finish({ cwd, gh: DRAFT });
		expect(run.calls).toEqual([READ, "push", READY]);
		expect([run.code, run.last, run.remote]).toEqual([0, "finish: ready #7", head(cwd)]);
	});

	// spec: work-finish/nothing-to-push
	test("origin already at HEAD: no push, and still the ready switch", async () => {
		const cwd = checkout();
		git(cwd, "push", "-q", "--no-verify", "origin", BRANCH);
		const run = await finish({ cwd, gh: DRAFT });
		expect(run.calls).toEqual([READ, READY]);
		expect([run.code, run.last]).toEqual([0, "finish: ready #7"]);
	});

	test("a merged pull request beside an open draft: the draft is the one acted on", async () => {
		const run = await finish({ gh: { before: [pull(6, "MERGED", false), pull(7, "OPEN", true)] } });
		expect(run.calls).toEqual([READ, "push", READY]);
		expect(run.last).toBe("finish: ready #7");
	});

	test("a closed unmerged pull request alone: a new draft is opened", async () => {
		const closed = pull(6, "CLOSED", false);
		const run = await finish({ cwd: withBody(), args: OPENING, gh: { before: [closed], after: [closed, pull(7, "OPEN", true)] } });
		expect(run.calls.filter((call) => call.startsWith("pr ")).map((call) => call.split(" -R")[0])).toEqual(["pr create --draft", "pr ready 7"]);
		expect(run.last).toBe("finish: ready #7");
	});

	// spec: work-finish/no-card-no-question-check
	test("no --card: a first finish pushes, opens the draft and marks it ready, reading nothing from Notion", async () => {
		const cwd = withBody();
		const run = await finish({ cwd, args: OPENING.filter((a) => a !== "--card" && a !== CARD), gh: { before: [], after: [pull(7, "OPEN", true)] } });
		expect(run.calls).toEqual([READ, "push", `pr create --draft -R o/demo --base main --head ${BRANCH} --title Demo --body-file body.md`, READ, READY]);
		expect([run.code, run.last, run.remote, run.seen]).toEqual([0, "finish: ready #7", head(cwd), []]);
		expect(run.out).toContain("finish: no --card, so no card's question was read\n");
	});

	// spec: work-finish/no-card-no-question-check
	test("no --card and no ask settings: still marked ready", async () => {
		const run = await finish({ args: ["finish"], gh: DRAFT, config: home(false) });
		expect([run.code, run.last, run.calls]).toEqual([0, "finish: ready #7", [READ, "push", READY]]);
	});

	// spec: work-finish/a-question-waits
	test("a question waiting on the card leaves the draft, names the card and exits 0", async () => {
		const cwd = checkout();
		const run = await finish({ cwd, gh: DRAFT, stub: { comments: [[question("2026-10-27T00:00:00.000Z")]] } });
		expect(run.calls).toEqual([READ, "push"]);
		expect([run.code, run.last, run.remote]).toEqual([0, `finish: draft #7 — a question waits on ${CARD}`, head(cwd)]);
	});
});

/** A run that failed after the push: exit 1, the draft left, no ready, no refusal recorded. */
function failed(run: Awaited<ReturnType<typeof finish>>) {
	expect(run.code).toBe(1);
	expect(run.last).toStartWith("finish: draft #7 — ");
	expect(run.refusals).toEqual([]);
}

describe("the failures after the refusals", () => {
	// spec: work-finish/no-ask-settings
	test("no ask settings", async () => {
		const run = await finish({ gh: DRAFT, config: home(false) });
		failed(run);
		expect(run.calls).not.toContain(READY);
	});

	// spec: work-finish/notion-does-not-answer
	test("a Notion read that fails", async () => {
		const run = await finish({ gh: DRAFT, stub: { fail: { "GET /v1/comments": 500 } } });
		failed(run);
		expect(run.calls).not.toContain(READY);
	});

	test("a push that fails", async () => {
		const run = await finish({ gh: DRAFT, hook: 1 });
		failed(run);
		expect([run.calls, run.remote, run.seen]).toEqual([[READ, "push"], "", []]);
	});

	test("a ready gh refuses", async () => {
		const run = await finish({ gh: { ...DRAFT, ready: 1 } });
		failed(run);
		expect(run.calls).toEqual([READ, "push", READY]);
	});

	test("a create that fails marks nothing", async () => {
		const run = await finish({ cwd: withBody(), args: OPENING, gh: { before: [], create: 1 } });
		expect(run.code).toBe(1);
		expect(run.last).toStartWith("finish: failed — ");
		expect(run.calls.at(-1)).toStartWith("pr create ");
	});

	test("a created pull request the re-read does not find marks nothing", async () => {
		const run = await finish({ cwd: withBody(), args: OPENING, gh: { before: [], after: [] } });
		expect(run.code).toBe(1);
		expect(run.last).toStartWith("finish: failed — ");
		expect(run.calls).not.toContain(READY);
	});
});
