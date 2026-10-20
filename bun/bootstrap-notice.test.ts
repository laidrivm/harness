/**
 * The `SessionStart` notice, run as Claude Code runs it: the command through
 * bash in a project directory. It must name an install that lags the pin,
 * even one too old to hold any harness script, and never fail the session.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

/** The installed commit of `STALE`, as a full pin. */
const INSTALLED = "9d321b6a0c4e8f1b2d3c4b5a6e7f8091a2b3c4d5";

/** A stale install whose project's `package.json` is `manifest`. */
function pinned(manifest: object): string {
	const dir = project(STALE);
	writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
	return dir;
}

describe("the stale-install notice on a development-dependency pin", () => {
	// spec: harness-updates/the-notice-reads-a-development-dependency-pin
	test("a pin held only as a development dependency is named", () => {
		const { code, out } = notice(
			pinned({ devDependencies: { harness: `github:laidrivm/harness#${PIN}` } }),
		);
		expect(code).toBe(0);
		expect(out).toContain("9d321b6");
		expect(out).toContain(PIN.slice(0, 7));
	});

	// spec: harness-updates/a-runtime-pin-is-preferred
	test("a runtime pin is compared even where the development pin matches the install", () => {
		const { out } = notice(
			pinned({
				dependencies: { harness: `github:laidrivm/harness#${PIN}` },
				devDependencies: { harness: `github:laidrivm/harness#${INSTALLED}` },
			}),
		);
		expect(out).toContain(PIN.slice(0, 7));
	});

	test("a development pin at no full commit prints nothing", () => {
		const dir = pinned({ devDependencies: { harness: "github:laidrivm/harness#main" } });
		expect(notice(dir)).toEqual({ code: 0, out: "" });
	});
});

/**
 * A `bun` ahead on `PATH` that logs an `install` call with its directory and
 * answers it with `STUB_OUT` (escapes read by `printf %b`) and `STUB_CODE`,
 * and hands anything else, the notice's `-e`, to the real bun.
 */
function stub(): { path: string; log: string } {
	const dir = mkdtempSync(join(tmpdir(), "harness-bun-stub-"));
	made.push(dir);
	const log = join(dir, "install.log");
	const script = [
		"#!/bin/sh",
		'if [ "$1" = install ]; then',
		'printf "%s|%s\\n" "$*" "$PWD" >> "$STUB_LOG"',
		'[ -n "$STUB_OUT" ] && printf "%b\\n" "$STUB_OUT"',
		'exit "${STUB_CODE:-0}"',
		"fi",
		`exec "${process.execPath}" "$@"`,
	].join("\n");
	writeFileSync(join(dir, "bun"), script, { mode: 0o755 });
	return { path: `${dir}:${process.env.PATH}`, log };
}

const CURRENT = { ".bun-tag": "laidrivm-harness-eddf1fd" };

function cloud(dir: string, env: Record<string, string | undefined> = {}) {
	const bun = stub();
	const run = notice(dir, { PATH: bun.path, STUB_LOG: bun.log, CLAUDE_CODE_REMOTE: "true", ...env });
	const calls = existsSync(bun.log) ? readFileSync(bun.log, "utf8").trim().split("\n") : [];
	return { ...run, calls };
}

describe("the cloud install before the notice", () => {
	// spec: cloud-sessions/a-local-session
	test.each([[undefined], [""], ["TRUE"], ["1"], ["true "], ["false"]])(
		"CLAUDE_CODE_REMOTE=%p installs nothing [27, 28, 30]",
		(value) => {
			expect(cloud(project(CURRENT), { CLAUDE_CODE_REMOTE: value })).toEqual({ code: 0, out: "", calls: [] });
		},
	);

	// spec: cloud-sessions/a-cloud-session-starts-on-a-fresh-clone
	// spec: cloud-sessions/no-package-code-runs-unprompted
	// spec: cloud-sessions/the-notice-never-races-the-install
	test("true installs from the lockfile in the project, with no scripts, and prints nothing [29]", () => {
		const dir = project(CURRENT);
		expect(cloud(dir)).toEqual({ code: 0, out: "", calls: [`install --frozen-lockfile --ignore-scripts|${dir}`] });
	});

	test("with no CLAUDE_PROJECT_DIR it installs in the working directory [31]", () => {
		// The spawn's working directory reaches the shell resolved (`/private/var` on macOS).
		const dir = realpathSync(project(CURRENT));
		expect(cloud(dir, { CLAUDE_PROJECT_DIR: undefined }).calls).toEqual([
			`install --frozen-lockfile --ignore-scripts|${dir}`,
		]);
	});

	test("a project directory holding a space is installed whole [32]", () => {
		const dir = join(project(), "with space");
		mkdirSync(join(dir, "node_modules/harness"), { recursive: true });
		writeFileSync(join(dir, "package.json"), "{}");
		expect(cloud(dir).calls).toEqual([`install --frozen-lockfile --ignore-scripts|${dir}`]);
	});

	// spec: cloud-sessions/the-install-fails
	test("a failed install prints one line with bun's last line, then the not-installed line, and exits 0 [33, 35]", () => {
		const { code, out } = cloud(project(), { STUB_OUT: "resolving\\nerror: GET tarball - 403", STUB_CODE: "1" });
		expect(code).toBe(0);
		const lines = out.trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("install failed");
		expect(lines[0]).toEndWith(": error: GET tarball - 403");
		expect(lines[1]).toContain("not installed");
	});

	test("a failed install that printed nothing names no empty quote [34]", () => {
		const first = cloud(project(), { STUB_CODE: "1" }).out.split("\n")[0] ?? "";
		expect(first).toContain("install failed");
		expect(first).not.toContain(":");
	});

	test("no bun on PATH still exits 0 [36]", () => {
		expect(notice(project(), { CLAUDE_CODE_REMOTE: "true", PATH: "/nonexistent" }).code).toBe(0);
	});

	// spec: cloud-sessions/a-lockfile-that-disagrees-with-the-manifest
	test("with the real bun, a lockfile behind the manifest changes neither file [37]", () => {
		const dir = project();
		for (const name of ["dep", "dep2"]) {
			mkdirSync(join(dir, name));
			writeFileSync(join(dir, name, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
		}
		writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { dep: "file:./dep" } }));
		expect(Bun.spawnSync(["bun", "install"], { cwd: dir }).exitCode).toBe(0);
		rmSync(join(dir, "node_modules"), { recursive: true, force: true });
		writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { dep: "file:./dep", dep2: "file:./dep2" } }));
		const before = [readFileSync(join(dir, "package.json"), "utf8"), readFileSync(join(dir, "bun.lock"), "utf8")];
		const { code, out } = notice(dir, { CLAUDE_CODE_REMOTE: "true" });
		expect(code).toBe(0);
		expect(out).toContain("install failed");
		expect([readFileSync(join(dir, "package.json"), "utf8"), readFileSync(join(dir, "bun.lock"), "utf8")]).toEqual(before);
	});
});
