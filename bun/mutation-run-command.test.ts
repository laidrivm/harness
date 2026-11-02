/**
 * `bun/mutation-run.ts` as the gates run it, in a throwaway repository, with
 * `node` and Stryker's `bunx` stubbed on a `PATH` of their own. Apart from
 * `mutation-run.test.ts`, which covers the plan, to keep both under the cap.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unsaved } from "./mutation-run.ts";

const script = `${import.meta.dir}/mutation-run.ts`;
const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
const scratch = () => {
	const dir = mkdtempSync(join(tmpdir(), "mutation-run-"));
	made.push(dir);
	return dir;
};

const write = (dir: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
};

const git = (dir: string, ...args: string[]) => {
	const config = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
	const run = Bun.spawnSync(["git", ...config, ...args], { cwd: dir });
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
};

/** A committed repository holding `files` and one module with a test. */
function repository(files: Record<string, string> = {}): string {
	const dir = scratch();
	write(dir, { "stryker.config.json": "{}\n", "bun/a.ts": "1\n", "bun/a.test.ts": "1\n", ...files });
	git(dir, "init", "-q", "-b", "main");
	git(dir, "add", "-A");
	git(dir, "commit", "-qm", "base");
	return dir;
}

/** A `PATH` holding git and bun, plus a shell script per entry of `stubs`. */
function path(stubs: Record<string, string>): string {
	const bin = scratch();
	symlinkSync(Bun.which("git") ?? "git", join(bin, "git"));
	symlinkSync(process.execPath, join(bin, "bun"));
	for (const [name, body] of Object.entries(stubs)) {
		writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
		chmodSync(join(bin, name), 0o755);
	}
	return bin;
}

const cli = (cwd: string, bin: string) => {
	const run = Bun.spawnSync(["bun", script], { cwd, env: { PATH: bin, HOME: cwd }, stdout: "pipe", stderr: "pipe" });
	return { code: run.exitCode, err: run.stderr.toString() };
};

const REPORT = "reports/mutation/mutation.json";

/** What Stryker would write for `bun/a.ts` holding `1\n`: one survivor, among machine-bound fields. */
const results = JSON.stringify({
	schemaVersion: "1.0",
	projectRoot: "/somewhere",
	files: {
		"bun/a.ts": {
			language: "typescript",
			source: "1\n",
			mutants: [{ id: "0", mutatorName: "M", location: {}, replacement: "2", status: "Survived", static: false }],
		},
	},
});

describe("the command", () => {
	test("a module to run with no node on PATH fails naming Node", () => {
		const { code, err } = cli(repository(), path({ bunx: "exit 0" }));
		expect(code).toBe(1);
		expect(err).toContain("Node");
	});

	test("a Stryker exit that is not 0 fails before the merge, leaving no report", () => {
		const dir = repository();
		write(dir, { [REPORT]: "{}" });
		const { code, err } = cli(dir, path({ node: "exit 0", bunx: "exit 3" }));
		expect(code).toBe(1);
		expect(err).toContain("Stryker exited 3 on bun/a.ts");
		expect(existsSync(join(dir, REPORT))).toBe(false);
	});

	// spec: mutation-floor/a-new-module-has-no-stored-file
	// spec: mutation-floor/a-push-whose-run-rewrote-a-stored-file
	test("a written stored file fails until committed, and then passes without mutating", () => {
		const dir = repository();
		// `/bin/mkdir` by path: the stub's `PATH` holds git and bun alone.
		const stryker = `/bin/mkdir -p mutation && printf '%s' '${results}' > mutation/a.json`;
		const first = cli(dir, path({ node: "exit 0", bunx: stryker }));
		expect(first.code).toBe(1);
		expect(first.err).toContain("mutation/a.json differs from HEAD's");
		expect(Object.keys(JSON.parse(readFileSync(join(dir, "mutation/a.json"), "utf8")))).toEqual([
			"schemaVersion",
			"files",
			"fingerprint",
		]);
		git(dir, "add", "mutation");
		git(dir, "commit", "-qm", "results");
		expect(cli(dir, path({ node: "exit 0", bunx: "exit 3" })).code).toBe(0);
		expect(JSON.parse(readFileSync(join(dir, REPORT), "utf8")).files["bun/a.ts"].mutants).toHaveLength(1);
	});

	test("a stored file differing from HEAD's, or untracked, is named", () => {
		const dir = repository({ "mutation/a.json": "{}\n" });
		write(dir, { "mutation/a.json": "{ }\n", "mutation/b.json": "{}\n" });
		expect(unsaved(dir)).toEqual(["mutation/a.json", "mutation/b.json"]);
	});

	test("a staged rename under mutation/ names both sides", () => {
		const dir = repository({ "mutation/a.json": "{}\n" });
		git(dir, "mv", "mutation/a.json", "mutation/c.json");
		expect(unsaved(dir)).toEqual(["mutation/a.json", "mutation/c.json"]);
	});

	test.each([
		["--every", "unknown option --every"],
		["bun/a.test.ts", "bun/a.test.ts is not a tracked module"],
	])("%s fails before anything runs", (arg, message) => {
		const run = Bun.spawnSync(["bun", script, arg], {
			cwd: repository(),
			env: { PATH: path({ node: "exit 0", bunx: "exit 3" }) },
			stderr: "pipe",
		});
		expect(run.exitCode).toBe(1);
		expect(run.stderr.toString()).toContain(message);
	});
});
