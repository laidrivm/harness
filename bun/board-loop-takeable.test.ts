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

	// spec: board-loop/every-group-ticked
	test("a change with every group ticked is passed over [9]", () => {
		const { dir } = clone(change("demo", TICKED));
		const r = run(dir);
		expect(r.text).toContain("passed over demo: every group is ticked");
		expect(r.last).toStartWith("board-loop: idle");
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
		const r = run(dir, ["demo"], { gh: '[{"number":7,"state":"OPEN"}]' });
		expect(r.text).toContain("passed over demo: pull request #7 is open on feat/demo");
		expect(r.calls).not.toContain("claude");
	});

	test.each([
		["closed", "CLOSED"],
		["merged", "MERGED"],
	])("a %s pull request that used the branch name [14]", (_, state) => {
		const { dir } = clone();
		const r = run(dir, ["demo"], { gh: `[{"number":5,"state":"${state}"}]` });
		expect(r.text).toContain("passed over demo: pull request #5 already used feat/demo");
	});

	// spec: board-loop/gh-unavailable
	test.each([
		["failing", { gh: "", ghCode: 1 }],
		["missing", { gh: null }],
		["answering with no JSON", { gh: "not json" }],
	])("gh %s leaves nothing takeable [17]", (_, stubs) => {
		const { dir } = clone();
		const r = run(dir, ["demo"], stubs);
		expect(r.text).toContain("passed over demo: the pull request query failed");
		expect(r.last).toStartWith("board-loop: idle");
	});
});

describe("the change the user names", () => {
	test("one that is not takeable is refused with its reason [15]", () => {
		const { dir } = clone({ ...change("demo", TICKED), ...change("other") });
		const r = run(dir, ["demo"]);
		expect(r.code).toBe(1);
		expect(r.last).toBe("board-loop: refused — demo: every group is ticked");
	});

	test("the one named is carried, not the first of several takeable", () => {
		const { dir } = clone({ ...change("demo"), ...change("other") });
		const r = run(dir, ["other"]);
		expect(r.calls).toContain("goal-check.ts apply other 1");
		expect(r.calls).not.toContain("apply demo");
	});

	test("one with no directory is refused [16]", () => {
		const { dir } = clone();
		const r = run(dir, ["ghost"]);
		expect(r.last).toBe("board-loop: refused — ghost: no change of that name is proposed");
	});

	test.each([[[]], [["demo", "other"]], [["../demo"]]])(
		"a call naming anything but one change is refused with the usage: %j",
		(args) => {
			const { dir } = clone();
			const r = run(dir, args);
			expect(r.last).toContain("usage: board-loop.ts <change>");
			expect(r.calls).toBe("");
		},
	);
});
