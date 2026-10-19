import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import { change, clone, ONE, run, THREE, TICKED } from "./board-loop.fixture.ts";

/** Which changes a pass may take, and which step of one. [n]: `/zombies` ideas. */

afterAll(cleanup);

describe("nothing to take", () => {
	// spec: board-loop/no-takeable-change
	test("a tree with no proposed change is idle, launches nothing and exits 0 [8]", () => {
		const { dir } = clone({});
		const r = run(dir);
		expect([r.code, r.last]).toEqual([0, "board-loop: idle — no change is takeable"]);
		expect(r.calls).not.toContain("claude");
	});
});

/** An all-ticked change: an answer candidate for step N+1. These [n] number `pick-claim-answer`'s `/zombies` ideas. */
describe("an answer candidate", () => {
	// spec: board-loop/every-group-ticked
	test("a tree whose only change has every group ticked starts the pick session [7]", () => {
		const { dir } = clone(change("demo", TICKED));
		const r = run(dir, [], { pick: "PICK: none" });
		expect(r.calls).toContain("\nclaude -p ");
		expect(r.calls).toContain("These changes are takeable: none.");
		expect(r.last).toBe("board-loop: idle — the pick session found no takeable card on the board");
	});

	// spec: board-loop/every-group-ticked
	test.each([
		["single-group ticked change queries feat/demo-2 [8]", TICKED, "feat/demo-2"],
		["three-group ticked change queries feat/demo-4 [10]", THREE.replaceAll("[ ]", "[x]"), "feat/demo-4"],
	])("a %s", (_, tasks, branch) => {
		const { dir } = clone(change("demo", tasks));
		expect(run(dir).calls).toContain(`gh pr list --head ${branch} --state all`);
	});

	test("a change with one box left is a normal step [12]", () => {
		const { dir } = clone(change("demo", "## 1. Only\n\n- [x] 1.1 a\n- [ ] 1.2 b\n"));
		const { calls } = run(dir);
		expect(calls).toContain("gh pr list --head feat/demo --state all");
		expect(calls).toContain("/opsx:apply demo for its group 1 and");
	});

	test.each([
		["an open pull request on feat/demo-2 [18]", { gh: '[{"number":7,"state":"OPEN"}]' }, "pull request #7 is open on feat/demo-2"],
		["a closed pull request on feat/demo-2 [19]", { gh: '[{"number":5,"state":"CLOSED"}]' }, "pull request #5 already used feat/demo-2"],
		["a failing gh [21]", { gh: "", ghCode: 1 }, "the pull request query failed"],
	])("%s passes the candidate over, naming why", (_, stubs, why) => {
		const { dir } = clone(change("demo", TICKED));
		const r = run(dir, [], stubs);
		expect(r.text).toContain(`passed over demo: ${why}`);
		expect(r.last).toBe("board-loop: idle — no change is takeable");
		expect(r.calls).not.toContain("claude");
	});

	test("an open after: predecessor passes the candidate over, naming the blocker [20]", () => {
		const { dir } = clone({ ...change("demo", TICKED, ["base"]), ...change("base") });
		expect(run(dir).text).toContain("passed over demo: after: base is still open");
	});
});

describe("the step", () => {
	// spec: board-loop/the-next-group-of-a-multi-group-change
	test("a single-group change is step 1 on feat/<slug> [10]", () => {
		const { dir } = clone(change("demo", ONE));
		const r = run(dir);
		expect(r.calls).toContain("gh pr list --head feat/demo --state all");
		expect(r.calls).toContain("goal-check.ts apply demo 1");
	});

	// spec: board-loop/the-next-group-of-a-multi-group-change
	test("group 1 ticked of three is step 2 on feat/<slug>-2 [11]", () => {
		const { dir } = clone(change("demo", THREE));
		const r = run(dir);
		expect(r.calls).toContain("gh pr list --head feat/demo-2 --state all");
		expect(r.calls).toContain("goal-check.ts apply demo 2");
	});
});

describe("passed over, with the reason printed", () => {
	test("an after: predecessor still open [12]", () => {
		const { dir } = clone({ ...change("demo", ONE, ["base"]), ...change("base") });
		const r = run(dir);
		expect(r.text).toContain("passed over demo: after: base is still open");
	});

	// spec: board-loop/a-step-waiting-for-the-user-s-merge
	test("an open pull request on the step's branch [13]", () => {
		const { dir } = clone();
		const r = run(dir, [], { gh: '[{"number":7,"state":"OPEN"}]' });
		expect(r.text).toContain("passed over demo: pull request #7 is open on feat/demo");
		expect(r.calls).not.toContain("claude");
	});

	test.each([
		["closed", "CLOSED"],
		["merged", "MERGED"],
	])("a %s pull request that used the branch name [14]", (_, state) => {
		const { dir } = clone();
		const r = run(dir, [], { gh: `[{"number":5,"state":"${state}"}]` });
		expect(r.text).toContain("passed over demo: pull request #5 already used feat/demo");
	});

	// spec: board-loop/gh-unavailable
	test.each([
		["failing", { gh: "", ghCode: 1 }],
		["missing", { gh: null }],
		["answering with no JSON", { gh: "not json" }],
	])("gh %s leaves nothing takeable [17]", (_, stubs) => {
		const { dir } = clone();
		const r = run(dir, [], stubs);
		expect(r.text).toContain("passed over demo: the pull request query failed");
		expect(r.last).toStartWith("board-loop: idle");
	});
});

/** These [n] number `gh-timeout`'s `/zombies` ideas. */
describe("a pull request query that runs past its limit", () => {
	const opts = { env: { HARNESS_GH_TIMEOUT_MS: "500" } };

	// spec: board-loop/gh-hangs-on-the-query
	test.each([
		["one candidate [7]", ["demo"]],
		["two candidates [8]", ["demo", "other"]],
	])("gh hanging on %s passes each over, and the pass is idle", (_, slugs) => {
		const { dir } = clone(Object.assign({}, ...slugs.map((slug) => change(slug))));
		const r = run(dir, [], { ghSleep: 30 }, opts);
		for (const slug of slugs)
			expect(r.text).toContain(`passed over ${slug}: the pull request query failed`);
		expect(r.last).toBe("board-loop: idle — no change is takeable");
	}, 15_000);

	test("the query asks for up to 1000 records [6]", () => {
		const { dir } = clone();
		expect(run(dir).calls).toContain(
			"gh pr list --head feat/demo --state all --limit 1000 --json number,state",
		);
	});
});
