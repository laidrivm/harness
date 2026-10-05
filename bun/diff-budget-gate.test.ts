import { afterAll, expect, test } from "bun:test";
import {
	cleanup,
	emptyDir,
	gate,
	git,
	lines,
	repo,
	script,
} from "./diff-budget.fixture.ts";
import { root } from "./root.ts";

/**
 * The verdict rather than the count: the `oversize:` marker that turns a FAIL
 * into an OVERRIDE, how the base is resolved when none is named, and the ways
 * the gate refuses to measure — each of which must read as an error rather
 * than as a passing diff of zero lines.
 */

afterAll(cleanup);

test("an oversize marker with a reason clears the failure", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	const g = gate(
		dir,
		"main",
		"Some prose.\r\noversize: mechanical rename of computeModel across 14 files\r\nMore prose.\r\n",
	);
	expect(g.line).toBe(
		"DIFF gate: OVERRIDE — 900 lines (900 source / 0 test) — over 800, " +
			"oversize: mechanical rename of computeModel across 14 files",
	);
	expect(g.code).toBe(0);
});

test("the override covers a count of exactly 800, not only counts past it", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(800) });
	expect(gate(dir, "main").code).toBe(1);
	const g = gate(dir, "main", "oversize: at the threshold, not past it\n");
	expect(g.line).toContain("OVERRIDE — 800 lines");
	expect(g.code).toBe(0);
});

test("an oversize marker with no reason does not clear the failure", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	const g = gate(dir, "main", "oversize:   \r\n");
	expect(g.line).toContain("FAIL");
	expect(g.line).toContain("oversize: marker carries no reason");
	expect(g.code).toBe(1);
});

test("an oversize marker does not rescue a branch that only warns", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(600) });
	const g = gate(dir, "main", "oversize: not needed here\n");
	expect(g.line).toContain("WARN — 600 lines");
	expect(g.line).not.toContain("oversize");
});

test("a body mentioning oversize mid-line is not a marker", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	const g = gate(dir, "main", "I considered whether oversize: applies here.\n");
	expect(g.line).toContain("FAIL");
	expect(g.line).not.toContain("oversize:");
	expect(g.code).toBe(1);
});

test("the first oversize marker in a body wins", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	const g = gate(
		dir,
		"main",
		"oversize: the real reason\noversize: a stale one\n",
	);
	expect(g.line).toContain("oversize: the real reason");
	expect(g.line).not.toContain("stale");
});

test("an empty marker does not shadow a later one that carries a reason", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	const g = gate(dir, "main", "oversize:\noversize: mechanical rename\n");
	expect(g.line).toContain("OVERRIDE");
	expect(g.line).toContain("oversize: mechanical rename");
	expect(g.code).toBe(0);
});

test("an indented marker still clears the failure", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	const g = gate(dir, "main", "  oversize: indented but on its own line\n");
	expect(g.line).toContain("OVERRIDE");
});

test("a marker written as a markdown bullet is not a marker", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	// The spec names a line *beginning* `oversize:`. A bullet begins with the
	// dash, so it does not clear — the marker is a field, not prose.
	const g = gate(dir, "main", "- oversize: mechanical rename\n");
	expect(g.line).toContain("FAIL");
	expect(g.code).toBe(1);
});

test("a capitalised marker is not a marker", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(900) });
	const g = gate(dir, "main", "Oversize: mechanical rename\n");
	expect(g.line).toContain("FAIL");
	expect(g.code).toBe(1);
});

test("an unresolvable base exits non-zero rather than reporting a pass", () => {
	const g = gate(
		repo({ "a.ts": "one\n" }, { "b.ts": lines(10) }),
		"no-such-branch",
	);
	// 2, not 1: CI has to tell a diff it could not measure from one that is
	// merely over budget, and the pre-push hook absorbs both alike.
	expect(g.code).toBe(2);
	expect(g.stderr).toContain("cannot resolve base ref 'no-such-branch'");
	expect(g.line).toBe("");
});

test("the default base is resolved when no argument is given", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(10) });
	// No remote, so `origin/HEAD` fails and the fallback to `main` is what
	// answers — the path every other case skips by passing a base.
	const p = Bun.spawnSync(["bash", script], { cwd: dir });
	expect(p.stdout.toString()).toContain("PASS — 10 lines");
	expect(p.exitCode).toBe(0);
});

test("the default comes from origin/HEAD, not from a local branch", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(10) });
	const remote = emptyDir("diff-budget-remote-");
	git(remote, "init", "-q", "--bare", "-b", "main");
	git(dir, "remote", "add", "origin", remote);
	git(dir, "push", "-q", "origin", "main", "feature");
	git(dir, "remote", "set-head", "origin", "main");
	// Deleting the local branch is what makes this case discriminating: with
	// `main` still present, a script that resolved nothing at all would fall
	// back to it and count the same 10 lines.
	git(dir, "branch", "-qD", "main");
	const p = Bun.spawnSync(["bash", script], { cwd: dir });
	expect(p.stdout.toString()).toContain("PASS — 10 lines");
	expect(p.exitCode).toBe(0);
});

test("outside a git repository the script exits non-zero", () => {
	const dir = emptyDir("diff-budget-bare-");
	const p = Bun.spawnSync(["bash", script, "main"], { cwd: dir });
	// 2 rather than merely non-zero, for the reason the unresolvable-base case
	// above gives: this is a diff that could not be measured, not one over
	// budget, and CI has to tell them apart.
	expect(p.exitCode).toBe(2);
	expect(p.stdout.toString()).not.toContain("PASS");
});

test("an unrelated base exits non-zero — no merge base to measure from", () => {
	const dir = repo({ "a.ts": "one\n" }, { "b.ts": lines(10) });
	git(dir, "checkout", "-q", "--orphan", "detached");
	git(dir, "commit", "-qm", "unrelated", "--allow-empty");
	git(dir, "branch", "-f", "main", "detached");
	git(dir, "checkout", "-q", "feature");
	const g = gate(dir);
	expect(g.code).toBe(2);
	expect(g.stderr).toContain("no merge base");
});

// The override lives in the pull request body, and a body edit is its own
// activity type. Without it the workflow reports a verdict on a body that has
// since changed — a marker added after the last push is never read.
test("the workflow re-runs when the pull request body is edited", async () => {
	const workflow = await Bun.file(
		`${root}/.github/workflows/diff-budget.yml`,
	).text();
	const types = (
		Bun.YAML.parse(workflow) as { on: { pull_request: { types: string[] } } }
	).on.pull_request.types;

	expect(types).toContain("edited");
	// The defaults stop applying the moment `types` is named at all.
	expect(types).toEqual(
		expect.arrayContaining(["opened", "synchronize", "reopened"]),
	);
});
