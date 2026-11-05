/** `bun/mutation-run.ts` run in a throwaway repository, `node` and Stryker's `bunx` stubbed; the plan's cases are
 * in `mutation-run.test.ts`, to keep both under the cap. */
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
import { unsaved } from "./mutation-checkout.ts";
import { command } from "./mutation-run.ts";

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

/** A committed repository holding `files` and one module with a test, `listed` the modules it mutates. */
function repository(files: Record<string, string> = {}, listed = ["bun/a.ts"]): string {
	const dir = scratch();
	const config = `${JSON.stringify({ mutate: listed })}\n`;
	write(dir, { "stryker.config.json": config, "bun/a.ts": "1\n", "bun/a.test.ts": "1\n", ...files });
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

const cli = (cwd: string, bin: string, ...args: string[]) => {
	const run = Bun.spawnSync(["bun", script, ...args], { cwd, env: { PATH: bin, HOME: cwd }, stderr: "pipe" });
	return { code: run.exitCode, err: run.stderr.toString() };
};

/** `dir` with its results committed, then a changed test committed over them, so the next run is forced. */
function forced(dir: string): string {
	cli(dir, path({ node: "exit 0", bunx: stryker }));
	git(dir, "add", "mutation");
	git(dir, "commit", "-qm", "results");
	write(dir, { "bun/a.test.ts": "2\n" });
	git(dir, "commit", "-qam", "a changed test");
	return readFileSync(join(dir, "mutation/a.json"), "utf8");
}

const REPORT = "reports/mutation/mutation.json";

/** What Stryker would write for `bun/a.ts` holding `1\n`: one survivor, among machine-bound fields. */
const results = JSON.stringify({
	schemaVersion: "1.0",
	projectRoot: "/somewhere",
	files: {
		"bun/a.ts": {
			source: "1\n",
			mutants: [{ id: "0", mutatorName: "M", location: {}, replacement: "2", status: "Survived", static: false }],
		},
	},
});

/** Writes `results` to the configuration's incremental file. Programs by path: the stub's `PATH` holds git and bun alone. */
const writes = [
	`f=$(/usr/bin/sed -n 's/.*"incrementalFile":"\\([^"]*\\)".*/\\1/p' "$4")`,
	`printf '%s' '${results}' > "$f"`,
];

/** A stub of Stryker's `bunx`: `writes`, records its arguments in `calls`, and exits 1 once if `fail-once` is there. */
const stryker = [...writes, `echo "$@" >> calls`, "if [ -f fail-once ]; then /bin/rm fail-once; exit 1; fi"].join("\n");

/** A `bunx` that `writes` on every call, records `dry` or `run` in `calls`, and fails the dry runs of `failing`. */
const sweeping = (...failing: string[]) =>
	[
		...writes,
		`if ! /usr/bin/grep -q '"dryRunOnly":true' "$4"; then echo run >> calls; exit 0; fi`,
		"echo dry >> calls",
		...failing.map((module) => `if /usr/bin/grep -q '"${module}"' "$4"; then exit 1; fi`),
	].join("\n");

const three = { "bun/b.ts": "1\n", "bun/b.test.ts": "1\n", "bun/c.ts": "1\n", "bun/c.test.ts": "1\n" };
const listedThree = ["bun/a.ts", "bun/b.ts", "bun/c.ts"];

describe("the command", () => {
	test("a module to run with no node on PATH fails naming Node", () => {
		const { code, err } = cli(repository(), path({ bunx: "exit 0" }));
		expect([code, err.includes("Node")]).toEqual([1, true]);
	});

	test("a Stryker exit that is not 0 fails before the merge, leaving not even the run's own report", () => {
		const dir = repository();
		const bunx = `/bin/mkdir -p reports/mutation && echo '{}' > ${REPORT}; exit 3`;
		const { code, err } = cli(dir, path({ node: "exit 0", bunx }));
		expect([code, err.includes("Stryker exited 3 on bun/a.ts"), existsSync(join(dir, REPORT))]).toEqual([
			1,
			true,
			false,
		]);
	});

	// spec: mutation-floor/a-new-module-has-no-stored-file
	// spec: mutation-floor/a-push-whose-run-rewrote-a-stored-file
	test("a written stored file fails until committed, and then passes without mutating", () => {
		const dir = repository();
		const first = cli(dir, path({ node: "exit 0", bunx: stryker }));
		expect(first.code).toBe(1);
		expect(first.err).toContain("mutation/a.json differs from HEAD's");
		const kept = Object.keys(JSON.parse(readFileSync(join(dir, "mutation/a.json"), "utf8")));
		expect(kept).toEqual(["schemaVersion", "files", "fingerprint"]);
		git(dir, "add", "mutation");
		git(dir, "commit", "-qm", "results");
		expect(cli(dir, path({ node: "exit 0", bunx: "exit 3" })).code).toBe(0);
		expect(JSON.parse(readFileSync(join(dir, REPORT), "utf8")).files["bun/a.ts"].mutants).toHaveLength(1);
	});

	// spec: mutation-floor/a-run-asked-for-every-module
	test("an interrupted run leaves the stored file whole, and the next starts the module again", () => {
		const dir = repository();
		const stored = forced(dir);
		write(dir, { "fail-once": "", calls: "" });
		const bin = path({ node: "exit 0", bunx: stryker });
		expect(cli(dir, bin).err).toContain("Stryker exited 1 on bun/a.ts");
		expect(readFileSync(join(dir, "mutation/a.json"), "utf8")).toBe(stored);
		expect(cli(dir, bin).err).toContain("mutation/a.json differs from HEAD's");
		const calls = readFileSync(join(dir, "calls"), "utf8").trim().split("\n");
		expect(calls.map((call) => call.endsWith("--force"))).toEqual([true, true]);
	});

	test("a forced run never resumes from a copy of the old results that a failed start left", () => {
		const dir = repository();
		const [failing, passing] = [
			path({ node: "exit 0", bunx: 'echo "$@" > calls; exit 1' }),
			path({ node: "exit 0", bunx: stryker }),
		];
		const forcedLast = () => readFileSync(join(dir, "calls"), "utf8").trim().endsWith("--force");
		forced(dir);
		cli(dir, failing);
		cli(dir, passing);
		expect(forcedLast()).toBe(true);
		cli(dir, failing, "--all");
		cli(dir, passing, "--all", "--force");
		expect(forcedLast()).toBe(true);
	});

	test("of several modules, every one whose dry run fails is named before any is mutated or stored", () => {
		const dir = repository(three, listedThree);
		// Results are written on every call, so a dry run that stored them would leave `mutation/`.
		const { code, err } = cli(dir, path({ node: "exit 0", bunx: sweeping("bun/a.ts", "bun/c.ts") }));
		const named = ["bun/a.ts", "bun/b.ts", "bun/c.ts"].map((m) => err.includes(`dry run exited 1 on ${m}`));
		expect([code, ...named]).toEqual([1, true, false, true]);
		const calls = readFileSync(join(dir, "calls"), "utf8");
		expect([calls, existsSync(join(dir, "mutation"))]).toEqual(["dry\ndry\ndry\n", false]);
	});

	test("of several modules whose dry runs all pass, each is then mutated and stored", () => {
		const dir = repository(three, listedThree);
		cli(dir, path({ node: "exit 0", bunx: sweeping() }));
		const stored = ["a", "b", "c"].map((name) => existsSync(join(dir, `mutation/${name}.json`)));
		expect([readFileSync(join(dir, "calls"), "utf8"), ...stored]).toEqual([
			"dry\ndry\ndry\nrun\nrun\nrun\n",
			true,
			true,
			true,
		]);
	});

	test("one module is not dry-run apart, its own run starting with one", () => {
		const dir = repository();
		cli(dir, path({ node: "exit 0", bunx: `/usr/bin/grep -c '"dryRunOnly":true' "$4" >> calls; exit 3` }));
		expect(readFileSync(join(dir, "calls"), "utf8")).toBe("0\n");
	});

	test("a named module the list does not name fails, and a named run writes no report", () => {
		const dir = repository({ "bun/b.ts": "1\n", "bun/b.test.ts": "1\n" });
		const bin = path({ node: "exit 0", bunx: stryker });
		expect(cli(dir, bin, "bun/b.ts").err).toContain("bun/b.ts is not listed in stryker.config.json's mutate");
		expect(cli(dir, bin, "bun/a.ts").code).toBe(1);
		git(dir, "add", "-A");
		git(dir, "commit", "-qm", "results");
		expect(cli(dir, bin, "bun/a.ts").code).toBe(0);
		expect(existsSync(join(dir, REPORT))).toBe(false);
	});

	test("a stored file differing from HEAD's, untracked, or renamed is named", () => {
		const dir = repository({ "mutation/a.json": "{}\n", "mutation/b.json": "{}\n" });
		write(dir, { "mutation/a.json": "{ }\n", "mutation/new.json": "{}\n" });
		git(dir, "mv", "mutation/b.json", "mutation/c.json");
		expect(unsaved(dir)).toEqual(["mutation/a.json", "mutation/b.json", "mutation/c.json", "mutation/new.json"]);
	});

	// spec: mutation-floor/a-mutant-that-writes-to-the-root-git-names
	test("the tests a run starts find the sandbox through git, never the checkout around it", () => {
		const checkout = repository();
		const sandbox = join(checkout, ".stryker-tmp", "sandbox-1");
		const find = 'Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout.toString().trim()';
		write(sandbox, {
			"bun/a.ts": "1\n",
			"bun/a.test.ts": `import { test } from "bun:test";\ntest("a main block", () => Bun.write(${find} + "/leak", ""));\n`,
		});
		// Twice: the second finds the sandbox's repository already made.
		for (const _ of [1, 2]) expect(Bun.spawnSync(["sh", "-c", command("bun/a.ts")], { cwd: sandbox }).exitCode).toBe(0);
		expect([existsSync(join(sandbox, "leak")), existsSync(join(checkout, "leak"))]).toEqual([true, false]);
	});

	test.each([
		["--every", "unknown option --every"],
		["bun/a.test.ts", "bun/a.test.ts is not a tracked module"],
	])("%s fails before anything runs", (arg, message) => {
		const { code, err } = cli(repository(), path({ node: "exit 0", bunx: "exit 3" }), arg);
		expect([code, err.includes(message)]).toEqual([1, true]);
	});
});
