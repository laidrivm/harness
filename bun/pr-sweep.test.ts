/**
 * The sweep's selection, its exit statuses and its marked heads. The
 * judgement of one head is in `pr-sweep-judge.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import {
	commit,
	compare,
	green,
	LIST,
	LOGIN,
	listing,
	mark,
	marks,
	pkg,
	pull,
	run,
	sha,
	status,
	sweep,
} from "./pr-sweep.fixture.ts";

afterAll(cleanup);

const SWEPT = status("harness/sweep", "SUCCESS");
const statuses = (n: number, description: string) => ({
	[marks(n)]: { out: { statuses: [{ context: "harness/sweep", description }] } },
});

describe("which pull requests are judged", () => {
	// spec: pr-sweep/a-clean-run
	test("no open pull request prints nothing and exits 0 [1]", () => {
		const r = sweep(listing([]));
		expect([r.code, r.out]).toEqual([0, ""]);
	});

	// spec: pr-sweep/another-branch-another-author-or-a-fork
	test.each([
		["fix/x", {}],
		["feat", {}],
		["feature/x", {}],
		["FEAT/x", {}],
		["feat/x", { author: { login: "someone" } }],
		["feat/x", { author: { login: "app/demo-agent", is_bot: true } }],
		["feat/x", { author: { login: "demo-agent" } }],
		["feat/x", { author: { login: "demo-agent[bot]" } }],
		["feat/x", { isCrossRepository: true }],
	])("%s %j gets the listing alone and no line [2, 10, 14, 45]", (headRefName, over) => {
		const r = sweep(listing([pull(1, { headRefName, ...over })]));
		expect([r.code, r.out, r.calls]).toEqual([0, "", [LOGIN, LIST]]);
	});

	// spec: pr-sweep/an-agent-branch-by-an-allowed-author
	test("a spec/ branch by the credential's login is judged [10]", () => {
		const r = sweep(listing([pull(1, { headRefName: "spec/x" })], green(1)));
		expect(r.lines.map((l) => l.outcome)).toEqual(["marked"]);
	});

	// spec: pr-sweep/a-draft
	test("a draft reads skipped, with no status [45]", () => {
		const r = sweep(listing([pull(1, { isDraft: true })]));
		expect(r.lines).toEqual([{ repo: "o/r", pr: 1, branch: "feat/demo-1", sha: sha(1), outcome: "skipped", reason: "draft", handoffs: [] }]);
		expect(r.calls).toEqual([LOGIN, LIST]);
	});

	// spec: pr-sweep/no-app
	test("with no App, no token is minted and the bot is no author [46]", () => {
		const bot = pull(1, { author: { login: "app/demo-agent", is_bot: true } });
		const r = sweep(listing([bot]));
		expect(r.calls).toEqual([LOGIN, LIST]);
	});
});

describe("a marked head", () => {
	// spec: pr-sweep/a-marked-head-with-nothing-new
	test.each([
		["SUCCESS", "a green head"],
		["PENDING", "a mark in a state other than success [15]"],
	])("%s: %s with nothing new reads skipped, reads no drift and no description [45]", (state) => {
		const rollup = [run("test", "SUCCESS"), status("harness/sweep", state)];
		const r = sweep(listing([pull(1, { statusCheckRollup: rollup })], { [compare("main", sha(1))]: { out: { behind_by: 0 } } }));
		expect(r.lines.map((l) => [l.outcome, l.reason])).toEqual([["skipped", "marked"]]);
		expect(r.calls).toEqual([LOGIN, LIST, compare("main", sha(1))]);
	});

	// spec: pr-sweep/the-base-moves-after-the-mark
	test("a base that moved reads updated", () => {
		const r = sweep(
			listing([pull(1, { statusCheckRollup: [run("test", "SUCCESS"), SWEPT] })], {
				[compare("main", sha(1))]: { out: { behind_by: 2 } },
				"pr update-branch 1 --repo o/r": {},
			}),
		);
		expect(r.lines.map((l) => l.outcome)).toEqual(["updated"]);
	});

	// spec: pr-sweep/ci-turns-red-after-the-mark
	test("a check red under a mark without ci hands off ci once, beside the kinds marked before (review of PR 182)", () => {
		const red = pull(1, { statusCheckRollup: [run("test", "FAILURE"), SWEPT] });
		const table = listing([red], {
			[compare("main", sha(1))]: { out: { behind_by: 0 } },
			...statuses(1, "handed off: description"),
			[mark(1, "handed off: description, ci")]: {},
		});
		const r = sweep(table);
		expect(r.lines[0].handoffs).toEqual([{ kind: "ci", to: "ciflow", detail: ["CI / test"] }]);
		expect(r.calls).toContain(mark(1, "handed off: description, ci"));
		expect(r.calls).not.toContain(pkg(1));
		expect(r.calls).not.toContain(commit(1));
		const after = sweep({ ...table, ...statuses(1, "handed off: description, ci") });
		expect(after.lines.map((l) => [l.outcome, l.reason])).toEqual([["skipped", "marked"]]);
	});

	// spec: pr-sweep/a-push-after-the-mark
	test("a marked head reads no status description with nothing to hand off; a new head is judged in full", () => {
		const r = sweep(listing([pull(1, { statusCheckRollup: [run("test", "SUCCESS"), SWEPT] })], green(1)));
		expect(r.calls).not.toContain(marks(1));
		const fresh = sweep(listing([pull(2)], green(2)));
		expect(fresh.lines[0].handoffs.map((h: { kind: string }) => h.kind)).toEqual(["description"]);
	});
});

describe("the argument and the exit status", () => {
	// spec: pr-sweep/a-bad-argument
	test.each([[""], ["o/r/x"], ["o/.."], ["o/."], ["o r"], ["o/r\n"], ["-o/r"], [`${"a".repeat(40)}/r`]])(
		"%j exits 2 with no gh run [12]",
		(arg) => {
			const r = sweep(listing([]), [arg]);
			expect([r.code, r.calls]).toEqual([2, []]);
		},
	);

	test("a failed gh api user exits 1 before the listing [29]", () => {
		const r = sweep({ [LOGIN]: { code: 1, err: "HTTP 401" } });
		expect([r.code, r.calls]).toEqual([1, [LOGIN]]);
	});

	test.each([
		["fails", { code: 1 }, {}],
		["times out", { sleep: 30 }, { HARNESS_GH_TIMEOUT_MS: "300" }],
	])("a listing that %s exits 1 [22, 31]", (_, answer, env) => {
		const r = sweep({ [LOGIN]: { out: "laidrivm" }, [LIST]: answer }, ["o/r"], env);
		expect([r.code, r.out]).toEqual([1, ""]);
	});

	// spec: pr-sweep/one-pull-request-fails
	test("a failed line and a marked one print in listing order and exit 1 [4]", () => {
		const table = listing([pull(1), pull(2)], {
			[compare("main", sha(1))]: { code: 1, err: "HTTP 500" },
			...green(2),
		});
		const r = sweep(table);
		expect(r.lines.map((l) => [l.pr, l.outcome])).toEqual([
			[1, "failed"],
			[2, "marked"],
		]);
		expect(r.code).toBe(1);
	});
});
