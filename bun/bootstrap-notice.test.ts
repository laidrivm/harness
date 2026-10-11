/**
 * The `SessionStart` notice, run as Claude Code runs it: the command through
 * bash in a project directory. It must name an install that lags the pin,
 * even one too old to hold any harness script, and never fail the session.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOTICE } from "./bootstrap.ts";

const PIN = "eddf1fdd56642c48a3b222034ec6268c9b55971f";
const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A project pinned to `PIN`, with `files` under `node_modules/harness/`. */
function project(files?: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-notice-"));
	made.push(dir);
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify({ dependencies: { harness: `github:laidrivm/harness#${PIN}` } }),
	);
	if (files !== undefined) {
		const pkg = join(dir, "node_modules/harness");
		mkdirSync(join(pkg, "bun"), { recursive: true });
		for (const [path, text] of Object.entries(files))
			writeFileSync(join(pkg, path), text);
	}
	return dir;
}

function notice(dir: string, env: Record<string, string | undefined> = {}) {
	// By absolute path, so a case can empty PATH and still start the shell.
	const run = Bun.spawnSync(["/bin/bash", "-c", NOTICE], {
		cwd: dir,
		env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
	});
	return { code: run.exitCode, out: run.stdout.toString() };
}

const STALE = { ".bun-tag": "laidrivm-harness-9d321b6", "package.json": "{}" };

describe("the stale-install notice", () => {
	// spec: harness-updates/a-stale-install-is-named-at-session-start
	test("an install from another commit is named in one line with bun install", () => {
		const dir = project({
			".bun-tag": "laidrivm-harness-9d321b6",
			"package.json": "{}",
			"bun/command-guard.ts": "",
		});
		const { code, out } = notice(dir);
		expect(code).toBe(0);
		expect(out.trim().split("\n")).toHaveLength(1);
		expect(out).toContain("9d321b6");
		expect(out).toContain(PIN.slice(0, 7));
		expect(out).toContain("bun install");
	});

	// spec: harness-updates/an-install-older-than-the-notice-is-still-named
	test("an install holding no harness script at all is named the same way", () => {
		const dir = project({
			".bun-tag": "laidrivm-harness-1d26cf4",
			"package.json": "{}",
		});
		const { code, out } = notice(dir);
		expect(code).toBe(0);
		expect(out).toContain("1d26cf4");
		expect(out).toContain("bun install");
	});

	// spec: harness-updates/a-current-install-says-nothing
	test.each([
		["at the pinned commit", { ".bun-tag": "laidrivm-harness-eddf1fd" }],
		["with no tag", {}],
		["with a tag of another form", { ".bun-tag": "something else" }],
	])("an install %s prints nothing", (_, files) => {
		expect(notice(project(files))).toEqual({ code: 0, out: "" });
	});

	test("without CLAUDE_PROJECT_DIR it reads the project in the working directory", () => {
		const { out } = notice(project(STALE), { CLAUDE_PROJECT_DIR: undefined });
		expect(out).toContain("9d321b6");
	});

	test("an unreadable package.json prints nothing", () => {
		const dir = project(STALE);
		writeFileSync(join(dir, "package.json"), "{");
		expect(notice(dir)).toEqual({ code: 0, out: "" });
	});

	test("a bun that cannot start still exits 0", () => {
		expect(notice(project(STALE), { PATH: "/nonexistent" }).code).toBe(0);
	});

	test("no installed harness at all prints the not-installed line", () => {
		const { code, out } = notice(project());
		expect(code).toBe(0);
		expect(out).toContain("not installed");
	});
});
