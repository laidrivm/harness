import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanup, emptyDir, git } from "../bun/diff-budget.fixture.ts";

/** `pass.sh` against a fabricated host: a home, a clones and a secrets directory in one temporary tree. [n]: `/zombies` ideas. */

afterAll(cleanup);

const script = join(import.meta.dir, "pass.sh");
const bash = Bun.which("bash") ?? "bash";
const CLAUDE = "throwaway-claude-token-4f1d";
const GH = "throwaway-gh-token-9c2e";
const URL = "https://github.com/owner/repo.git";
const IDLE = "board-loop: idle — nothing takeable";
const OPEN = "board-loop: open — apply demo step 1";
/** The tools `pass.sh` calls, with bun's directory, and without it. */
const tools = [Bun.which("flock"), Bun.which("git")].filter((p) => p !== null).map((p) => dirname(p));
const NO_BUN = [...tools, "/usr/bin", "/bin"].join(":");
const PATH = [dirname(process.execPath), NO_BUN].join(":");

/**
 * The runner a clone holds: it notes its pid, prints its environment, waits
 * while `.fake/hold` exists, then prints a last line and exits with
 * `.fake/status`. It reads its orders from files, since the pass's
 * environment is the one under test.
 */
const FAKE = `import { appendFileSync, existsSync, readFileSync } from "node:fs";
appendFileSync(".fake/started", process.pid + "\\n");
console.log(JSON.stringify(process.env));
while (existsSync(".fake/hold")) Bun.sleepSync(20);
const status = Number(readFileSync(".fake/status", "utf8"));
console.log(status === 0 ? ${JSON.stringify(IDLE)} : ${JSON.stringify(OPEN)});
process.exit(status);
`;

type Host = { root: string; home: string; clones: string; secrets: string; state: string };

function host(): Host {
	const root = emptyDir("orchestrator-pass-");
	const h = { root, home: join(root, "home"), clones: join(root, "clones"), secrets: join(root, "secrets") };
	for (const dir of [h.home, h.clones, h.secrets]) mkdirSync(dir);
	writeFileSync(join(h.secrets, "claude_oauth_token"), `${CLAUDE}\n`);
	writeFileSync(join(h.secrets, "gh_token"), `${GH}\n`);
	return { ...h, state: join(h.home, "orchestrator") };
}

/** A clone named `name` whose `origin` is `url` and whose runner exits `status`, holding when `hold`. */
function clone(h: Host, name: string, { url = URL, status = 0, hold = false } = {}) {
	const dir = join(h.clones, name);
	mkdirSync(join(dir, "node_modules/harness/bun"), { recursive: true });
	mkdirSync(join(dir, ".fake"));
	git(dir, "init", "-q");
	git(dir, "remote", "add", "origin", url);
	writeFileSync(join(dir, "node_modules/harness/bun/board-loop.ts"), FAKE);
	writeFileSync(join(dir, ".fake/status"), String(status));
	if (hold) writeFileSync(join(dir, ".fake/hold"), "");
	return dir;
}

const env = (h: Host, extra: Record<string, string> = {}, path = PATH) => ({
	PATH: path,
	HOME: h.home,
	PASS_CLONES: h.clones,
	PASS_SECRETS: h.secrets,
	...extra,
});

/** One tick, run to its end. */
function tick(h: Host, name: string, extra?: Record<string, string>, path?: string) {
	const p = Bun.spawnSync([bash, script, name], { cwd: h.root, env: env(h, extra, path) });
	const out = p.stdout.toString();
	return { code: p.exitCode, out, last: out.trim().split("\n").at(-1) ?? "", err: p.stderr.toString() };
}

/** A tick left running, resolved once its runner has started and is holding. */
async function running(h: Host, name: string) {
	const p = Bun.spawn([bash, script, name], { cwd: h.root, env: env(h), stdout: "pipe" });
	const started = join(h.clones, name, ".fake/started");
	while (!existsSync(started)) {
		if (p.exitCode !== null) throw new Error(`the tick ended with ${p.exitCode} before its runner started`);
		await Bun.sleep(20);
	}
	return p;
}

/** Lets the runner in `name` finish, and waits for its tick. */
async function release(h: Host, name: string, p: ReturnType<typeof Bun.spawn>) {
	rmSync(join(h.clones, name, ".fake/hold"));
	return p.exited;
}

const starts = (h: Host, name: string) => {
	const file = join(h.clones, name, ".fake/started");
	return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").length : 0;
};
const stop = (h: Host, name: string) => join(h.state, `${name}.stop`);
const lock = (h: Host) => join(h.state, "locks/owner-repo.lock");
/** The environment the runner printed, its first line of output. */
const passEnv = (out: string): Record<string, string> => JSON.parse(out.split("\n")[0]);

// No `flock` on macOS: these run on Linux. In CI they never skip, so a missing `flock` fails them there.
const skip = !Bun.which("flock") && !process.env.CI;

describe.skipIf(skip)(`pass.sh${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
	describe("the clone name", () => {
		// spec: orchestrator/a-clone-name-that-leaves-the-clones-directory
		// Each name but the missing one is arranged to reach a real clone, so only the name's own guard refuses it.
		test.each([
			["empty [1]", "", true],
			["of no clone [2]", "nothing", false],
			["`..` [9]", "..", true],
			["holding a `/` [10]", "repo/.", false],
			["holding a newline [11]", "repo\n", true],
			["with a leading `-` [12]", "-repo", true],
		])("%s exits 2 with no lock and no stop file", (_, name, arranged) => {
			const h = host();
			clone(h, "repo");
			if (arranged) clone(h, name);
			const r = tick(h, name);
			expect(r.code).toBe(2);
			expect(existsSync(h.state)).toBe(false);
			expect(starts(h, name === "nothing" ? "repo" : name)).toBe(0);
		});

		// spec: orchestrator/a-clone-name-that-leaves-the-clones-directory
		test.each([
			"https://github.com/repo.git",
			"git@github.com:repo.git",
			"/srv/git/owner/repo.git",
			"https://github.com/owner/repo/extra.git",
		])("an origin URL naming no owner and repository exits 2 with no lock and no stop file [15]: %s", (url) => {
			const h = host();
			clone(h, "repo", { url });
			const r = tick(h, "repo");
			expect(r.code).toBe(2);
			expect(existsSync(join(h.state, "locks"))).toBe(false);
			expect(existsSync(stop(h, "repo"))).toBe(false);
			expect(starts(h, "repo")).toBe(0);
		});
	});

	describe("the stop file", () => {
		// spec: orchestrator/a-pass-that-met-its-goal-or-found-nothing
		test("a happy tick creates the absent state directories, ends on the runner's idle line, exits 0 and writes no stop file [3][25][26]", () => {
			const h = host();
			clone(h, "repo");
			const r = tick(h, "repo");
			expect([r.code, r.last]).toEqual([0, IDLE]);
			expect(existsSync(stop(h, "repo"))).toBe(false);
			expect(existsSync(join(h.state, "locks"))).toBe(true);
			expect(existsSync(join(h.state, "passes"))).toBe(true);
		});

		// spec: orchestrator/the-pass-exits-1
		test.each([1, 137])("a pass exiting %i writes the UTC time, the status and the last line, and returns the status [4][19]", (status) => {
			const h = host();
			clone(h, "repo", { status });
			const r = tick(h, "repo");
			expect(r.code).toBe(status);
			expect(readFileSync(stop(h, "repo"), "utf8")).toMatch(new RegExp(`^\\d{8}T\\d{6}Z exit ${status}: ${OPEN}\\n$`));
		});

		test.each([0, 1])("a pass exiting %i leaves its whole output in passes/<UTC time>-<clone>.log and on stdout [20][42]", (status) => {
			const h = host();
			clone(h, "repo", { status });
			const r = tick(h, "repo");
			const logs = readdirSync(join(h.state, "passes"));
			expect(logs).toHaveLength(1);
			expect(logs[0]).toMatch(/^\d{8}T\d{6}Z-repo\.log$/);
			expect(readFileSync(join(h.state, "passes", logs[0]), "utf8")).toBe(r.out);
			expect(passEnv(r.out).HOME).toBe(h.home);
			expect(r.last).toBe(status === 0 ? IDLE : OPEN);
		});

		// spec: orchestrator/the-next-tick-after-a-failure
		test("the next tick after a failure prints the paused line, exits 3 and starts no pass [18]", () => {
			const h = host();
			clone(h, "repo", { status: 1 });
			tick(h, "repo");
			const first = readFileSync(stop(h, "repo"), "utf8").trim();
			const r = tick(h, "repo");
			expect(r.code).toBe(3);
			expect(r.last).toBe(`orchestrator: paused — ${stop(h, "repo")}: ${first}; remove it to resume`);
			expect(starts(h, "repo")).toBe(1);
		});

		// spec: orchestrator/the-user-removes-the-stop-file
		test("once the user removes the stop file, the next tick runs a pass", () => {
			const h = host();
			const dir = clone(h, "repo", { status: 1 });
			tick(h, "repo");
			rmSync(stop(h, "repo"));
			writeFileSync(join(dir, ".fake/status"), "0");
			const r = tick(h, "repo");
			expect([r.code, r.last]).toEqual([0, IDLE]);
			expect(starts(h, "repo")).toBe(2);
		});

		// spec: orchestrator/the-runner-cannot-start
		test("bun missing from PATH writes the stop file [21]", () => {
			const h = host();
			clone(h, "repo");
			const r = tick(h, "repo", {}, NO_BUN);
			expect(r.code).toBe(127);
			expect(readFileSync(stop(h, "repo"), "utf8")).toContain(" exit 127: ");
		});

		// spec: orchestrator/a-secret-file-missing
		test.each([
			["a missing", "claude_oauth_token", null],
			["an empty", "gh_token", ""],
			["a whitespace-only", "gh_token", " \n\t\n"],
		])("%s secret file writes the stop file naming it and never starts the runner [13][22]", (_, file, content) => {
			const h = host();
			clone(h, "repo");
			const path = join(h.secrets, file);
			if (content === null) rmSync(path);
			else writeFileSync(path, content);
			const r = tick(h, "repo");
			expect(r.code).toBe(1);
			expect(r.last).toContain(path);
			expect(readFileSync(stop(h, "repo"), "utf8")).toContain(path);
			expect(starts(h, "repo")).toBe(0);
		});

		// spec: orchestrator/the-connection-that-started-the-pass-drops
		test("SIGHUP to the wrapper and its runner mid-pass: the pass completes and the stop file shows its status [23]", async () => {
			const h = host();
			clone(h, "repo", { status: 1, hold: true });
			const p = await running(h, "repo");
			const runner = Number(readFileSync(join(h.clones, "repo/.fake/started"), "utf8"));
			process.kill(p.pid, "SIGHUP");
			process.kill(runner, "SIGHUP");
			await Bun.sleep(100);
			expect(await release(h, "repo", p)).toBe(1);
			expect(readFileSync(stop(h, "repo"), "utf8")).toContain(" exit 1: ");
		}, 20_000);
	});

	describe("the lock", () => {
		// spec: orchestrator/a-tick-while-a-pass-runs
		test("a tick while a pass of the same clone runs says the lock is held, exits 0 and writes no stop file [5]", async () => {
			const h = host();
			clone(h, "repo", { hold: true });
			const p = await running(h, "repo");
			const r = tick(h, "repo");
			await release(h, "repo", p);
			expect([r.code, r.last]).toEqual([0, `orchestrator: busy — ${lock(h)} is held`]);
			expect(existsSync(stop(h, "repo"))).toBe(false);
			expect(starts(h, "repo")).toBe(1);
		}, 20_000);

		// spec: orchestrator/two-clones-of-one-repository
		test.each([
			["HTTPS, then SSH", URL, "git@github.com:owner/repo.git"],
			["SSH, then HTTPS", "git@github.com:owner/repo.git", "https://github.com/owner/repo"],
			["HTTPS, then an ssh:// URL", URL, "ssh://git@github.com/Owner/Repo.git"],
		])("a second clone of one repository is busy while the first runs [6]: %s", async (_, first, second) => {
			const h = host();
			clone(h, "one", { url: first, hold: true });
			clone(h, "two", { url: second });
			const p = await running(h, "one");
			const r = tick(h, "two");
			await release(h, "one", p);
			expect([r.code, r.last]).toEqual([0, `orchestrator: busy — ${lock(h)} is held`]);
			expect(starts(h, "two")).toBe(0);
		}, 20_000);

		// spec: orchestrator/clones-of-two-repositories
		test("clones of two repositories both run [7]", async () => {
			const h = host();
			clone(h, "one", { hold: true });
			clone(h, "two", { url: "git@github.com:owner/other.git" });
			const p = await running(h, "one");
			const r = tick(h, "two");
			await release(h, "one", p);
			expect([r.code, r.last]).toEqual([0, IDLE]);
		}, 20_000);

		// spec: orchestrator/a-tick-while-a-pass-runs
		test("once the pass holding the lock ends, the next tick runs [8][14]", async () => {
			const h = host();
			clone(h, "repo", { hold: true });
			await release(h, "repo", await running(h, "repo"));
			const r = tick(h, "repo");
			expect([r.code, r.last]).toEqual([0, IDLE]);
			expect(starts(h, "repo")).toBe(2);
		}, 20_000);

		// spec: orchestrator/the-next-tick-after-a-failure
		test("paused wins over a held lock [24]", async () => {
			const h = host();
			clone(h, "repo", { hold: true });
			const p = await running(h, "repo");
			writeFileSync(stop(h, "repo"), "by hand\n");
			const r = tick(h, "repo");
			await release(h, "repo", p);
			expect(r.code).toBe(3);
			expect(r.last).toStartWith("orchestrator: paused");
		}, 20_000);
	});

	describe("the pass's environment", () => {
		// spec: orchestrator/the-host-s-other-variables
		test("holds only the allowlisted names and the tokens' values, with a sentinel absent [16]", () => {
			const h = host();
			clone(h, "repo");
			const seen = passEnv(tick(h, "repo", { PASS_SENTINEL: "host" }).out);
			// PWD, SHLVL and _ are the shell's own, set by the `bash -c` that reads the tokens.
			const shell = ["PWD", "SHLVL", "_"];
			expect(Object.keys(seen).filter((k) => !shell.includes(k)).sort()).toEqual(
				["CLAUDE_CODE_OAUTH_TOKEN", "DISABLE_AUTOUPDATER", "GH_TOKEN", "HOME", "LANG", "PATH"],
			);
			expect([seen.CLAUDE_CODE_OAUTH_TOKEN, seen.GH_TOKEN]).toEqual([CLAUDE, GH]);
		});

		// spec: orchestrator/the-tokens-stay-out-of-process-arguments
		test("no process's arguments hold either token while the runner runs [40]", async () => {
			const h = host();
			clone(h, "repo", { hold: true });
			const p = await running(h, "repo");
			const ps = Bun.spawnSync(["ps", "-A", "-ww", "-o", "args="]).stdout.toString();
			await release(h, "repo", p);
			expect(ps).toContain("board-loop.ts");
			expect(ps).not.toContain(CLAUDE);
			expect(ps).not.toContain(GH);
		}, 20_000);

		// spec: orchestrator/started-from-a-claude-code-session
		test.each([
			["set", { CLAUDECODE: "1" }, "1"],
			["empty", { CLAUDECODE: "" }, ""],
			["unset", {}, undefined],
		])("CLAUDECODE %s reaches the pass as it reached the wrapper [17]", (_, extra, value) => {
			const h = host();
			clone(h, "repo");
			expect(passEnv(tick(h, "repo", extra).out).CLAUDECODE).toBe(value);
		});
	});
});
