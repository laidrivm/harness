import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, event, fabricate, run } from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses of `gh`: the subcommands that publish text
 * under the user's name, and `gh api` reaching the same endpoints by a method
 * that writes.
 */

afterAll(cleanup);

const anywhere = () => fabricate("feat/x");

describe("gh commands that publish on the user's behalf", () => {
	test("a pull request comment blocks", () => {
		const { code, reason } = run(
			event('gh pr comment 37 --body "fixed"'),
			anywhere(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("publishes text");
	});

	test("an issue comment blocks", () => {
		expect(run(event("gh issue comment 12 --body x"), anywhere()).code).toBe(2);
	});

	test("a review blocks", () => {
		expect(run(event("gh pr review 37 --approve"), anywhere()).code).toBe(2);
	});

	test("an absolute path to gh blocks", () => {
		// This is what the deny entry cannot see and the guard can.
		expect(
			run(event("/opt/homebrew/bin/gh pr comment 37 --body x"), anywhere())
				.code,
		).toBe(2);
	});

	test("a write behind a global flag blocks", () => {
		expect(
			run(event("gh --repo a/b pr comment 37 --body x"), anywhere()).code,
		).toBe(2);
	});

	test("opening a pull request does not block", () => {
		expect(run(event("gh pr create --title x --body y"), anywhere()).code).toBe(
			0,
		);
	});

	test("reading a pull request does not block", () => {
		expect(run(event("gh pr view 37 --json state"), anywhere()).code).toBe(0);
	});

	test("listing issues does not block", () => {
		expect(run(event("gh issue list"), anywhere()).code).toBe(0);
	});
});

describe("gh api, by the method it sends", () => {
	// spec: agent-permissions/a-comment-posted-through-the-endpoint
	test("a comment posted with -X POST blocks", () => {
		const { code } = run(
			event("gh api -X POST /repos/o/r/issues/37/comments -f body=hi"),
			anywhere(),
		);
		expect(code).toBe(2);
	});

	// spec: agent-permissions/reading-through-the-endpoint-still-works
	test("a read naming no method passes", () => {
		expect(
			run(
				event('gh api "repos/o/r/pulls/37/comments?per_page=100" --paginate'),
				anywhere(),
			).code,
		).toBe(0);
	});

	// spec: agent-permissions/a-read-that-carries-parameters
	test("an explicit GET passes whatever fields it carries", () => {
		expect(
			run(event("gh api -X GET /search/issues -f q=repo:o/r"), anywhere()).code,
		).toBe(0);
	});
});
