import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import { bash, clone, env, type Host, host, lock, release, running, skip, starts, stop, tick } from "./pass.fixture.ts";

/** `stop.sh` against the fabricated host `pass.sh`'s tests use. [n]: `/zombies` ideas. */

afterAll(cleanup);

const script = join(import.meta.dir, "stop.sh");
const halt = (h: Host, name: string) => {
	const p = Bun.spawnSync([bash, script, name], { cwd: h.root, env: env(h) });
	return { code: p.exitCode, out: p.stdout.toString().trim(), err: p.stderr.toString() };
};
const marker = (h: Host) => `${lock(h)}.pid`;
/** A process that leads its own process group and sleeps, as a pass's group would. */
const sleeper = () => Bun.spawn([Bun.which("setsid") ?? "setsid", "sleep", "30"]);
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

describe.skipIf(skip)(`stop.sh${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
	// spec: orchestrator/a-clone-name-that-leaves-the-clones-directory
	test.each([
		["empty [1]", ""],
		["`..` [2]", ".."],
		["holding a `/` [3]", "repo/."],
		["with a leading `-` [4]", "-repo"],
	])("a bad name, %s, exits 2 and writes nothing, as pass.sh's guard does", (_, name) => {
		const h = host();
		const r = halt(h, name);
		expect(r.code).toBe(2);
		expect(existsSync(h.state)).toBe(false);
	});

	// spec: orchestrator/nothing-to-stop
	test("with no pass holding the lock it prints idle, exits 0, removes a stale marker, signals nothing and writes no stop file [5]", () => {
		const h = host();
		clone(h, "repo");
		tick(h, "repo");
		const other = sleeper();
		writeFileSync(marker(h), `${other.pid} repo\n`);
		const r = halt(h, "repo");
		const living = alive(other.pid);
		other.kill();
		expect([r.code, r.out]).toEqual([0, "idle"]);
		expect(existsSync(marker(h))).toBe(false);
		expect(living).toBe(true);
		expect(existsSync(stop(h, "repo"))).toBe(false);
	});

	// spec: orchestrator/nothing-to-stop
	test("a clone no pass has run in prints idle [6]", () => {
		const h = host();
		mkdirSync(h.state, { recursive: true });
		expect(halt(h, "repo")).toMatchObject({ code: 0, out: "idle" });
		expect(existsSync(stop(h, "repo"))).toBe(false);
	});

	// spec: orchestrator/stopping-a-running-pass
	test("another repository's running pass is left alone [7]", async () => {
		const h = host();
		clone(h, "one", { hold: true });
		clone(h, "two", { url: "git@github.com:owner/other.git" });
		tick(h, "two");
		const p = await running(h, "one", true);
		const r = halt(h, "two");
		const exited = p.exitCode;
		await release(h, "one", p);
		expect([r.code, r.out]).toEqual([0, "idle"]);
		expect(exited).toBeNull();
		expect(existsSync(stop(h, "one"))).toBe(false);
	}, 20_000);

	// spec: orchestrator/stopping-a-running-pass
	test("a running pass gets TERM after the stop file exists, the lock frees, and the next tick is paused [8][9]", async () => {
		const h = host();
		const dir = clone(h, "repo", { hold: true });
		writeFileSync(join(dir, ".fake/watch"), stop(h, "repo"));
		const p = await running(h, "repo", true);
		const r = halt(h, "repo");
		expect(r.code).toBe(0);
		expect(await p.exited).not.toBe(0);
		expect(readFileSync(join(dir, ".fake/termed"), "utf8")).toBe("present\n");
		expect(readFileSync(stop(h, "repo"), "utf8").trim().split("\n").at(-1)).toBe("stopped by hand");
		expect(existsSync(marker(h))).toBe(false);
		const next = tick(h, "repo");
		expect(next.code).toBe(3);
		expect(next.last).toBe(`orchestrator: paused — ${stop(h, "repo")}: stopped by hand; remove it to resume`);
		expect(starts(h, "repo")).toBe(1);
	}, 20_000);
});
