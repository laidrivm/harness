import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cleanup, event, fabricate, run } from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses of a `gh api` call that names no method: a
 * parameter that switches it to `POST`, and a `graphql` document that is not
 * an inline read. A call naming its method is `command-guard-gh.test.ts`'s.
 */

afterAll(cleanup);

const anywhere = () => fabricate("feat/x");

/** The `gh api graphql` line of the `coderabbit` skill, as its file holds it. */
const threadRead = () =>
	readFileSync(
		`${import.meta.dir}/../core/skills/coderabbit/SKILL.md`,
		"utf8",
	)
		.split("\n")
		.find((line) => line.startsWith("gh api graphql")) ?? "";

describe("gh api with a parameter and no method", () => {
	// spec: agent-permissions/a-write-with-no-method-flag
	test("a comment posted by a field alone blocks, naming the field", () => {
		const { code, reason } = run(
			event("gh api /repos/o/r/issues/37/comments -f body=hi"),
			anywhere(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("`-f body=hi`");
	});

	// spec: agent-permissions/a-write-with-no-method-flag
	test.each([
		"--field body=hi",
		"--raw-field=body=hi",
		"-F body=hi",
		"-iF body=hi",
		"--input body.json",
	])("%s blocks", (flags) => {
		const { code, reason } = run(
			event(`gh api /repos/o/r/issues/37/comments ${flags}`),
			anywhere(),
		);
		expect(code).toBe(2);
		expect(reason).toContain(`\`${flags}\``);
	});

	test("a flag the read list does not name blocks", () => {
		// Scoped by the reads it exempts: a flag gh adds later is a write until
		// someone shows it reads.
		const { code, reason } = run(
			event("gh api /repos/o/r/issues --some-future-flag"),
			anywhere(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("`--some-future-flag`");
	});
});

describe("gh api with no flags at all", () => {
	test("a bare path reads, by the default GET", () => {
		expect(run(event("gh api /repos/o/r"), anywhere()).code).toBe(0);
	});
});

describe("the reach the gh branch inherits", () => {
	const write = "gh api /repos/o/r/issues/37/comments -f body=hi";

	// spec: agent-permissions/a-write-with-no-method-flag
	test.each([
		["an absolute path to gh", `/opt/homebrew/bin/${write}`],
		["a bash -c wrapper", `bash -c "${write}"`],
		["the second half of a compound command", `gh pr view 37 && ${write}`],
		[
			"a flag in front of the operand",
			"gh api --hostname github.com /repos/o/r/issues/37/comments -f body=hi",
		],
	])("%s blocks", (_, line) => {
		expect(run(event(line), anywhere()).code).toBe(2);
	});
});

describe("gh api graphql", () => {
	// spec: agent-permissions/a-graphql-call
	test.each([
		"gh api graphql -f query='mutation{addComment(input:{}){clientMutationId}}'",
		"gh api graphql -F query=@q.graphql",
		"gh api graphql -f query='query{viewer{login}} mutation{x}'",
		"gh api graphql -f query='query{viewer{login}}' --input doc.json",
		"gh api graphql -X GET -f query='mutation{x}'",
		"gh api graphql --paginate",
		"gh api graphql -f query='query{viewer{login}}' -f query='mutation{x}'",
	])("%s blocks", (line) => {
		const { code, reason } = run(event(line), anywhere());
		expect(code).toBe(2);
		expect(reason).toContain("`gh api graphql`");
	});

	// spec: agent-permissions/a-graphql-read
	test("an inline query with no mutation in it passes", () => {
		expect(
			run(event("gh api graphql -f query='query{viewer{login}}'"), anywhere())
				.code,
		).toBe(0);
	});

	// spec: agent-permissions/a-graphql-read
	test("the coderabbit skill's review-thread read passes", () => {
		const line = threadRead();
		expect(line).toContain("query=");
		expect(run(event(line), anywhere()).code).toBe(0);
	});
});
