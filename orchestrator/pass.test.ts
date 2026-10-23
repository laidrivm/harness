import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { clone, host, IDLE, lock, NO_BUN, OPEN, PATH, passEnv, release, running, skip, starts, stop, tick, URL } from "./pass.fixture.ts";

/** `pass.sh` against a fabricated host (`pass.fixture.ts`). [n]: `/zombies` ideas. */

afterAll(cleanup);

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
		test("a worktree, whose `.git` is a file, is no clone and exits 2", () => {
			const h = host();
			clone(h, "repo");
			mkdirSync(join(h.clones, "tree"));
			writeFileSync(join(h.clones, "tree/.git"), `gitdir: ${join(h.clones, "repo/.git")}\n`);
			expect(tick(h, "tree").code).toBe(2);
			expect(existsSync(h.state)).toBe(false);
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

		// spec: orchestrator/the-runner-cannot-start
		test("the runner's file missing from the clone writes the stop file", () => {
			const h = host();
			const dir = clone(h, "repo");
			rmSync(join(dir, "node_modules/harness/bun/board-loop.ts"));
			const r = tick(h, "repo");
			expect(r.code).not.toBe(0);
			expect(readFileSync(stop(h, "repo"), "utf8")).toContain(` exit ${r.code}: `);
		});

		test("flock failing for a reason other than a held lock writes the stop file and starts no pass", () => {
			const h = host();
			clone(h, "repo");
			const stub = emptyDir("orchestrator-flock-");
			writeFileSync(join(stub, "flock"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
			const r = tick(h, "repo", {}, `${stub}:${PATH}`);
			expect(r.code).toBe(1);
			expect(readFileSync(stop(h, "repo"), "utf8")).toContain(" exit 1: orchestrator: flock failed on ");
			expect(starts(h, "repo")).toBe(0);
		});

		test("a stop file pauses its own clone alone: a clone of another repository still runs", () => {
			const h = host();
			clone(h, "one", { status: 1 });
			clone(h, "two", { url: "git@github.com:owner/other.git" });
			tick(h, "one");
			const r = tick(h, "two");
			expect([r.code, r.last]).toEqual([0, IDLE]);
		});

		// spec: orchestrator/a-secret-file-missing
		test.each([
			["a missing", "claude_oauth_token", null],
			["an empty", "claude_oauth_token", ""],
			["a whitespace-only", "claude_oauth_token", " \n\t\n"],
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

		// spec: orchestrator/no-app-configured
		test.each(["HARNESS_GITHUB_APP_ID", "HARNESS_GITHUB_APP_MINT"])("%s unset writes the stop file naming it and never starts the runner", (name) => {
			const h = host();
			clone(h, "repo");
			const r = tick(h, "repo", { [name]: "" });
			expect(r.code).toBe(1);
			expect(readFileSync(stop(h, "repo"), "utf8")).toContain(name);
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
});
