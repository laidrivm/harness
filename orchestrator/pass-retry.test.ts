import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import { TEMPFAIL } from "../bun/transient.ts";
import { clone, host, OPEN, release, running, skip, starts, stop, tick } from "./pass.fixture.ts";
import * as pin from "./pass-pin.fixture.ts";

/** `pass.sh` skipping a tick the board loop ended `retry`, or that its own fetch failed, until the third in a row. */

afterAll(cleanup);

const THIRD = "(3 transient failures in a row)";
const retries = (state: string, name = "repo") => join(state, `${name}.retries`);
/** Sets what the next pass of `name` exits. */
const exits = (h: ReturnType<typeof host>, status: number, name = "repo") => writeFileSync(join(h.clones, name, ".fake/status"), String(status));

describe.skipIf(skip)(`pass.sh's transient count${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
	// spec: orchestrator/a-transient-failure-skips-the-tick
	test("a first pass exiting 75 writes no stop file, exits 75, and the next tick starts a pass", () => {
		const h = host();
		clone(h, "repo", { status: TEMPFAIL });
		const r = tick(h, "repo");
		expect([r.code, r.last]).toEqual([TEMPFAIL, OPEN]);
		expect(existsSync(stop(h, "repo"))).toBe(false);
		expect(tick(h, "repo").code).toBe(TEMPFAIL);
		expect(starts(h, "repo")).toBe(2);
	});

	// spec: orchestrator/a-third-transient-failure-in-a-row
	test("the third pass in a row exiting 75 writes the stop file naming the count, and clears the count", () => {
		const h = host();
		clone(h, "repo", { status: TEMPFAIL });
		for (const _ of [1, 2]) expect(tick(h, "repo").code).toBe(TEMPFAIL);
		expect(existsSync(stop(h, "repo"))).toBe(false);
		expect(tick(h, "repo").code).toBe(TEMPFAIL);
		const line = readFileSync(stop(h, "repo"), "utf8");
		expect(line).toMatch(/^\d{8}T\d{6}Z exit 75: /);
		expect(line).toEndWith(`: ${OPEN} ${THIRD}\n`);
		expect(existsSync(retries(h.state))).toBe(false);
		// Removing the stop file is the whole resume: the next 75 is a first again.
		rmSync(stop(h, "repo"));
		expect(tick(h, "repo").code).toBe(TEMPFAIL);
		expect(existsSync(stop(h, "repo"))).toBe(false);
	});

	// spec: orchestrator/a-pass-between-transient-failures
	test.each([0, 1])("a pass exiting %i between two that exit 75 clears the count", (between) => {
		const h = host();
		clone(h, "repo", { status: TEMPFAIL });
		tick(h, "repo");
		tick(h, "repo");
		exits(h, between);
		tick(h, "repo");
		rmSync(stop(h, "repo"), { force: true });
		exits(h, TEMPFAIL);
		expect(tick(h, "repo").code).toBe(TEMPFAIL);
		expect(existsSync(stop(h, "repo"))).toBe(false);
	});

	test("a count that is no number reads as none", () => {
		const h = host();
		clone(h, "repo", { status: TEMPFAIL });
		tick(h, "repo");
		// Bash arithmetic would refuse `2x`, or evaluate an expression, rather than count it.
		writeFileSync(retries(h.state), "2x\n");
		expect(tick(h, "repo").code).toBe(TEMPFAIL);
		expect(existsSync(stop(h, "repo"))).toBe(false);
		expect(readFileSync(retries(h.state), "utf8")).toBe("1\n");
	});

	test("a tick that finds the lock held leaves the count", async () => {
		const h = host();
		clone(h, "repo", { status: TEMPFAIL });
		tick(h, "repo");
		tick(h, "repo");
		writeFileSync(join(h.clones, "repo/.fake/hold"), "");
		const p = await running(h, "repo");
		expect(tick(h, "repo").code).toBe(0);
		await release(h, "repo", p);
		expect(readFileSync(stop(h, "repo"), "utf8")).toContain(THIRD);
	}, 20_000);
});

// The launcher's stand stubs `flock`, so these run everywhere.
describe("pass.sh's own fetches", () => {
	// spec: orchestrator/the-push-clone-cannot-fetch
	test.each([
		["the push clone's", false, "the push clone"],
		["the pin's", true, "the harness pin"],
	])("%s fetch failing starts no pass and exits 75; the third in a row writes the stop file", (_, ofPin, named) => {
		const h = pin.stand();
		const sha = pin.publish(h, "laidrivm/harness", { "bun/board-loop.ts": pin.runner("one") });
		// A pin naming a commit no fetch brings, or a push clone whose repository is gone.
		pin.repository(h, "owner/repo", pin.pinOf(ofPin ? "0".repeat(40) : sha));
		if (!ofPin) renameSync(join(h.gh, "owner/repo.git"), join(h.gh, "gone.git"));
		const state = join(h.home, "orchestrator");
		for (const n of [1, 2]) {
			const r = pin.tick(h);
			expect([r.code, r.ran]).toEqual([TEMPFAIL, undefined]);
			expect(r.out).toContain(named);
			expect(existsSync(join(state, "repo.stop"))).toBe(false);
			expect(readFileSync(retries(state), "utf8").trim()).toBe(String(n));
		}
		expect(pin.tick(h).code).toBe(TEMPFAIL);
		expect(pin.stopped(h)).toContain(named);
		expect(pin.stopped(h)).toContain(" exit 75: ");
		expect(pin.stopped(h)).toContain(THIRD);
	});
});
