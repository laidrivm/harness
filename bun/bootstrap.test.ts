/**
 * The bootstrap hook run as Claude Code runs it: the command through a shell,
 * the tool call as JSON on stdin, in a project with no harness installed and
 * then with one.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOOTSTRAP } from "./bootstrap.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A project directory, with a stand-in guard installed when `guard` is set. */
function project(guard?: string): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-bootstrap-"));
	made.push(dir);
	if (guard !== undefined) {
		mkdirSync(join(dir, "node_modules/harness/bun"), { recursive: true });
		writeFileSync(
			join(dir, "node_modules/harness/bun/command-guard.ts"),
			guard,
		);
	}
	return dir;
}

/** The hook's verdict on `command` in `dir`. */
function hook(dir: string, command: string) {
	const run = Bun.spawnSync(["sh", "-c", BOOTSTRAP], {
		cwd: dir,
		env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
		stdin: new TextEncoder().encode(
			JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
		),
	});
	return { code: run.exitCode, stderr: run.stderr.toString() };
}

describe("before the install", () => {
	test.each(["bun install", "bun i", "bun install --frozen-lockfile"])(
		"%s runs",
		(command) => {
			expect(hook(project(), command).code).toBe(0);
		},
	);

	test.each([
		["any other command", "git status"],
		["an install that names a package", "bun install lodash"],
		["an install with another flag", "bun install --registry https://x.test"],
		["an install from another directory", "bun install --cwd ../other"],
		["an install with a command chained after it", "bun install && git status"],
		["an install with a command chained before it", "git status; bun install"],
	])("%s is blocked, naming bun install", (_, command) => {
		const { code, stderr } = hook(project(), command);
		expect(code).toBe(2);
		expect(stderr).toContain("bun install");
	});
});

describe("after the install", () => {
	test("the guard decides, and a command it allows runs", () => {
		const dir = project("process.exit(0);\n");
		expect(hook(dir, "git status").code).toBe(0);
	});

	test("a command the guard blocks stays blocked", () => {
		const dir = project("console.error('guarded'); process.exit(2);\n");
		const { code, stderr } = hook(dir, "bun install");
		expect(code).toBe(2);
		expect(stderr).toContain("guarded");
	});

	test("a guard that fails to run blocks rather than letting through", () => {
		// Exit 1 is non-blocking to Claude Code; the hook turns it into 2.
		const dir = project("throw new Error('broken');\n");
		expect(hook(dir, "git status").code).toBe(2);
	});
});
