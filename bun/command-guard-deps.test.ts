import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fabricate, git, verdict } from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses of a `bun run deps` given words after the
 * script's name, which bun forwards to the install. That the bare call passes
 * is `command-guard-interpreters.test.ts`'s. Every line here is a string the
 * guard reads; none of them is ever run.
 */

afterAll(cleanup);

describe("words after the deps script's name", () => {
	// spec: agent-permissions/words-after-the-script-s-name
	test.each([
		"bun run deps --no-verify",
		"bun run deps --production",
		"bun run deps lodash",
		"bun run deps > package.json",
		"bun 2>/dev/null run deps --no-verify",
		"env A=1 bun run deps --no-verify",
		"bun run deps $(printf -- --no-verify)",
		"bun run $(printf deps) --no-verify",
	])("%s blocks, naming the bare call", (line) => {
		const { code, rule, reason } = verdict(line);
		expect({ code, rule }).toEqual({ code: 2, rule: "deps-args" });
		expect(reason).toContain("`bun run deps` with nothing after it");
	});

	test.each(["bun run deps", "bun run test --watch", "bun deps-report --x"])("%s is not refused as deps-args", (line) =>
		expect(verdict(line).rule).not.toBe("deps-args"),
	);
});

// Both pass on the guard before `deps-args`; they pin it, so a later check
// that refuses the script's text is seen.
describe("the script read from package.json", () => {
	// spec: agent-permissions/the-script-runs-without-a-prompt
	//   agent-permissions/a-script-the-tree-does-not-vouch-for
	test("passes from a committed package.json, and is refused once it is edited", () => {
		const dir = fabricate("feat/x");
		writeFileSync(join(dir, "package.json"), '{ "scripts": { "deps": "bun install --frozen-lockfile" } }');
		git(dir, "add", "package.json");
		git(dir, "commit", "-m", "deps");
		expect(verdict("bun run deps", dir)).toEqual({ code: 0, reason: "" });
		writeFileSync(join(dir, "package.json"), '{ "scripts": { "deps": "bun install" } }');
		expect(verdict("bun run deps", dir)).toMatchObject({ code: 2, rule: "untracked-script" });
	});
});
