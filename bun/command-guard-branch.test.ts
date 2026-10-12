import { afterAll, describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { join } from "node:path";
import { branchState, FETCH_MAX_AGE } from "./branch-state.ts";
import {
	cleanup,
	event,
	fabricate,
	git,
	run,
	upstream,
} from "./command-guard.fixture.ts";

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

describe("which branches the check reaches", () => {
	// spec: agent-permissions/the-branch-was-never-pushed
	test("an unpushed branch is never refused for freshness", () => {
		const dir = upstream({ own: true, pushed: false, fetchedAgo: 60 * MINUTE });
		expect(state(dir)).toBe("ok");
	});

	test("an unpushed branch still meets the merged verdict", () => {
		expect(state(upstream({ merged: true, pushed: false }))).toBe("merged");
	});

	test("a branch name carrying slashes resolves its full remote ref", () => {
		// Stale on purpose: only a branch read as pushed is refused for it, so a
		// name cut at a slash would be read as never pushed and allowed.
		const branch = "feat/deep/x";
		const dir = upstream({ branch, fetchedAgo: 60 * MINUTE });
		expect(state(dir, branch)).toBe("stale");
	});

	// spec: agent-permissions/the-repository-has-no-base-ref
	test.each([
		["no origin remote", () => fabricate("feat/x")],
		[
			"an origin with no main on it",
			() => {
				const dir = fabricate("feat/x");
				git(dir, "remote", "add", "origin", fabricate());
				return dir;
			},
		],
	])("a repository with %s is allowed", (_, arrange) => {
		expect(state(arrange())).toBe("ok");
	});
});

describe("how recently origin/main was fetched", () => {
	/** When the fixture's fetch wrote `FETCH_HEAD`, read back from the file. */
	const fetchedAt = (dir: string) =>
		statSync(join(dir, ".git", "FETCH_HEAD")).mtimeMs;

	// spec: agent-permissions/the-base-ref-is-stale
	test("a fetch exactly FETCH_MAX_AGE old is accepted", () => {
		const dir = upstream();
		expect(state(dir, "feat/x", fetchedAt(dir) + FETCH_MAX_AGE)).toBe("ok");
	});

	// spec: agent-permissions/the-base-ref-is-stale
	test("a fetch older than FETCH_MAX_AGE is refused", () => {
		const dir = upstream();
		expect(state(dir, "feat/x", fetchedAt(dir) + FETCH_MAX_AGE + 1)).toBe(
			"stale",
		);
	});

	test("a fetch time far in the future is refused, not read as a recent one", () => {
		// A negative age would sit under any bound for as long as the clock
		// stayed behind the file.
		const dir = upstream();
		expect(state(dir, "feat/x", fetchedAt(dir) - FETCH_MAX_AGE - 1)).toBe(
			"stale",
		);
	});

	// spec: agent-permissions/the-fetch-time-cannot-be-read
	test("a repository with no FETCH_HEAD is unknown", () => {
		expect(state(upstream({ fetchHead: null }))).toBe("unknown");
	});
});

describe("what the review rounds' probes measured", () => {
	// spec: agent-permissions/a-fetch-that-brings-nothing-new
	test("a fetch bringing no new commit refreshes the bound", () => {
		// It updates no ref, so a reading taken from the reflog stays stale.
		const dir = upstream({ fetchedAgo: 60 * MINUTE });
		git(dir, "fetch", "origin");
		expect(state(dir)).toBe("ok");
	});

	// spec: agent-permissions/a-fetch-of-an-unrelated-ref
	test("a fetch naming only another ref does not refresh it", () => {
		// It moves FETCH_HEAD's mtime all the same; only its contents tell.
		const dir = upstream({ fetchedAgo: 60 * MINUTE });
		git(dir, "fetch", "origin", "feat/x");
		expect(state(dir)).toBe("stale");
	});

	// spec: agent-permissions/the-remote-branch-was-deleted-and-pruned
	test("a merged branch deleted on the remote and pruned is still merged", () => {
		const dir = upstream({ merged: true });
		git(dir, "push", "origin", "--delete", "feat/x");
		git(dir, "fetch", "--prune", "origin");
		expect(state(dir)).toBe("merged");
	});
});

describe("the guard's refusal", () => {
	const commit = event("git commit -m fix");

	// spec: agent-permissions/a-commit-on-a-branch-whose-pull-request-merged
	test("a commit on a merged branch exits exactly 2", () => {
		expect(run(commit, upstream({ merged: true })).code).toBe(2);
	});

	test("the merged reason names moving the work, not fetching", () => {
		const { reason } = run(commit, upstream({ merged: true }));
		expect(reason).toContain("already merged");
		expect(reason).toContain("Move the work");
		expect(reason).not.toContain("git fetch");
	});

	// spec: agent-permissions/the-base-ref-is-stale
	test("the stale reason names fetching, not moving the work", () => {
		const { code, reason } = run(
			commit,
			upstream({ fetchedAgo: 60 * MINUTE }),
		);
		expect(code).toBe(2);
		expect(reason).toContain("git fetch origin");
		expect(reason).not.toContain("Move the work");
	});

	test("a commit on a pushed branch with work of its own is allowed", () => {
		expect(run(commit, upstream({ own: true })).code).toBe(0);
	});

	// Both directions, so neither the target nor the start alone passes both.
	test.each([
		["a merged target from a clean start blocks", true, 2],
		["a clean target from a merged start is allowed", false, 0],
	])("git -C: %s", (_, targetMerged, expected) => {
		const target = upstream({ merged: targetMerged, own: !targetMerged });
		const start = upstream({ merged: !targetMerged, own: targetMerged });
		const command = event(`git -C ${target} commit -m fix`);
		expect(run(command, start).code).toBe(expected);
	});

	test("a detached HEAD meets the branch-read refusal first", () => {
		const dir = upstream({ merged: true });
		git(dir, "checkout", "--detach");
		const { code, reason } = run(commit, dir);
		expect(code).toBe(2);
		expect(reason).toContain("current branch");
	});
});
