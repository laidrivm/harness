import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { clone, commit, out, records, run, runAsync, SAID, type Stubs } from "./board-loop.fixture.ts";
import { CARD, configured, standIn } from "./notion-bot.fixture.ts";
import { MARK } from "./question-gate.ts";

/** The `retry` outcome, exit 75: a transient failure at each point the pass can meet one. */

afterAll(cleanup);

const calls = (log: string, call: string) => log.split("\n").filter((line) => line.startsWith(call));

/** What `claude -p --output-format json` prints for a session the Claude API ended with `status`. */
const api = (status: number | null, result = `API Error: ${status}`) =>
	JSON.stringify({ type: "result", subtype: "success", is_error: true, terminal_reason: "api_error", api_error_status: status, result }).replaceAll("'", "\\u0027");

describe("the start", () => {
	// spec: board-loop/a-transient-failure-ends-the-pass-retry
	test("a fetch that cannot resolve its host records retry, exit 75, back on the noted branch", () => {
		const { dir } = clone();
		git(dir, "switch", "-qc", "feat/demo");
		commit(dir);
		git(dir, "remote", "set-url", "origin", "http://no-such-host.invalid/o/demo.git");
		const r = run(dir);
		expect([r.code, r.last.startsWith("board-loop: retry — git fetch failed")]).toEqual([75, true]);
		expect([r.calls.includes("claude "), out(dir, "branch", "--show-current")]).toEqual([false, "feat/demo"]);
		expect(records(r.state).map((x) => x.decision)).toEqual(["retry"]);
	});
});

describe("the pick session", () => {
	// spec: board-loop/the-claude-api-is-overloaded-during-the-pick
	test("a pick ended on a 529 records retry, exit 75, and starts no stage session", () => {
		const { dir } = clone();
		const r = run(dir, [], { pick: api(529) });
		expect([r.code, r.last.startsWith("board-loop: retry — the pick session ended on a Claude API error")]).toEqual([75, true]);
		expect(r.calls).not.toContain("claude -p /goal");
	});

	// spec: board-loop/the-claude-api-refuses-the-session-s-key
	test("a pick ended on a 401 is refused for want of a PICK: line, as before", () => {
		const { dir } = clone();
		const r = run(dir, [], { pick: api(401, "Invalid API key") });
		expect([r.code, r.last.startsWith("board-loop: refused — ")]).toEqual([1, true]);
	});
});

describe("the stage session", () => {
	/** A stage ended by the API: it committed, and nothing may leave the clone. */
	const ended = (stubs: Stubs) => {
		const { dir } = clone();
		const r = run(dir, [], { commits: true, said: api(500), ...stubs });
		return { dir, r };
	};

	// spec: board-loop/the-claude-api-fails-the-stage-after-a-commit
	test("a stage ended on a 500 after a commit keeps the branch, pushes and posts nothing, records retry", () => {
		const { dir, r } = ended({});
		expect([r.code, r.last.startsWith("board-loop: retry — apply demo step 1")]).toEqual([75, true]);
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
		expect(out(dir, "rev-parse", "--verify", "feat/demo")).not.toBe("");
		expect(records(r.state).map((x) => x.decision)).toEqual(["retry"]);
	});

	// spec: board-loop/the-claude-api-fails-the-stage-mid-edit
	test("the same with a tracked edit left records open, naming the API error", () => {
		const { r } = ended({ edits: true });
		expect([r.code, r.last.startsWith("board-loop: open — apply demo step 1: the stage session ended on a Claude API error")]).toEqual([1, true]);
	});

	// spec: board-loop/the-claude-api-refuses-the-session-s-key board-loop/the-subscription-s-usage-limit-is-spent
	test.each([
		["a 401", api(401, "Invalid API key")],
		["the usage limit at 429", api(429, "You've hit your session limit · resets 3:45pm")],
	])("a stage ended on %s is never retry", (_, said) => {
		const { r } = ended({ said });
		expect(r.code).not.toBe(75);
		expect(r.last).not.toStartWith("board-loop: retry");
		// The runner printed the session's result, so the stub delivered the JSON intact.
		expect(r.text).toContain(JSON.parse(said).result);
	});

	// spec: board-loop/the-push-meets-a-network-failure
	test("a push that cannot connect keeps the branch, opens no pull request and records retry", () => {
		const { dir } = clone();
		git(dir, "config", "remote.origin.pushurl", "http://127.0.0.1:1/o/demo.git");
		const r = run(dir, [], { commits: true });
		expect([r.code, r.last.startsWith("board-loop: retry — apply demo step 1")]).toEqual([75, true]);
		expect(calls(r.calls, "gh pr create")).toEqual([]);
		expect(out(dir, "rev-parse", "--verify", "feat/demo")).not.toBe("");
	});
});

describe("the question's post", () => {
	const notion = standIn();
	afterAll(() => notion.server.stop(true));
	const asked = `BLOCKED — a choice only the user can make\nQUESTION: ${CARD}\n${MARK} Ship it as one group?\n${SAID.slice("Done.\n".length)}`;
	const stuck = "goal open: apply demo step 1 at abc1234, before the push — group 1 is not complete";
	const pass = async (state: Partial<typeof notion.state>, stubs: Stubs = {}) => {
		Object.assign(notion.state, { reads: 200, assign: 200 }, state);
		const { dir } = clone();
		try {
			return await runAsync(dir, { said: asked, beforePush: stuck, ...stubs }, { home: configured(), env: { HARNESS_NOTION_API_URL: notion.server.url.origin } });
		} finally {
			Object.assign(notion.state, { reads: 200, assign: 200, me: 200 });
		}
	};

	// spec: board-loop/the-question-post-meets-notion-s-5xx
	test("a comments read answered 500 prints that Notion did not answer and records retry", async () => {
		const r = await pass({ reads: 500 });
		expect(r.text).toContain("question: not posted — Notion did not answer:");
		expect([r.code, r.last.startsWith("board-loop: retry — apply demo step 1")]).toEqual([75, true]);
	}, 40_000);

	// spec: board-loop/the-question-post-meets-notion-s-5xx
	test("the same under a goal met pushes nothing and records retry, not met", async () => {
		const r = await pass({ reads: 500 }, { beforePush: undefined, commits: true });
		expect([r.code, r.last.startsWith("board-loop: retry — apply demo step 1")]).toEqual([75, true]);
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
	}, 40_000);

	test("the same with a tracked edit left records open, since the next pass would refuse that tree", async () => {
		const r = await pass({ reads: 500 }, { edits: true });
		expect([r.code, r.last.startsWith("board-loop: open — apply demo step 1: question: not posted — Notion did not answer:")]).toEqual([1, true]);
		expect(r.last).toEndWith(", leaving a tracked edit");
	}, 40_000);

	// spec: board-loop/a-question-posted-assign-not-written
	test("an Assign write answered 503 stays waiting, as today", async () => {
		const r = await pass({ assign: 503 });
		expect(r.text).toContain(`question: posted on ${CARD}, Assign not set`);
		expect([r.code, r.last]).toEqual([0, `board-loop: waiting — apply demo step 1: question on ${CARD}`]);
	}, 40_000);

	// spec: board-loop/notion-is-down
	test("the integration's id read answered 503 records retry before any session", async () => {
		const r = await pass({ me: 503 });
		expect([r.code, r.calls.includes("claude "), r.last.startsWith("board-loop: retry — ")]).toEqual([75, false, true]);
	}, 40_000);
});
