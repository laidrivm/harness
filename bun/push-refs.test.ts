import { describe, expect, test } from "bun:test";
import { pushRefs } from "./push-refs.ts";

/**
 * The pre-push hook's ref-update records, read once for the draft check and
 * the gates' skip: `<local ref> <local sha> <remote ref> <remote sha>` a line.
 */

const SHA = "a".repeat(40);
const ZERO = "0".repeat(40);
const OLD = "b".repeat(40);

describe("pushRefs()", () => {
	// spec: commit-gates/a-head-the-runner-passed
	test("a record yields its local sha and remote ref", () => {
		expect(pushRefs(`refs/heads/x ${SHA} refs/heads/y ${OLD}\n`)).toEqual([
			{ sha: SHA, ref: "refs/heads/y", deletion: false },
		]);
	});

	// spec: commit-gates/a-push-that-only-deletes
	test("an all-zero local sha is a deletion, its remote ref kept", () => {
		expect(pushRefs(`(delete) ${ZERO} refs/tags/v1 ${OLD}\n`)).toEqual([
			{ sha: ZERO, ref: "refs/tags/v1", deletion: true },
		]);
	});

	// spec: commit-gates/a-push-with-nothing-to-update
	test.each([
		["empty input", ""],
		["one blank line", "\n"],
	])("%s yields none", (_, input) => {
		expect(pushRefs(input)).toEqual([]);
	});
});
