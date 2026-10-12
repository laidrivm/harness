import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

	test("a review behind a push in a compound command blocks", () => {
		const { code, reason } = run(
			event("git push && gh pr review 37 --approve"),
			anywhere(),
		);
		expect(code).toBe(2);
		// The push is allowed from a feature branch, so the review is what blocks.
		expect(reason).toContain("`gh pr review`");
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

	test.each([
		"gh pr --repo o/r comment 37 --body hi",
		"gh pr -R o/r review 37 --approve",
		"gh pr -Ro/r comment 37 --body hi",
	])("a repo flag between the subcommand's words blocks: %s", (line) => {
		expect(run(event(line), anywhere()).code).toBe(2);
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
	test("a comment posted with -X POST blocks, naming the flag", () => {
		const { code, reason } = run(
			event("gh api -X POST /repos/o/r/issues/37/comments -f body=hi"),
			anywhere(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("`gh api`");
		expect(reason).toContain("`-X POST`");
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

	// spec: agent-permissions/a-comment-posted-through-the-endpoint
	test.each([
		["--method POST", "gh api --method POST /repos/o/r/pulls/37/reviews"],
		["--method=post", "gh api --method=post /repos/o/r/pulls/37/reviews"],
		["-X=POST", "gh api -X=POST /repos/o/r/issues/37/comments"],
		["-XPOST", "gh api -XPOST /repos/o/r/issues/37/comments"],
		["-iX POST", "gh api -iX POST /repos/o/r/issues/37/comments"],
		["-X POST", "gh api /repos/o/r/issues/37/comments -X POST -f body=hi"],
		["-X PATCH", "gh api -X PATCH /repos/o/r/issues/comments/1 -f body=x"],
		["-X PUT", "gh api -X PUT /repos/o/r/pulls/37/merge"],
		["-X DELETE", "gh api -X DELETE /repos/o/r/issues/comments/1"],
		["-X DELETE", "gh api -X GET -X DELETE /repos/o/r/issues/comments/1"],
	])("%s blocks: %s", (flag, line) => {
		const { code, reason } = run(event(line), anywhere());
		expect(code).toBe(2);
		expect(reason).toContain(`\`${flag}\``);
	});

	test("a refusal records gh-api-write in the gate ledger", () => {
		const state = fabricate(undefined, "command-guard-state-");
		run(event("gh api -X POST /repos/o/r/issues/37/comments"), anywhere(), {
			...process.env,
			XDG_STATE_HOME: state,
		});
		const ledger = readFileSync(join(state, "harness", "gates.jsonl"), "utf8");
		expect(JSON.parse(ledger).rule).toBe("gh-api-write");
	});

	test("a method flag with no method after it blocks", () => {
		expect(run(event("gh api /repos/o/r -X"), anywhere()).code).toBe(2);
	});

	test("a write flag blocks even where a later GET is what gh sends", () => {
		const { code, reason } = run(
			event("gh api -X POST -X GET /repos/o/r/issues/37/comments"),
			anywhere(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("`-X POST`");
	});

	// spec: agent-permissions/a-read-that-carries-parameters
	test.each([
		"gh api -X get /search/issues -f q=repo:o/r",
		"gh api --method=HEAD /repos/o/r",
		"gh api /search/issues -f q=repo:o/r --method GET",
	])("%s passes", (line) => {
		expect(run(event(line), anywhere()).code).toBe(0);
	});
});
