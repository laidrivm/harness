import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import { clone, host, IDLE, lock, release, running, skip, starts, stop, tick, URL } from "./pass.fixture.ts";

/** `pass.sh`'s lock against a fabricated host (`pass.fixture.ts`). [n]: `/zombies` ideas. */

afterAll(cleanup);

describe.skipIf(skip)(`pass.sh${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
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
