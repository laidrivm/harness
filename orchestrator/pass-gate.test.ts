import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import { clone, held, host, IDLE, lock, release, running, skip, starts, stop, tick } from "./pass.fixture.ts";

/** `pass.sh`'s gate, which the deploy holds while it holds every repository's lock (host-deploy design, *Build first*). */

afterAll(cleanup);

describe.skipIf(skip)(`pass.sh's gate${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
	// spec: orchestrator/a-repository-s-first-pass-during-the-deploy
	// orchestrator/a-tick-during-the-deploy
	test.each([
		["with no lock file yet", false],
		["whose lock file the deploy holds too", true],
	])("a tick %s while the gate is held prints busy, exits 0, writes no stop file and creates no lock file", async (_, locked) => {
		const h = host();
		clone(h, "repo");
		const locks = join(h.state, "locks");
		mkdirSync(locks, { recursive: true });
		if (locked) writeFileSync(lock(h), "");
		const holders = [await held(join(locks, "gate.lock")), ...(locked ? [await held(lock(h))] : [])];
		const r = tick(h, "repo");
		for (const holder of holders) holder.kill();
		expect([r.code, r.last]).toEqual([0, `orchestrator: busy — ${join(locks, "gate.lock")} is held`]);
		expect(existsSync(lock(h))).toBe(locked);
		expect(existsSync(stop(h, "repo"))).toBe(false);
		expect(starts(h, "repo")).toBe(0);
	}, 30_000);

	// spec: orchestrator/clones-of-two-repositories
	test("passes of two repositories started together both run: each holds the gate only while it takes its own lock", async () => {
		const h = host();
		clone(h, "one", { hold: true });
		clone(h, "two", { url: "git@github.com:owner/other.git", hold: true });
		const [one, two] = await Promise.all([running(h, "one"), running(h, "two")]);
		expect([starts(h, "one"), starts(h, "two")]).toEqual([1, 1]);
		expect(await release(h, "one", one)).toBe(0);
		expect(await release(h, "two", two)).toBe(0);
		expect(tick(h, "one").last).toBe(IDLE);
	}, 30_000);
});
