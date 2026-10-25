import { afterAll, describe, expect, test } from "bun:test";
import { clone, commit, listed, run, SAID } from "./board-loop.fixture.ts";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { against, CARD, configured, OTHER, standIn, USER } from "./notion-bot.fixture.ts";
import { MARK } from "./question-gate.ts";

/**
 * The runner's pull request stays a draft while its question waits on the
 * card, and the pass that carries the answer continues that draft's branch
 * and marks it ready (`draft-until-answered`).
 */

afterAll(cleanup);

const notion = standIn();
afterAll(() => notion.server.stop(true));
const pass = against(notion);
const reset = () => Object.assign(notion.state, { pending: false, slug: "demo", post: 200, assign: [USER, OTHER] });

const ASKED = `QUESTION: ${CARD}\n${MARK} Ship it as one group?\n${SAID.slice("Done.\n".length)}`;
const CREATE = "gh pr create --base main --head feat/demo --title Carry demo --body-file -";
const created = (calls: string) => calls.split("\n").filter((line) => line.startsWith("gh pr create"));
/** The pick session's prompt, and the stage session's first line, out of the stub `claude`'s calls. */
const pick = (calls: string) => calls.split("\nclaude -p /goal")[0];
const first = (calls: string) => calls.slice(calls.indexOf("claude -p /goal")).split("\n")[0];

describe("a pull request stays a draft while its question waits", () => {
	// spec: board-loop/a-question-posted-from-the-integration board-loop/a-question-already-waiting board-loop/a-question-that-never-reached-the-card
	test.each([
		["posted from the integration", true, ASKED, {}],
		["already waiting on the card", true, ASKED, { pending: true }],
		["on a malformed line", false, ASKED.replace(CARD, `${CARD}x`), {}],
		["that fails the question gate", false, ASKED.replace(`${MARK} `, ""), {}],
		["on the card of another change", false, ASKED, { slug: "other" }],
		["whose post fails", false, ASKED, { post: 500 }],
	])("a question %s: a draft %p", async (_, draft, said, card) => {
		Object.assign(notion.state, card);
		const r = await pass(clone().dir, { said }, configured()).finally(reset);
		expect(created(r.calls)).toEqual([draft ? `${CREATE} --draft` : CREATE]);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});
});

/** A clone whose step's branch `feat/demo` is on `origin`, with draft #7 open on it. */
function drafted() {
	const { dir } = clone();
	git(dir, "switch", "-qc", "feat/demo");
	commit(dir);
	git(dir, "push", "-q", "origin", "feat/demo");
	git(dir, "switch", "-q", "main");
	return dir;
}
const DRAFT = { gh: listed(7, "open", false, true) };
const PICKED = `PICK: demo\nCARD: ${CARD}`;
const READY = "gh pr ready 7\n";

describe("an answer beside a draft pull request", () => {
	// spec: board-loop/a-draft-waiting-on-its-answer board-loop/the-answer-asks-for-a-change-of-its-own board-loop/the-answer-carried-with-no-new-question
	test("the draft's step on its branch is an answer candidate, resumed, and with no new question it is marked ready", () => {
		const r = run(drafted(), [], DRAFT);
		expect(r.calls).toContain("These changes are answer candidates: demo.");
		expect(pick(r.calls)).not.toContain("CARD:");
		expect(r.text).toContain("continuing feat/demo, which a session left\ncarrying apply demo step 1 on feat/demo");
		const line = first(r.calls);
		for (const part of ["apply the answer on its card to the artefacts, code and tasks of step 1 on its branch", "file an `idea` card for it, add nothing to the branch and still name the title and body of the pull request"])
			expect(line).toContain(part);
		expect(line).not.toContain("'");
		expect(r.calls).toContain(READY);
		expect(r.text).toContain("pull request #7: marked ready for review");
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	// spec: board-loop/the-answer-is-read board-loop/the-answer-carried-with-no-new-question
	test("the pick names the card, and the runner removes the user alone from Assign before the stage session, and writes none at ready", async () => {
		const r = await pass(drafted(), { ...DRAFT, pick: PICKED }, configured());
		expect(pick(r.calls)).toContain("also write one line `CARD: <the id of its card>`");
		expect(notion.state.wrote).toEqual([{ properties: { Assign: { people: [{ id: OTHER }] } } }]);
		expect(r.text).toContain(`assign: removed the user from ${CARD}\ncontinuing feat/demo`);
		expect(r.calls).toContain(READY);
	});

	// spec: board-loop/a-card-line-the-runner-refuses
	test.each([
		["missing", "PICK: demo", {}, "the pick session returned not one CARD: line"],
		["not one card id", "PICK: demo\nCARD: card", {}, "the CARD: line names no card id"],
		["another change's card", PICKED, { slug: "other" }, `${CARD} is not the card of demo`],
		["a card whose Assign a page read may truncate", PICKED, { assign: Array(25).fill(OTHER) }, `${CARD} lists 25 people on Assign, the most a page read returns`],
	])("a CARD: line %s writes no Assign, prints why, and the step is carried", async (_, out, card, why) => {
		Object.assign(notion.state, card);
		const r = await pass(drafted(), { ...DRAFT, pick: out }, configured()).finally(reset);
		expect(notion.state.wrote).toEqual([]);
		expect(r.text).toContain(`assign: not written — ${why}`);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	test("an Assign write that fails refuses the pass before the stage session, so the next pass reads the answer again", async () => {
		notion.state.patch = 500;
		const r = await pass(drafted(), { ...DRAFT, pick: PICKED }, configured()).finally(() => {
			notion.state.patch = 200;
		});
		expect(r.last).toBe("board-loop: refused — assign: failed — the Assign write answered 500");
		expect(r.calls).not.toContain("claude -p /goal");
	});

	// spec: board-loop/the-answer-raises-another-question
	test("a new question keeps the draft, and sets Assign to the user again", async () => {
		const r = await pass(drafted(), { ...DRAFT, pick: PICKED, said: ASKED }, configured());
		expect(created(r.calls)).toEqual([`${CREATE} --draft`]);
		expect(r.calls).not.toContain(READY);
		expect(notion.state.wrote.at(-1)).toEqual({ properties: { Assign: { people: [{ id: USER }] } } });
	});

	// spec: board-loop/marking-ready-fails
	test("a failed gh pr ready is printed and the outcome stays the check's", () => {
		const r = run(drafted(), [], { ...DRAFT, readyCode: 1 });
		expect(r.text).toContain("pull request #7: not marked ready — gh pr ready failed; mark it ready by hand");
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});
});
