/** `bun/mutation-sandbox.ts` run in a scratch directory, as Stryker's `buildCommand` runs it in its sandbox. */
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const script = `${import.meta.dir}/mutation-sandbox.ts`;
const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const write = (dir: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
};

const git = (cwd: string, ...args: string[]) =>
	Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd });

/** A committed checkout with a sandbox under its `.stryker-tmp` holding `files`, as Stryker lays one out. */
function sandbox(files: Record<string, string>): { checkout: string; sandbox: string } {
	const checkout = mkdtempSync(join(tmpdir(), "mutation-sandbox-"));
	made.push(checkout);
	write(checkout, { ".gitignore": "/.stryker-tmp\n", "a.txt": "1\n" });
	git(checkout, "init", "-q");
	git(checkout, "add", "-A");
	git(checkout, "commit", "-qm", "base");
	const dir = join(checkout, ".stryker-tmp", "sandbox-1");
	write(dir, files);
	return { checkout, sandbox: dir };
}

const build = (cwd: string, env: Record<string, string | undefined> = process.env) =>
	Bun.spawnSync(["bun", script], { cwd, env, stderr: "pipe" });
const commits = (cwd: string) => Bun.spawnSync(["git", "log", "--format=%s"], { cwd }).stdout.toString().trim();
const files = (cwd: string) =>
	Bun.spawnSync(["git", "ls-tree", "-r", "--name-only", "HEAD"], { cwd }).stdout.toString().trim().split("\n");

test("it makes a repository holding the sandbox's files in one commit, and a second run leaves that one", () => {
	const { sandbox: dir } = sandbox({ "bun/a.ts": "1\n", "bun/a.test.ts": "1\n" });
	for (const _ of [1, 2]) expect(build(dir).exitCode).toBe(0);
	expect([commits(dir), files(dir)]).toEqual(["sandbox", ["bun/a.test.ts", "bun/a.ts"]]);
});

test("the sandbox's commit is stryker's, whatever identity the environment exports", () => {
	const { sandbox: dir } = sandbox({ "bun/a.ts": "1\n" });
	const who = { GIT_AUTHOR_NAME: "x", GIT_AUTHOR_EMAIL: "x@x", GIT_COMMITTER_NAME: "y", GIT_COMMITTER_EMAIL: "y@y" };
	expect(build(dir, { ...process.env, ...who }).exitCode).toBe(0);
	const log = Bun.spawnSync(["git", "log", "--format=%an %ae %cn %ce"], { cwd: dir }).stdout.toString().trim();
	expect(log).toBe("stryker stryker@sandbox stryker stryker@sandbox");
});

test("a repository an earlier attempt left without a HEAD is remade", () => {
	const { sandbox: dir } = sandbox({ "bun/a.ts": "1\n" });
	git(dir, "init", "-q");
	expect(build(dir).exitCode).toBe(0);
	expect(commits(dir)).toBe("sandbox");
});

test("a `.git` git does not accept is remade, though git would answer from the checkout around it", () => {
	const { checkout, sandbox: dir } = sandbox({ "bun/a.ts": "1\n" });
	mkdirSync(join(dir, ".git"));
	expect(build(dir).exitCode).toBe(0);
	expect([commits(checkout), commits(dir)]).toEqual(["base", "sandbox"]);
});

// spec: mutation-floor/a-mutant-that-writes-to-the-root-git-names
test("a test run in the sandbox finds the sandbox through git, never the checkout around it", () => {
	const find = 'Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout.toString().trim()';
	const { checkout, sandbox: dir } = sandbox({
		"bun/a.ts": "1\n",
		"bun/a.test.ts": `import { test } from "bun:test";\ntest("a main block", () => Bun.write(${find} + "/leak", ""));\n`,
	});
	expect(build(dir).exitCode).toBe(0);
	expect(Bun.spawnSync(["bun", "test", "./bun/a.test.ts"], { cwd: dir }).exitCode).toBe(0);
	expect([existsSync(join(dir, "leak")), existsSync(join(checkout, "leak"))]).toEqual([true, false]);
});

test("git's repository variables inherited from a hook point its git at the sandbox, not the checkout", () => {
	const { checkout, sandbox: dir } = sandbox({ "bun/a.ts": "1\n" });
	const env = { ...process.env, GIT_DIR: join(checkout, ".git"), GIT_WORK_TREE: checkout };
	expect(build(dir, env).exitCode).toBe(0);
	expect([commits(checkout), commits(dir)]).toEqual(["base", "sandbox"]);
});
