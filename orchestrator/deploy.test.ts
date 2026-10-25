import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import { answer, deploy, deployed, HEAD, host, log, set, started, steps, stopOf, stopped } from "./deploy.fixture.ts";
import { held, skip } from "./pass.fixture.ts";

/** `deploy.sh` against a fabricated host (`deploy.fixture.ts`). */

afterAll(cleanup);

const STOP = (step: string) => new RegExp(`^\\d{8}T\\d{6}Z deploy: ${step} failed at ${HEAD}\\n$`);

describe("deploy.sh", () => {
	// spec: orchestrator/main-has-not-moved
	test("a head equal to the recorded one reads no check, moves nothing and exits 0", () => {
		const h = host();
		deploy(h);
		const before = log(h).length;
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(log(h).slice(before).filter((l) => !/^git (fetch|rev-parse)/.test(l))).toEqual([]);
	});

	// spec: orchestrator/the-head-s-test-check-has-not-passed
	// orchestrator/a-rerun-after-a-green-run
	test.each([
		["pending", null, "github-actions"],
		["failed", "failure", "github-actions"],
		["absent", undefined, "github-actions"],
		["green from another app", "success", "some-ci"],
	])("a test check %s moves nothing and exits 0", (_, conclusion, app) => {
		const h = host();
		answer(h, conclusion, app);
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(steps(h)).toEqual(["read"]);
		expect(deployed(h)).toBeUndefined();
		expect(stopped(h, "one")).toBeUndefined();
	});

	// spec: orchestrator/the-head-s-test-check-has-not-passed
	test("the read names the head's latest test runs", () => {
		const h = host();
		deploy(h);
		const read = log(h).find((l) => l.startsWith("curl "));
		expect(read).toContain(`https://api.github.com/repos/owner/repo/commits/${HEAD}/check-runs?check_name=test&filter=latest`);
	});

	// spec: orchestrator/a-rerun-after-a-green-run
	test.each([
		["pending", null],
		["failed", "failure"],
	])("a rerun %s by the read under the locks brings nothing up, records nothing and writes no stop file", (_, conclusion) => {
		const h = host();
		answer(h, conclusion, "github-actions", 2);
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(steps(h)).toEqual(["read", "ff", "build", "hold", "read"]);
		expect(deployed(h)).toBeUndefined();
		expect(stopped(h, "one")).toBeUndefined();
	});

	// spec: orchestrator/a-green-head
	test("a green head is read, fast-forwarded, built, brought up under the locks, pushed and recorded, in that order", () => {
		const h = host();
		expect(existsSync(h.state)).toBe(false);
		const r = deploy(h);
		expect([r.code, r.out.trim().split("\n").at(-1)]).toEqual([0, `deploy: ${HEAD} deployed`]);
		expect(steps(h)).toEqual(["read", "ff", "build", "hold", "read", "up", "prune", "wait", "push"]);
		expect(deployed(h)).toBe(`${HEAD}\n`);
		expect(stopped(h, "one")).toBeUndefined();
		// The gate first, then the repository's lock, each on the descriptor the level holds.
		expect(log(h).filter((l) => l.startsWith("flock "))).toEqual(["flock 9", "flock 9"]);
		expect(existsSync(join(h.locks, "gate.lock"))).toBe(true);
	});

	// spec: orchestrator/a-green-head
	test("the push runs the engine's CLI version on the compose network, with the token mounted read-only", () => {
		const h = host();
		deploy(h);
		const push = log(h).find((l) => /^docker run .*--entrypoint sh/.test(l)) ?? "";
		expect(push).toContain("--network orchestrator_default");
		expect(push).toContain("target=/run/secrets/windmill_deploy_token,readonly");
		expect(push).toContain("sync push --yes --skip-secrets --include-triggers");
		expect(push).not.toContain("--include-schedules");
		expect(push.endsWith(" push 1.846.1")).toBe(true);
	});

	// spec: orchestrator/a-green-head
	test("an engine image with no version tag fails the push and records nothing", () => {
		const h = host();
		set(h, "server", "ghcr.io/windmill-labs/windmill:main");
		const r = deploy(h);
		expect(r.code).toBe(1);
		expect(steps(h)).not.toContain("push");
		expect(stopped(h, "one")).toMatch(STOP("the push"));
	});

	// spec: orchestrator/the-checkout-cannot-fast-forward
	test.each([
		["the merge fails", "merge", "1"],
		// `local`, not `HEAD`: a case-blind filesystem reads that as the `head` file.
		["HEAD is a local commit over the head", "local", "fedcba9876543210fedcba9876543210fedcba98"],
		["a tracked edit under bun/", "status", " M bun/ci-run.ts"],
		["an untracked file under bun/", "status", "?? bun/extra.ts"],
	])("%s: no build, no record, a stop file in each clone, exit 1", (_, file, value) => {
		const h = host();
		set(h, file, value);
		const r = deploy(h);
		expect(r.code).toBe(1);
		expect(steps(h)).toEqual(["read", "ff"]);
		expect(deployed(h)).toBeUndefined();
		for (const clone of ["one", "two"]) expect(stopped(h, clone)).toMatch(STOP("the fast-forward"));
	});

	// spec: orchestrator/the-build-fails
	test("a failed build writes each clone's stop file, records nothing, and the next run deploys again from the start", () => {
		const h = host();
		set(h, "build", 1);
		const r = deploy(h);
		expect(r.code).toBe(1);
		expect(steps(h)).toEqual(["read", "ff", "build"]);
		expect(deployed(h)).toBeUndefined();
		for (const clone of ["one", "two"]) expect(stopped(h, clone)).toMatch(STOP("the build"));
		set(h, "build", 0);
		expect(deploy(h).code).toBe(0);
		expect(deployed(h)).toBe(`${HEAD}\n`);
	});

	// spec: orchestrator/the-build-fails
	test.each([
		["up", "up", "up"],
		["the engine wait", "engine", "the push"],
		["the push", "push", "the push"],
	])("a failed %s writes the stop files naming it and records nothing", (_, file, step) => {
		const h = host();
		set(h, file, 1);
		expect(deploy(h).code).toBe(1);
		expect(deployed(h)).toBeUndefined();
		expect(stopped(h, "two")).toMatch(STOP(step));
	});

	// spec: orchestrator/github-cannot-be-reached
	test.each([
		["the fetch", "fetch", []],
		["the check read", "curl", ["read"]],
	])("%s failing exits 1 with no stop file and no fast-forward", (_, file, expected) => {
		const h = host();
		set(h, file, 1);
		expect(deploy(h).code).toBe(1);
		expect(steps(h)).toEqual(expected);
		expect(stopped(h, "one")).toBeUndefined();
		expect(deployed(h)).toBeUndefined();
	});

	// spec: orchestrator/a-stop-file-already-exists
	test("a clone's stop file that exists as the deploy fails is left as it was", () => {
		const h = host();
		writeFileSync(stopOf(h, "one"), "by hand\n");
		set(h, "build", 1);
		deploy(h);
		expect(stopped(h, "one")).toBe("by hand\n");
		expect(stopped(h, "two")).toMatch(STOP("the build"));
	});
});

const flock = Bun.which("flock") ?? "flock";

describe.skipIf(skip)(`deploy.sh under real locks${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
	// spec: orchestrator/a-pass-is-running-when-main-moves
	test("a held repository lock keeps up waiting until it is released", async () => {
		const h = host();
		const pass = await held(join(h.locks, "owner+repo.lock"));
		const run = started(h, flock);
		await Bun.sleep(1500);
		expect(steps(h)).not.toContain("up");
		pass.kill();
		expect(await run.exited).toBe(0);
		expect(steps(h)).toContain("up");
		expect(deployed(h)).toBe(`${HEAD}\n`);
	}, 20_000);

	// spec: orchestrator/the-runner-is-recreated-under-the-locks
	test("while up runs, another process finds the gate and the repository's lock held", async () => {
		const h = host();
		expect(await started(h, flock).exited).toBe(0);
		const probed = log(h).filter((l) => /^(held|free) /.test(l));
		expect(probed.toSorted()).toEqual(["held gate.lock", "held owner+repo.lock"]);
	}, 20_000);
});
