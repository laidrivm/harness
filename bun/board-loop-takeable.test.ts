import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import { change, clone, listed, ONE, run, THREE, TICKED } from "./board-loop.fixture.ts";
import { prompt } from "./board-loop-prompt.ts";

/** Which changes a pass may take, and which step of one. [n]: `/zombies` ideas. */

afterAll(cleanup);

/** The REST read of a branch's pull requests, as the stub `gh` logs it. */
const query = (branch: string) => `gh api repos/o/demo/pulls?head=o:${encodeURIComponent(branch)}&state=all`;

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
		expect(run(dir).calls).toContain(query(branch));
	});

	test("a change with one box left is a normal step [12]", () => {
		const { dir } = clone(change("demo", "## 1. Only\n\n- [x] 1.1 a\n- [ ] 1.2 b\n"));
		const { calls } = run(dir);
		expect(calls).toContain(query("feat/demo"));
		expect(calls).toContain("/opsx:apply demo for its group 1 and");
	});

	// spec: board-loop/a-ready-pull-request
	test.each([
		["an open pull request on feat/demo-2 [18]", { gh: listed(7, "open") }, "pull request #7 is open on feat/demo-2"],
		["a closed pull request on feat/demo-2 [19]", { gh: listed(5, "closed") }, "pull request #5 already used feat/demo-2"],
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
		expect(r.calls).toContain(query("feat/demo"));
		expect(r.calls).toContain("goal-check.ts apply demo 1");
	});

	// spec: board-loop/the-next-group-of-a-multi-group-change
	test("group 1 ticked of three is step 2 on feat/<slug>-2 [11]", () => {
		const { dir } = clone(change("demo", THREE));
		const r = run(dir);
		expect(r.calls).toContain(query("feat/demo-2"));
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
		const r = run(dir, [], { gh: listed(7, "open") });
		expect(r.text).toContain("passed over demo: pull request #7 is open on feat/demo");
		expect(r.calls).not.toContain("claude");
	});

	// spec: board-loop/a-step-s-branch-closed-unmerged
	test("a closed pull request that used the branch name, with no carry tried [14]", () => {
		const { dir } = clone();
		const r = run(dir, [], { gh: listed(5, "closed") });
		expect(r.text).toContain("passed over demo: pull request #5 already used feat/demo");
		expect(r.calls).not.toContain(query("feat/demo-2"));
		expect(r.calls).not.toContain("claude");
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

/** Groups `1` to `n`, those in `open` holding an unticked box and the rest ticked. */
const tasks = (n: number, open: number[]) =>
	Array.from({ length: n }, (_, i) => `## ${i + 1}. G\n\n- [${open.includes(i + 1) ? " " : "x"}] ${i + 1}.1 t\n`).join("\n");
const merged = (number: number) => listed(number, "closed", true);

describe("the unticked tasks of merged groups, carried as a new group", () => {
	// spec: board-loop/merged-groups-reopened
	// spec: change-slicing/a-task-added-to-a-merged-group
	test("groups 4 and 5 of five, merged and reopened, are one carry step 6 on feat/demo-6", () => {
		const { dir } = clone(change("demo", tasks(5, [4, 5])));
		const r = run(dir, [], { ghBy: { "feat/demo-4": merged(239), "feat/demo-5": merged(243) } });
		expect(r.calls).toContain(query("feat/demo-6"));
		expect(r.calls).toContain("committed HEAD on feat/demo-6,");
		expect(r.calls).toContain("Carried over from group 4, 5`");
		expect(r.calls).toContain("goal-check.ts apply demo 6");
	});

	// spec: board-loop/a-carry-ahead-of-a-group-not-yet-shipped
	test("group 4 of six reopened, with group 5 unshipped, is carried alone as step 7", () => {
		const { dir } = clone(change("demo", tasks(6, [4, 5, 6])));
		const r = run(dir, [], { ghBy: { "feat/demo-4": merged(239) } });
		expect(r.calls).not.toContain(query("feat/demo-6"));
		expect(r.calls).toContain(query("feat/demo-7"));
		expect(r.calls).toContain("Carried over from group 4`");
		expect(r.calls).toContain("goal-check.ts apply demo 7");
	});

	// spec: board-loop/a-single-group-change-reopened-after-its-merge
	test("a single group reopened after its merge is carry step 2 on feat/demo-2 [14]", () => {
		const { dir } = clone();
		const r = run(dir, [], { ghBy: { "feat/demo": merged(5) } });
		expect(r.calls).toContain(query("feat/demo-2"));
		expect(r.calls).toContain("Carried over from group 1`");
		expect(r.calls).toContain("goal-check.ts apply demo 2");
	});

	// spec: board-loop/a-later-group-waiting-or-withdrawn
	test.each([
		["an open", listed(8, "open"), "pull request #8 is open on feat/demo-5"],
		["a closed", listed(8, "closed"), "pull request #8 already used feat/demo-5"],
	])("%s pull request on a later group's branch passes the change over, naming it", (_, later, why) => {
		const { dir } = clone(change("demo", tasks(5, [4, 5])));
		const r = run(dir, [], { ghBy: { "feat/demo-4": merged(239), "feat/demo-5": later } });
		expect(r.text).toContain(`passed over demo: ${why}`);
		expect(r.calls).not.toContain(query("feat/demo-6"));
		expect(r.calls).not.toContain("claude");
	});

	// spec: board-loop/a-carry-step-s-branch-already-used
	test.each([
		["a merged", merged(9), "pull request #9 already used feat/demo-4"],
		["an open", listed(9, "open"), "pull request #9 is open on feat/demo-4"],
	])("%s pull request on the carry branch passes the change over, naming it", (_, carry, why) => {
		const { dir } = clone(change("demo", THREE));
		// Every other branch reads merged too, as a `gh` that answers any name alike would: the walk still ends.
		const r = run(dir, [], { gh: merged(9), ghBy: { "feat/demo-4": carry } });
		expect(r.text).toContain(`passed over demo: ${why}`);
		expect(r.calls).not.toContain("claude");
	});

	// spec: board-loop/a-carry-step
	test("a carry's first line names the move, and its other lines are the launch form's", () => {
		const carry = prompt("demo", { step: 6, branch: "feat/demo-6", answer: false, carried: [4, 5] }, "check.ts", false).split("\n");
		const plain = prompt("demo", { step: 6, branch: "feat/demo-6", answer: false }, "check.ts", false).split("\n");
		expect(carry[0]).toContain(
			"move every unticked task of its group 4, 5, its text unchanged, into a new last group `## 6. Carried over from group 4, 5` of its tasks.md, numbered from 6.1, each moved task opening with `(was <g>.<k>)` and each old place keeping a line `Task <g>.<k> moved to 6.<j>.` with no box, then /opsx:apply demo for that group and the pre-PR sequence, up to a committed HEAD on feat/demo-6,",
		);
		expect(carry[0]).not.toContain("— or,");
		expect(carry.slice(1)).toEqual(plain.slice(1));
		expect(carry[2]).toContain("apply demo 6 --before-push");
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

	test("the query asks for one page of 100 records [6]", () => {
		const { dir } = clone();
		expect(run(dir).calls).toContain(`${query("feat/demo")}&per_page=100\n`);
	});
});
