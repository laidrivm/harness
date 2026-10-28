/**
 * `work.ts status`'s evidence for `proposed`, `applied` and `done`, read from
 * `origin/main` after a fetch and never from the checkout, and the card's
 * `Pointer` that names the change, over `work-status.fixture.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { head } from "./goal-check.fixture.ts";
import { archived, CARD, change, clone, commit, refused, status } from "./work-status.fixture.ts";

afterAll(cleanup);

const to = (target: string) => ["status", "--card", CARD, "--to", target];
const wrote = (run: Awaited<ReturnType<typeof status>>, target: string) =>
	expect([run.code, run.last, run.left]).toEqual([0, `status: ${CARD} approved → ${target}`, []]);
const without = (tree: Record<string, string | null>, end: string) => Object.fromEntries(Object.entries(tree).filter(([path]) => !path.endsWith(end)));

describe("the tree is origin/main's", () => {
	// spec: work-status/a-checkout-behind-origin
	test.each([
		["a clone", false],
		["a single-branch clone of a feature branch", true],
	])("in %s, a change archived on origin/main since proves done", async (_, single) => {
		const { seed, dir } = clone(change("demo"), single);
		commit(seed, archived("demo", "2026-10-27", true), true);
		const run = await status({ args: to("done"), cwd: dir });
		wrote(run, "done");
		expect(existsSync(join(dir, "openspec/changes/demo/tasks.md"))).toBe(true);
	});

	// spec: work-status/a-checkout-ahead-of-origin
	// spec: gate-ledger/a-status-move-refused
	test("a commit in the clone archiving the change refuses done, recording origin/main's commit", async () => {
		const { seed, dir } = clone(change("demo"));
		commit(dir, archived("demo", "2026-10-27", true));
		const run = await status({ args: to("done"), cwd: dir });
		refused(run, "no-evidence");
		expect([run.refusals[0].commit, run.refusals[0].project, run.left]).toEqual([head(seed), realpathSync(dir), []]);
	});

	// spec: work-status/the-fetch-fails
	test("an origin that cannot be fetched refuses", async () => {
		const { dir } = clone(change("demo"));
		git(dir, "remote", "set-url", "origin", join(dir, "nowhere.git"));
		refused(await status({ args: to("proposed"), cwd: dir }), "unread");
	});

	test("an origin/main with no openspec/changes refuses", async () => {
		const run = await status({ args: to("proposed"), cwd: clone().dir });
		refused(run, "unread");
		expect(run.left).toEqual([]);
	});

	test("a tree boardState() throws on refuses with its message", async () => {
		const { dir } = clone({ ...change("demo"), "openspec/changes/archive/undated/proposal.md": "# p\n" });
		const run = await status({ args: to("proposed"), cwd: dir });
		refused(run, "unread");
		expect([run.out.includes("not <date>-<slug>"), run.left]).toEqual([true, []]);
	});
});

describe("each merged status has its own evidence", () => {
	// spec: work-status/a-proposal-not-complete-on-main
	test("a change without design.md refuses proposed", async () => {
		refused(await status({ args: to("proposed"), cwd: clone(without(change("demo"), "design.md")).dir }), "no-evidence");
	});

	test("a complete change proves proposed", async () => {
		wrote(await status({ args: to("proposed"), cwd: clone(change("demo")).dir }), "proposed");
	});

	// spec: work-status/one-group-still-open
	test("group 1 ticked and group 2 open refuse applied, naming group 2", async () => {
		const run = await status({ args: to("applied"), cwd: clone(change("demo", "## 1. One\n\n- [x] 1.1 a\n\n## 2. Two\n\n- [ ] 2.1 b\n")).dir });
		refused(run, "no-evidence");
		expect(run.last).toContain("2. Two");
	});

	// spec: work-status/every-group-ticked-one-task-dropped
	test("every group ticked, one task dropped, proves applied", async () => {
		const tasks = "## 1. One\n\n- [x] 1.1 a\n\n## 2. Two\n\n- [x] 2.1 Dropped: b\n";
		wrote(await status({ args: to("applied"), cwd: clone(change("demo", tasks)).dir }), "applied");
	});

	// spec: work-status/a-task-list-with-no-group
	test.each([
		["no boxed group", "## Notes\n\nnone\n"],
		["an open group and a ticked one under one heading", "## 1. One\n\n- [ ] 1.1 a\n\n## 1. One\n\n- [x] 1.2 b\n"],
	])("%s refuses applied", async (_, tasks) => {
		refused(await status({ args: to("applied"), cwd: clone(change("demo", tasks)).dir }), "no-evidence");
	});

	// spec: work-status/an-archived-change-asked-for-applied
	test.each(["applied", "done"])("an active pointer at a change archived on main proves %s", async (target) => {
		wrote(await status({ args: to(target), cwd: clone(archived("demo")).dir }), target);
	});
});

describe("the card's Pointer", () => {
	// spec: work-status/an-empty-pointer
	// spec: work-status/text-around-the-path
	// spec: work-status/a-slug-main-does-not-hold
	// spec: work-status/an-archive-dated-otherwise
	test.each([
		["empty", "", change("demo")],
		["text around the path", "openspec/changes/demo/ (step 2)", change("demo")],
		["another repository's", "other: openspec/changes/demo/", change("demo")],
		["an archive with no date", "openspec/changes/archive/demo/", archived("demo")],
		["a slug main lacks", "openspec/changes/foo/", change("demo")],
		["an archive while main holds it active", "openspec/changes/archive/2026-10-27-demo/", change("demo")],
		["an archive dated otherwise", "openspec/changes/archive/2026-10-27-demo/", archived("demo", "2026-10-01")],
	])("%s refuses, quoting it", async (_, pointer, tree) => {
		const run = await status({ args: to("proposed"), cwd: clone(tree).dir, page: { pointer } });
		refused(run, "no-pointer");
		expect(run.last).toContain(`"${pointer}"`);
	});

	// spec: work-status/an-archived-pointer
	test("an archive origin/main holds proves done", async () => {
		const run = await status({ args: to("done"), cwd: clone(archived("demo")).dir, page: { pointer: "openspec/changes/archive/2026-10-27-demo/" } });
		wrote(run, "done");
	});

	// spec: work-status/this-repository-s-change-from-another-board
	test("this repository's own name before the path reads as the path", async () => {
		wrote(await status({ args: to("proposed"), cwd: clone(change("demo")).dir, page: { pointer: "demo: openspec/changes/demo/" } }), "proposed");
	});
});
