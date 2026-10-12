import { afterAll, describe, expect, test } from "bun:test";
import { branchState } from "./branch-state.ts";
import { cleanup, git, upstream } from "./command-guard.fixture.ts";

/**
 * What the guard refuses by the state of the branch a commit lands on: one
 * whose pull request has merged, and a pushed one whose merge state a stale
 * `origin/main` cannot decide. `branch-state.ts` is called directly where a
 * case rests on the clock, and the guard is spawned where it rests on the
 * refusal. What a commit on main meets is `command-guard.test.ts`'s.
 */

afterAll(cleanup);

const MINUTE = 60_000;

/** What `branch-state.ts` answers for `dir`'s branch. */
const state = (dir: string, branch = "feat/x", now?: number) =>
	branchState(dir, branch, now);

describe("the marks git cherry prints", () => {
	// spec: agent-permissions/the-first-commit-of-a-new-branch
	test("a branch with no commits of its own, so no marks, is allowed", () => {
		expect(state(upstream())).toBe("ok");
	});

	// spec: agent-permissions/a-commit-on-a-branch-whose-pull-request-merged
	test("one commit already upstream is merged", () => {
		expect(state(upstream({ merged: true }))).toBe("merged");
	});

	// spec: agent-permissions/a-stranded-commit-already-exists
	test("a commit upstream beside one that is not is still merged", () => {
		expect(state(upstream({ merged: true, own: true }))).toBe("merged");
	});

	// spec: agent-permissions/a-pushed-branch-with-work-of-its-own
	test("commits none of which is upstream are allowed", () => {
		expect(state(upstream({ own: true }))).toBe("ok");
	});

	// spec: agent-permissions/a-branch-closed-by-a-merge-commit
	test("a branch closed by a merge commit leaves no mark and is allowed", () => {
		const dir = upstream({ own: true });
		git(dir, "switch", "main");
		git(dir, "merge", "--no-ff", "-m", "merge", "feat/x");
		git(dir, "push", "origin", "main");
		git(dir, "switch", "feat/x");
		expect(state(dir)).toBe("ok");
	});
});
