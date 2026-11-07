import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fabricate, git, verdict } from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses of a `bun run deps` given words after the
 * script's name, which bun forwards to the install, and of a typed frozen
 * install, which it sends to `bun run deps`. That the bare call passes is
 * `command-guard-interpreters.test.ts`'s. Every line here is a string the
 * guard reads; none of them is ever run.
 */

afterAll(cleanup);

describe("words after the deps script's name", () => {
	// spec: agent-permissions/words-after-the-script-s-name
	//   agent-permissions/words-before-bun
	test.each([
		"bun run deps --no-verify",
		"bun run deps --production",
		"bun run deps lodash",
		"bun run deps > package.json",
		"bun 2>/dev/null run deps --no-verify",
		"bun run --silent deps --no-verify",
		"env A=1 bun run deps --no-verify",
		"echo --no-verify | xargs bun run deps",
		"BUN_OPTIONS=--no-verify bun run deps",
		"bun run deps $(printf -- --no-verify)",
		"bun run $(printf deps) --no-verify",
	])("%s blocks, naming the bare call", (line) => {
		const { code, rule, reason } = verdict(line);
		expect({ code, rule }).toEqual({ code: 2, rule: "deps-args" });
		expect(reason).toContain("`bun run deps` with nothing before or after it");
	});

	test("a substitution in another script's words names the substitution, not deps", () => {
		expect(verdict('bun run test > "out-$(date +%s).log"').reason).toContain("a substitution feeds this `bun run`");
	});

	test.each(["bun run deps", "bun run test --watch", "bun run test deps", "bun deps-report --x"])(
		"%s is not refused as deps-args",
		(line) => expect(verdict(line).rule).not.toBe("deps-args"),
	);
});

describe("a typed frozen install", () => {
	// spec: agent-permissions/a-typed-frozen-install-is-refused
	//   agent-permissions/a-frozen-install-within-a-compound-line
	test.each([
		"bun install --frozen-lockfile",
		"bun i --frozen-lockfile",
		"bun install --frozen-lockfile --ignore-scripts",
		"bun install --frozen-lockfile 2>&1",
		"bun --cwd sub install --frozen-lockfile",
		"cd sub && bun install --frozen-lockfile",
		"bun install --frozen-lockfile | tail -5",
		'bash -c "bun i --frozen-lockfile"',
		"eval bun install --frozen-lockfile",
	])("%s blocks, naming bun run deps", (line) => {
		const { code, rule, reason } = verdict(line);
		expect({ code, rule }).toEqual({ code: 2, rule: "frozen-install" });
		expect(reason).toContain("`bun run deps`");
		expect(reason).toContain("plain `bun install`");
		expect(reason).toContain("other flags");
	});

	// spec: agent-permissions/a-literal-install-still-prompts
	//   agent-permissions/the-flag-only-as-text
	test.each([
		"bun install",
		"bun i",
		"bun install lodash",
		"echo bun install --frozen-lockfile",
		'git commit -m "bun install --frozen-lockfile"',
		"bun run install --frozen-lockfile",
		"bun add --frozen-lockfile x",
	])("%s is not refused as frozen-install", (line) => expect(verdict(line).rule).not.toBe("frozen-install"));

	// spec: agent-permissions/a-frozen-install-inside-a-committed-script
	// `shell` and `evaled` pin the flag through a script's `-c` and `eval`; the
	// typed install after a script read pins that the flag is per line.
	test("a committed script's frozen install passes, and a typed one beside it does not", () => {
		const dir = fabricate("feat/x");
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({
				scripts: {
					deps: "bun install --frozen-lockfile",
					setup: "bun install --frozen-lockfile && bun run build",
					build: "true",
					shell: "bash -c 'bun install --frozen-lockfile'",
					evaled: "eval bun install --frozen-lockfile",
				},
			}),
		);
		git(dir, "add", "package.json");
		git(dir, "commit", "-m", "scripts");
		for (const name of ["deps", "setup", "shell", "evaled"])
			expect(verdict(`bun run ${name}`, dir)).toEqual({ code: 0, reason: "" });
		expect(verdict("bun run deps && bun install --frozen-lockfile", dir).rule).toBe("frozen-install");
	});
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
