/**
 * The consumer check that refuses a configured test retry
 * (flaky-test-findings D10): in a tracked `bunfig.toml`, on a test or describe
 * call, and in a command the tree holds. Numbers are the proposal's /zombies
 * items. Fixture sources are plain strings, which the check's own scan blanks,
 * so this file holds nothing it would report.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { testRetry } from "./test-retry.ts";

const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repository holding `tracked`, plus `untracked` left unadded. */
function repo(tracked: Record<string, string>, untracked: Record<string, string> = {}): string {
	const dir = mkdtempSync(join(tmpdir(), "test-retry-"));
	made.push(dir);
	const write = (files: Record<string, string>) => {
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(dirname(join(dir, path)), { recursive: true });
			writeFileSync(join(dir, path), text);
		}
	};
	const git = (...args: string[]) => {
		const run = Bun.spawnSync(["git", ...args], { cwd: dir });
		if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	};
	git("init", "-q", "-b", "main");
	write(tracked);
	git("add", "-A");
	write(untracked);
	return dir;
}

const found = (tracked: Record<string, string>, untracked?: Record<string, string>) =>
	testRetry(repo(tracked, untracked));

const IMPORT = 'import { describe, test } from "bun:test";\n';

describe("bunfig.toml", () => {
	// spec: flaky-tests/a-retry-in-bunfig
	test("a root bunfig with [test] retry fails, naming the file [59]", () => {
		expect(found({ "bunfig.toml": "[test]\nretry = 2\n" }).join("\n")).toContain("bunfig.toml");
	});

	// spec: flaky-tests/a-retry-in-bunfig
	test("a nested tracked bunfig fails [60]", () => {
		const problems = found({ "email-service/bunfig.toml": "[test]\nretry = 2\n" });
		expect(problems.join("\n")).toContain("email-service/bunfig.toml");
	});

	test.each([
		["an untracked bunfig [61]", {}, { "bunfig.toml": "[test]\nretry = 2\n" }],
		["rerunEach [62]", { "bunfig.toml": "[test]\nrerunEach = 3\n" }, {}],
		["retry under another table (plan review)", { "bunfig.toml": "[install]\nretry = 2\n" }, {}],
	])("%s reports nothing", (_, tracked, untracked) => {
		expect(found(tracked, untracked)).toEqual([]);
	});

	test("an unparseable tracked bunfig throws, naming the file [64]", () => {
		const dir = repo({ "bunfig.toml": "[test\nretry = \n" });
		expect(() => testRetry(dir)).toThrow("bunfig.toml");
	});
});

describe("a retry on a test", () => {
	// spec: flaky-tests/a-retry-on-a-test
	test.each([
		["{ retry: 2 } with a bun:test import [65]", 'test("x", () => {}, { retry: 2 });'],
		["the shorthand { retry } [66]", "const retry = 2;\ntest(\"x\", () => {}, { retry });"],
		["test.each(rows)(…) [80]", 'test.each([[1]])("x", () => {}, { retry: 1 });'],
		["test.if(cond)(…) (plan review)", 'test.if(true)("x", () => {}, { retry: 1 });'],
		["test.concurrent.failing(…) (plan review)", 'test.concurrent.failing("x", () => {}, { retry: 1 });'],
		["describe with an options object [81]", 'describe("x", { retry: 1 }, () => {});'],
	])("%s fails, naming the file and the line", (_, body) => {
		const problems = found({ "src/a.ts": `${IMPORT}${body}\n` });
		expect(problems).toHaveLength(1);
		expect(problems[0]).toStartWith(`src/a.ts:${body.split("\n").length + 1}:`);
	});

	// spec: flaky-tests/a-retry-on-a-global-test-call
	test("a global test call in widget.test.ts with no import fails [88]", () => {
		const problems = found({ "widget.test.ts": 'test("x", () => {}, { retry: 2 });\n' });
		expect(problems).toEqual([expect.stringMatching(/^widget\.test\.ts:1: /)]);
	});

	test.each(["a.tsx", "a.js", "a.mjs"])("%s is read as a .ts source is [72]", (path) => {
		expect(found({ [path]: `${IMPORT}test("x", () => {}, { retry: 2 });\n` })).toHaveLength(1);
	});
});

describe("a retry key the check passes over", () => {
	// spec: flaky-tests/the-word-in-a-string-or-a-comment
	test("retry: only in a string, a template or a comment reports nothing [67]", () => {
		const body = 'test("x { retry: 2 }", () => {});\n// test("y", f, { retry: 2 })\nconst s = `{ retry: 1 }`;\n';
		expect(found({ "a.test.ts": `${IMPORT}${body}` })).toEqual([]);
	});

	// spec: flaky-tests/a-retry-key-outside-test-code
	test("retry: true in a source neither importing bun:test nor named as a test reports nothing [68]", () => {
		expect(found({ "src/http.ts": "test(url, { retry: true });\n" })).toEqual([]);
	});

	test("a file naming bun:test only in a comment is not scoped [69]", () => {
		expect(found({ "src/b.ts": '// from "bun:test"\ntest("x", f, { retry: 2 });\n' })).toEqual([]);
	});

	test("a retryCount: key reports nothing [70]", () => {
		expect(found({ "a.test.ts": `${IMPORT}test("x", f, { retryCount: 2 });\n` })).toEqual([]);
	});

	// spec: flaky-tests/a-retry-key-in-a-test-s-fixture
	test("a policy object handed to the code under test reports nothing [79]", () => {
		const body = 'const policy = { retry: 3 };\ntest("x", () => { expect(run({ retry: 3 })).toBe(1); });\n';
		expect(found({ "a.test.ts": `${IMPORT}${body}` })).toEqual([]);
	});
});

describe("a retry in a command the tree holds", () => {
	// spec: flaky-tests/a-retry-inside-a-script-the-agent-runs
	test("a package.json script fails, naming the file and the script [82]", () => {
		const pkg = JSON.stringify({ scripts: { test: "bun test --retry=2" } });
		expect(found({ "package.json": pkg }).join("\n")).toMatch(/package\.json.*test/);
	});

	// spec: flaky-tests/a-retry-in-a-workflow-or-a-hook
	test.each([
		["a simple-git-hooks value [83]", "package.json", JSON.stringify({ "simple-git-hooks": { "pre-push": "bun test --retry=1" } })],
		["a workflow run: [84]", ".github/workflows/ci.yml", "jobs:\n  t:\n    steps:\n      - run: bun test --retry=1\n"],
		["the second line of a run: | block (plan review)", ".github/workflows/ci.yml", "jobs:\n  t:\n    steps:\n      - run: |\n          bun install\n          bun test --retry=1\n"],
		["a .githooks/pre-push line [85]", ".githooks/pre-push", "#!/bin/sh\nbun test --retry=1\n"],
		["a script's sh -c program (CodeRabbit on #199)", "package.json", JSON.stringify({ scripts: { test: "sh -c 'bun test --retry=1'" } })],
		["a hook's eval (CodeRabbit on #199)", ".githooks/pre-push", "#!/bin/sh\neval bun test --retry=1\n"],
	])("%s fails", (_, path, text) => {
		expect(found({ [path]: text }).join("\n")).toContain(path);
	});

	test.each([
		["package.json", "{"],
		[".github/workflows/ci.yml", "jobs: [\n"],
	])("a malformed %s throws naming it (CodeRabbit on #199)", (path, text) => {
		const dir = repo({ [path]: text });
		expect(() => testRetry(dir)).toThrow(path);
	});

	test("a package.json holding null reports nothing (CodeRabbit on #199)", () => {
		expect(found({ "package.json": "null" })).toEqual([]);
	});

	// spec: flaky-tests/running-each-test-many-times-in-a-script
	test.each([
		["a .githooks/pre-push comment (plan review)", ".githooks/pre-push", "#!/bin/sh\n# bun test --retry=1\nbun test\n"],
		["a script with --rerun-each [86]", "package.json", JSON.stringify({ scripts: { flake: "bun test --rerun-each=5" } })],
	])("%s reports nothing", (_, path, text) => {
		expect(found({ [path]: text })).toEqual([]);
	});
});
