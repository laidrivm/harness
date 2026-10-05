import { afterAll, expect, test } from "bun:test";
import { cleanup, gate, git, lines, repo } from "./diff-budget.fixture.ts";

/**
 * What the gate counts and what it refuses to: which paths are excluded,
 * which are read as test rather than source, and where the two thresholds
 * fall. The task-line pairing is `diff-budget-tasks.test.ts`'s; the override
 * marker and the ways the gate declines to measure at all are
 * `diff-budget-gate.test.ts`'s.
 */

afterAll(cleanup);

test("an empty diff counts zero and passes", () => {
	const g = gate(repo({ "a.ts": "one\n" }, {}));
	expect(g.line).toBe("DIFF gate: PASS — 0 lines (0 source / 0 test)");
	expect(g.code).toBe(0);
});

// The count must not move with a developer's preferences: measured, the same
// rename read 0 lines with detection on and 800 with it off, so a branch could
// pass locally and fail in CI on a setting neither of them states. Both
// settings that reach detection are hostile here — `renameLimit` skips it on a
// diff carrying more files than the limit, which `renames` alone does not
// cover.
test("a rename counts the same whatever the rename settings say", () => {
	// Both edited on the way, so neither pairs exactly: an identical move is
	// matched before the limit is consulted, and it is the leftover matrix
	// that `renameLimit` refuses to search.
	const a = lines(400);
	const b = `${lines(400)}b\n`;
	const dir = repo(
		{ "a.ts": a, "b.ts": b },
		{
			"a.ts": null,
			"b.ts": null,
			"moved-a.ts": `${a}a edit\n`,
			"moved-b.ts": `${b}b edit\n`,
		},
	);
	git(dir, "config", "diff.renames", "false");
	git(dir, "config", "diff.renameLimit", "1");

	const g = gate(dir);

	// One added line each is all there is to read; undetected, the four files
	// would contribute their whole length instead.
	expect(g.total).toBe(2);
});

test("excluded artefacts contribute nothing", () => {
	const g = gate(
		repo(
			{
				"bun.lock": "old\n",
				"f.woff2": "old\n",
				"src/fixtures/snapshot.json": "{}\n",
			},
			{
				"bun.lock": lines(900),
				"f.woff2": lines(50),
				"src/fixtures/snapshot.json": lines(200),
			},
		),
	);
	expect(g.total).toBe(0);
});

test("a lockfile-heavy branch reports only its source lines", () => {
	const g = gate(
		repo(
			{ "bun.lock": "old\n" },
			{ "bun.lock": lines(900), "a.ts": lines(40) },
		),
	);
	expect(g.total).toBe(40);
});

test("a pure rename contributes zero", () => {
	const body = lines(40);
	const g = gate(repo({ "old.ts": body }, { "old.ts": null, "new.ts": body }));
	expect(g.total).toBe(0);
});

test("a changed binary contributes zero", () => {
	const g = gate(
		repo(
			{ "logo.bin": new Uint8Array([0, 1, 2, 0, 3]) },
			{ "logo.bin": new Uint8Array([0, 9, 9, 0, 9, 9, 9]) },
		),
	);
	expect(g.total).toBe(0);
});

test("src/app/latest.ts is source, not test", () => {
	const g = gate(repo({ "a.ts": "one\n" }, { "src/app/latest.ts": lines(20) }));
	expect(g.source).toBe(20);
	expect(g.test).toBe(0);
});

test("an e2e spec is test", () => {
	const g = gate(repo({ "a.ts": "one\n" }, { "e2e/smoke.spec.ts": lines(20) }));
	expect(g.test).toBe(20);
	expect(g.source).toBe(0);
});

test("a root-level *.test.ts is test", () => {
	const g = gate(
		repo({ "a.ts": "one\n" }, { "readme-map.test.ts": lines(20) }),
	);
	expect(g.test).toBe(20);
	expect(g.source).toBe(0);
});

test("the split sums to the total", () => {
	const g = gate(
		repo(
			{ "a.ts": "one\n" },
			{ "src/model.ts": lines(340), "src/model.test.ts": lines(610) },
		),
	);
	expect(g.source).toBe(340);
	expect(g.test).toBe(610);
	expect(g.source + g.test).toBe(g.total);
});

test("499 lines pass", () => {
	const g = gate(repo({ "a.ts": "one\n" }, { "b.ts": lines(499) }));
	expect(g.line).toBe("DIFF gate: PASS — 499 lines (499 source / 0 test)");
	expect(g.code).toBe(0);
});

test("500 lines warn and still exit zero", () => {
	const g = gate(repo({ "a.ts": "one\n" }, { "b.ts": lines(500) }));
	expect(g.line).toBe(
		"DIFF gate: WARN — 500 lines (500 source / 0 test) — over 500, fails at 800",
	);
	expect(g.code).toBe(0);
});

test("799 lines warn", () => {
	const g = gate(repo({ "a.ts": "one\n" }, { "b.ts": lines(799) }));
	expect(g.line).toContain("WARN — 799 lines");
	expect(g.code).toBe(0);
});

test("800 lines fail and exit non-zero", () => {
	const g = gate(repo({ "a.ts": "one\n" }, { "b.ts": lines(800) }));
	expect(g.line).toBe(
		"DIFF gate: FAIL — 800 lines (800 source / 0 test) — over 800",
	);
	expect(g.code).not.toBe(0);
});

test("a test-heavy branch fails on the total, tests included", () => {
	const g = gate(
		repo({ "a.ts": "one\n" }, { "a.ts": lines(340), "a.test.ts": lines(610) }),
	);
	// 340 added + 1 removed original line, so the verdict is the total's.
	expect(g.line).toContain("FAIL");
	expect(g.code).not.toBe(0);
});

test("patch headers written as file content are counted, not parsed", () => {
	// `design.md` in this repo contains a diff snippet. Inside a hunk these
	// are content: a removed `-- foo` and an added `++ foo` arrive on the
	// wire as `--- foo` and `+++ foo`.
	const g = gate(
		repo(
			{ "design.md": "intro\n--- a/old.ts\nmiddle\n" },
			{ "design.md": "intro\n+++ b/new.ts\nmiddle\n" },
		),
	);
	expect(g.total).toBe(2);
});
