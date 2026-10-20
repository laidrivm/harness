/**
 * How the sweep judges one agent head, in the order `design.md` fixes:
 * mergeability, freshness, drift, CI, then the description; and the line and
 * the mark it ends on. Selection and exit statuses are in `pr-sweep.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./diff-budget.fixture.ts";
import {
	type Answer,
	commit,
	compare,
	file,
	green,
	listing,
	mark,
	NOT_FOUND,
	PIN,
	pkg,
	pull,
	run,
	sha,
	status,
	sweep,
	type Table,
} from "./pr-sweep.fixture.ts";

afterAll(cleanup);

const FRESH = { [compare("main", sha(1))]: { out: { behind_by: 0 } } };
const CORE = `api repos/laidrivm/harness/contents/core?ref=${PIN}`;
const COPY = `api repos/o/r/contents/harness?ref=${sha(1)}`;
const listed = (files: Record<string, string>) => ({ out: Object.keys(files).map((name) => ({ name, type: "file" })) });

/** Head 1 pins the harness; `copy` null is a 404 on its `harness/`. */
function pinned(copy: Record<string, string> | null, core: Record<string, string> = { "rules.md": "rules" }): Table {
	const table: Table = {
		[pkg(1)]: { out: file(JSON.stringify({ dependencies: { harness: `github:laidrivm/harness#${PIN}` } })) },
		[CORE]: { out: [...listed(core).out, { name: "skills", type: "dir" }] },
		[COPY]: copy === null ? NOT_FOUND : listed(copy),
	};
	for (const [name, text] of Object.entries(core)) table[`api repos/laidrivm/harness/contents/core/${name}?ref=${PIN}`] = { out: file(text) };
	for (const [name, text] of Object.entries(copy ?? {})) table[`api repos/o/r/contents/harness/${name}?ref=${sha(1)}`] = { out: file(text) };
	return table;
}

const one = (over: object, rest: Table) => sweep(listing([pull(1, over)], rest));
const kinds = (r: ReturnType<typeof sweep>) => r.lines[0].handoffs.map((h: { kind: string }) => h.kind);

describe("mergeability and freshness", () => {
	// spec: pr-sweep/mergeability-not-computed
	test("UNKNOWN reads waiting, with no status [35]", () => {
		const r = one({ mergeable: "UNKNOWN" }, {});
		expect([r.lines[0].outcome, r.lines[0].reason]).toEqual(["waiting", "mergeability"]);
	});

	// spec: pr-sweep/a-conflicting-pull-request
	test("CONFLICTING gives a conflict hand-off with no update, and is marked [36]", () => {
		const r = one({ mergeable: "CONFLICTING" }, { [mark(1, "handed off: conflict")]: {} });
		expect(r.lines[0].handoffs).toEqual([{ kind: "conflict", to: "agent", detail: [] }]);
		expect(r.calls.some((c) => c.startsWith("pr update-branch"))).toBe(false);
		expect(r.code).toBe(0);
	});

	// spec: pr-sweep/behind-its-base
	test("behind_by 1 runs update-branch with the number and --repo alone, reads updated, no drift fetch, no status [11, 18, 37]", () => {
		const r = one({}, { [compare("main", sha(1))]: { out: { behind_by: 1 } }, "pr update-branch 1 --repo o/r": {} });
		expect(r.lines.map((l) => [l.outcome, l.reason])).toEqual([["updated", undefined]]);
		expect(r.calls.at(-1)).toBe("pr update-branch 1 --repo o/r");
	});

	// spec: pr-sweep/the-update-fails
	test("a failed update reads failed, with no status, and exits 1 [20]", () => {
		const r = one({}, { [compare("main", sha(1))]: { out: { behind_by: 1 } }, "pr update-branch 1 --repo o/r": { code: 1, err: "merge conflict" } });
		expect([r.lines[0].outcome, r.lines[0].reason, r.code]).toEqual(["failed", "merge conflict", 1]);
	});

	test("a failed compare reads failed [28]", () => {
		const r = one({}, { [compare("main", sha(1))]: { code: 1, err: "HTTP 502" } });
		expect(r.lines[0].outcome).toBe("failed");
	});
});

describe("drift", () => {
	// spec: pr-sweep/a-copy-that-differs
	test("a differing file is a drift hand-off, marked, however CI reads [38, 39]", () => {
		for (const check of [run("test", "FAILURE"), run("test", "", null, "IN_PROGRESS")]) {
			const r = one({ statusCheckRollup: [check] }, { ...FRESH, ...pinned({ "rules.md": "edited" }), [mark(1, "handed off: drift")]: {} });
			expect(r.lines[0].handoffs).toEqual([{ kind: "drift", to: "agent", detail: [expect.stringContaining("harness/rules.md: differs")] }]);
		}
	});

	test("three problems are one hand-off with three detail lines [8]", () => {
		const core = { "a.md": "a", "rules.md": "rules" };
		const r = one({}, { ...FRESH, ...pinned({ "rules.md": "edited", "z.md": "z" }, core), [mark(1, "handed off: drift")]: {} });
		expect(r.lines[0].handoffs[0].detail).toHaveLength(3);
	});

	// spec: pr-sweep/a-copy-that-is-missing
	test("a 404 on harness/ names every file of the pinned core/ [25]", () => {
		const r = one({}, { ...FRESH, ...pinned(null, { "a.md": "a", "rules.md": "rules" }), [mark(1, "handed off: drift")]: {} });
		expect(r.lines[0].handoffs[0].detail).toEqual([expect.stringContaining("harness/a.md: missing"), expect.stringContaining("harness/rules.md: missing")]);
	});

	// spec: pr-sweep/the-harness-itself
	test.each([
		["devDependencies alone", { out: file(JSON.stringify({ devDependencies: { harness: "x" } })) }],
		["no package.json", NOT_FOUND],
	])("%s: no core/ read [23, 44]", (_, answer: Answer) => {
		const r = one({}, { ...green(1), [pkg(1)]: answer });
		expect(r.calls.some((c) => c.includes("laidrivm/harness"))).toBe(false);
		expect(kinds(r)).toEqual(["description"]);
	});

	// spec: pr-sweep/a-malformed-pin
	test("a malformed pin reads failed, naming the value [24]", () => {
		const r = one({}, { ...FRESH, [pkg(1)]: { out: file(JSON.stringify({ dependencies: { harness: "^1.0.0" } })) } });
		expect([r.lines[0].outcome, r.lines[0].reason]).toEqual(["failed", expect.stringContaining("^1.0.0")]);
	});

	test.each([
		["a non-404 listing failure", { [COPY]: { code: 1, err: "HTTP 500" } }],
		["a pinned core/ with no rules.md", { [CORE]: listed({ "a.md": "a" }), [`api repos/laidrivm/harness/contents/core/a.md?ref=${PIN}`]: { out: file("a") } }],
		["a failed file fetch", { [`api repos/laidrivm/harness/contents/core/rules.md?ref=${PIN}`]: { code: 1, err: "HTTP 500" } }],
	])("%s reads failed, and the temporary directories are gone [26, 27, 30]", (_, over) => {
		const r = one({}, { ...FRESH, ...pinned({ "rules.md": "rules" }), ...over });
		expect([r.lines[0].outcome, r.left]).toEqual(["failed", []]);
	});

	test("a clean copy leaves no temporary directory behind [30]", () => {
		const r = one({}, { ...FRESH, ...pinned({ "rules.md": "rules" }), [commit(1)]: { out: { parents: [{ sha: "p" }] } }, [mark(1, "handed off: description")]: {} });
		expect([kinds(r), r.left]).toEqual([["description"], []]);
	});
});

describe("CI", () => {
	const ci = (rollup: object[], rest: Table = {}) => one({ statusCheckRollup: rollup }, { ...green(1), ...rest });

	// spec: pr-sweep/a-check-still-running
	test("a pending check reads waiting, naming it [40]", () => {
		const r = ci([run("test", "SUCCESS"), run("lint", "", "2026-10-20T10:00:00Z", "QUEUED")]);
		expect([r.lines[0].outcome, r.lines[0].reason]).toEqual(["waiting", "CI / lint"]);
	});

	// spec: pr-sweep/no-check-yet
	test("no check reads waiting, no checks [40]", () => {
		const r = ci([]);
		expect(r.lines[0].reason).toBe("no checks");
	});

	// spec: pr-sweep/a-check-re-run-green-by-someone-else
	test("earlier failed and latest passed is passed; the reverse is failed [5, 6]", () => {
		const early = "2026-10-20T09:00:00Z";
		expect(kinds(ci([run("test", "FAILURE", early), run("test", "SUCCESS")]))).toEqual(["description"]);
		const red = ci([run("test", "SUCCESS", early), run("test", "FAILURE")], { [mark(1, "handed off: ci")]: {} });
		expect(kinds(red)).toEqual(["ci"]);
	});

	// spec: pr-sweep/a-queued-re-run
	test("a queued re-run with no startedAt after a pass is pending; on a tie pending wins, then failed (review of PR 182)", () => {
		expect(ci([run("test", "SUCCESS"), run("test", "", null, "QUEUED")]).lines[0].outcome).toBe("waiting");
		expect(ci([run("test", "SUCCESS"), run("test", "", undefined, "IN_PROGRESS")]).lines[0].outcome).toBe("waiting");
		expect(kinds(ci([run("test", "SUCCESS"), run("test", "FAILURE")], { [mark(1, "handed off: ci")]: {} }))).toEqual(["ci"]);
	});

	// spec: pr-sweep/a-failed-check
	test("one name in two workflows is two keys, and two failed checks are one ci hand-off with no gh run [7, 9, 42]", () => {
		const other = { ...run("test", "FAILURE"), workflowName: "Nightly" };
		const r = ci([run("test", "FAILURE"), other, run("lint", "SUCCESS")], { [mark(1, "handed off: ci")]: {} });
		expect(r.lines[0].handoffs).toEqual([{ kind: "ci", to: "ciflow", detail: ["CI / test", "Nightly / test"] }]);
		expect(r.calls.some((c) => c.startsWith("run"))).toBe(false);
	});

	test.each([
		["CANCELLED", run("x", "CANCELLED"), "ci"],
		["TIMED_OUT", run("x", "TIMED_OUT"), "ci"],
		["status ERROR", status("x", "ERROR"), "ci"],
		["NEUTRAL", run("x", "NEUTRAL"), "description"],
		["SKIPPED", run("x", "SKIPPED"), "description"],
	])("%s counts as %s's kind [41]", (_, check, kind) => {
		expect(kinds(ci([check], { [mark(1, `handed off: ${kind}`)]: {} }))).toEqual([kind]);
	});

	test("status EXPECTED is pending [41]", () => {
		expect(ci([status("x", "EXPECTED")]).lines[0].outcome).toBe("waiting");
	});
});

describe("the description", () => {
	const merge = (ahead: number) => ({
		[commit(1)]: { out: { parents: [{ sha: "p" }, { sha: "q" }] } },
		[compare("main", "q")]: { out: { ahead_by: ahead } },
	});

	// spec: pr-sweep/a-green-head-after-a-new-commit
	test("a green head gives a description hand-off, marked handed off: description [3]", () => {
		const r = one({}, green(1));
		expect(r.lines[0].handoffs).toEqual([{ kind: "description", to: "agent", detail: [] }]);
		expect(r.calls.at(-1)).toBe(mark(1, "handed off: description"));
	});

	// spec: pr-sweep/a-green-head-the-sweep-s-own-update-made
	test("a merge of the base gives none; a merge whose second parent the base lacks gives one [43]", () => {
		const own = one({}, { ...green(1, "nothing to hand off"), ...merge(0) });
		expect([own.lines[0].outcome, kinds(own)]).toEqual(["marked", []]);
		expect(own.calls).toContain(mark(1, "nothing to hand off"));
		expect(kinds(one({}, { ...green(1), ...merge(3) }))).toEqual(["description"]);
	});
});

describe("the line and the mark", () => {
	// spec: pr-sweep/the-line-s-shape
	test("every fixed key is present, reason absent for marked, arrays always arrays, stdout only JSON [16, 17]", () => {
		const r = one({ statusCheckRollup: [run("test", "FAILURE")] }, { ...green(1), [mark(1, "handed off: ci")]: {} });
		expect(r.lines).toEqual([{ repo: "o/r", pr: 1, branch: "feat/demo-1", sha: sha(1), outcome: "marked", handoffs: [{ kind: "ci", to: "ciflow", detail: ["CI / test"] }] }]);
		expect(r.out.trim().split("\n")).toHaveLength(1);
	});

	// spec: pr-sweep/the-mark-names-the-hand-offs
	test("the mark goes to the head SHA as harness/sweep success, after the line [19]", () => {
		const r = one({ mergeable: "CONFLICTING" }, { [mark(1, "handed off: conflict")]: {} });
		expect(r.calls.at(-1)).toBe(mark(1, "handed off: conflict"));
	});

	// spec: pr-sweep/a-line-printed-before-its-mark-fails
	test("a failed mark leaves the line, names the pull request and SHA on stderr, exits 1 [21]", () => {
		const r = one({ mergeable: "CONFLICTING" }, { [mark(1, "handed off: conflict")]: { code: 1, err: "HTTP 403" } });
		expect([r.lines[0].outcome, r.code]).toEqual(["marked", 1]);
		expect(r.err).toContain(`#1 at ${sha(1)}`);
	});
});
