import { afterAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
	cleanup,
	commit,
	DONE,
	end,
	git,
	OPEN,
	prompt,
	publish,
	repo,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";
import { decide, mark } from "./turn-gate.ts";

/**
 * Which groups `turn-gate.ts` leaves out because `origin/main` holds them
 * complete when the turn ends: a pull, a fetch or a merge of `main` brings
 * such a group in rather than completing it. When a turn qualifies at all is
 * `turn-gate-turn.test.ts`'s. Bracketed numbers are the proposal-stage
 * `/zombies` ideas.
 */

afterAll(cleanup);

/** A second change, so a turn can complete its own group beside a pulled one. */
const OWN = "openspec/changes/own/tasks.md";

type Files = Record<string, string>;

/** A repository on `branch` whose `origin/main` holds the same tree. */
function based(branch: "main" | "feat", files: Files): string {
	const dir = repo(files);
	if (branch === "main") git(dir, "checkout", "-q", "-b", "main");
	publish(dir);
	if (branch === "main") git(dir, "branch", "-q", "-u", "origin/main");
	return dir;
}

/**
 * Lands a commit of `files`, and of whatever the tree already stages, on
 * `origin/main` alone — another pull request merging — then puts the local
 * branch back where it was.
 */
function land(dir: string, files: Files): void {
	const at = git(dir, "rev-parse", "HEAD");
	commit(dir, files);
	publish(dir);
	git(dir, "reset", "-q", "--hard", at);
}

/** The mark a turn starts from, in a store of its own. */
function marked(dir: string): string {
	const marks = store();
	mark(prompt(dir), marks);
	return marks;
}

const pull = ["merge", "-q", "--ff-only", "origin/main"];
const mergeMain = ["merge", "-q", "--no-ff", "--no-edit", "origin/main"];

describe("a group origin/main already holds complete", () => {
	// spec: commit-gates/a-pull-brings-in-another-pull-request-s-completed-group
	test("a fast-forward pull on `main` that completes a group ends the turn [2]", () => {
		const dir = based("main", { [TASKS]: OPEN });
		land(dir, { [TASKS]: DONE });
		const marks = marked(dir);
		git(dir, ...pull);
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	// spec: commit-gates/a-fetch-on-main-moves-the-tip-to-its-remote-tracking-ref
	test("a fetch on `main` with `HEAD` left at the mark ends the turn [3]", () => {
		const dir = based("main", { [TASKS]: OPEN });
		const marks = marked(dir);
		land(dir, { [TASKS]: DONE });
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	// spec: commit-gates/main-merged-into-a-feature-branch
	test("`origin/main` merged into `feat` with nothing of the turn's own ends the turn [6]", () => {
		const dir = based("feat", { [TASKS]: OPEN });
		land(dir, { [TASKS]: DONE });
		const marks = marked(dir);
		git(dir, ...mergeMain);
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	test("a change the mark lacks, pulled in complete, ends the turn [9]", () => {
		const dir = based("main", {});
		land(dir, { [TASKS]: DONE });
		const marks = marked(dir);
		git(dir, ...pull);
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	test("a turn whose only completed groups came from `origin/main` records nothing [10]", () => {
		const dir = based("feat", { [TASKS]: OPEN });
		land(dir, { [TASKS]: DONE });
		const marks = marked(dir);
		git(dir, ...mergeMain);
		const logged: string[] = [];
		decide(end(dir, SILENT), marks, (decision) => logged.push(decision));
		expect(logged).toEqual([]);
	});

	// spec: commit-gates/a-turn-that-merges-its-own-pull-request
	test("a turn that publishes its own completed group as `origin/main` ends — the accepted cost [12]", () => {
		const dir = based("feat", { [TASKS]: OPEN });
		const marks = marked(dir);
		commit(dir, { [TASKS]: DONE });
		git(dir, "push", "-q");
		publish(dir);
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});
});

describe("a group the turn completed itself", () => {
	test("pushing it to `feat` while `origin/main` holds it open is refused [4]", () => {
		const dir = based("feat", { [TASKS]: OPEN });
		const marks = marked(dir);
		commit(dir, { [TASKS]: DONE });
		git(dir, "push", "-q");
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});

	// spec: commit-gates/the-turn-s-own-group-beside-a-pulled-one
	test.each([
		["a pull on `main` [5]", "main", pull],
		["`origin/main` merged into `feat` [7]", "feat", mergeMain],
	] as const)(
		"beside a group brought in by %s, the refusal names only its own",
		(_, branch, bring) => {
			const dir = based(branch, { [TASKS]: OPEN, [OWN]: OPEN });
			land(dir, { [TASKS]: DONE });
			const marks = marked(dir);
			git(dir, ...bring);
			commit(dir, { [OWN]: DONE });
			const reason = decide(end(dir, SILENT), marks);
			expect(reason).toContain("openspec/changes/own/");
			expect(reason).not.toContain("openspec/changes/c/");
		},
	);

	test("a change archived on `origin/main` and complete at the tip is refused [8]", () => {
		const dir = based("feat", { [TASKS]: OPEN });
		rmSync(join(dir, TASKS));
		land(dir, { "openspec/changes/archive/2026-10-13-c/tasks.md": DONE });
		const marks = marked(dir);
		commit(dir, { [TASKS]: DONE });
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});

	test("a group another clone completed on `origin/feat`, fetched with `HEAD` at the mark, is refused [13]", () => {
		// The ceiling: nothing tells a collaborator's push from the turn's own.
		// The once-per-mark bound, which `turn-gate-turn.test.ts` pins, lets the
		// next end through.
		const dir = based("feat", { [TASKS]: OPEN });
		const marks = marked(dir);
		const other = store();
		const origin = git(dir, "remote", "get-url", "origin");
		git(other, "clone", "-q", "-b", "feat", origin, ".");
		commit(other, { [TASKS]: DONE });
		git(other, "push", "-q");
		git(dir, "fetch", "-q");
		expect(decide(end(dir, SILENT), marks)).toBeDefined();
	});
});
