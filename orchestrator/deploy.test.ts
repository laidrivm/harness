import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import {
	answer,
	deploy,
	deployed,
	failure,
	HEAD,
	host,
	log,
	moved,
	page,
	rule,
	STOP,
	set,
	started,
	steps,
	stopOf,
	stopped,
} from "./deploy.fixture.ts";
import { held, skip } from "./pass.fixture.ts";

/** `deploy.sh` against a fabricated host (`deploy.fixture.ts`); the session's cases are `deploy-session.test.ts`. */

afterAll(cleanup);

describe("deploy.sh", () => {
	// spec: orchestrator/main-has-not-moved
	test("a head equal to the recorded one reads no check, moves nothing and exits 0", () => {
		const h = host();
		deploy(h);
		const before = log(h).length;
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(moved(h, before)).toEqual([]);
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

	// spec: orchestrator/an-older-check-suite-s-success
	test.each([
		["failed", "failure"],
		["pending", null],
	])("an older suite's success and a newer %s run move nothing and exit 0", (_, newer) => {
		const h = host();
		set(
			h,
			"runs",
			page([
				{ id: 9, conclusion: newer },
				{ id: 5, conclusion: "success" },
			]),
		);
		expect(deploy(h).code).toBe(0);
		expect(steps(h)).toEqual(["read"]);
		expect(deployed(h)).toBeUndefined();
	});

	// spec: orchestrator/a-newer-check-suite-s-success
	test("an older suite's failure and a newer success deploy the head", () => {
		const h = host();
		set(
			h,
			"runs",
			page([
				{ id: 5, conclusion: "failure" },
				{ id: 9, conclusion: "success" },
			]),
		);
		expect(deploy(h).code).toBe(0);
		expect(deployed(h)).toBe(`${HEAD}\n`);
	});

	// spec: orchestrator/check-runs-on-more-than-one-page
	test("a newer failure on the second page after an older success on the first moves nothing, both pages read", () => {
		const h = host();
		set(h, "runs.1", page([{ id: 5, conclusion: "success" }], 2));
		set(h, "runs.2", page([{ id: 9, conclusion: "failure" }], 2));
		expect(deploy(h).code).toBe(0);
		expect(steps(h)).toEqual(["read"]);
		const reads = log(h).filter((l) => l.startsWith("curl "));
		expect(reads.map((l) => l.match(/&per_page=100&page=(\d+)$/)?.[1])).toEqual(["1", "2"]);
	});

	// spec: orchestrator/check-runs-on-more-than-one-page
	test.each([
		[
			"a second page with no runs while the count is short",
			() => page([{ id: 5, conclusion: "success" }], 2),
			() => page([], 2),
		],
		// It adds no page, so asking for the next would read forever.
		["an empty first body", () => "", () => page([{ id: 5, conclusion: "success" }])],
	])("%s reads as a check that cannot be read", (_, first, second) => {
		const h = host();
		set(h, "runs.1", first());
		set(h, "runs.2", second());
		const r = deploy(h);
		expect(r.code).toBe(1);
		expect(r.out).toContain("could not be read");
		expect(steps(h)).toEqual(["read"]);
		expect(failure(h)).toBeUndefined();
	});

	// spec: orchestrator/an-image-older-than-the-check
	test.each([
		["exits 1 reads as not passed", 1, 0, "has not passed"],
		["exits 2 reads as a check that cannot be read", 2, 1, "could not be read"],
		["is missing reads as a check that cannot be read", undefined, 1, "could not be read"],
	])("the checkout's rule decides, whatever the image holds: a rule that %s", (_, exit, code, said) => {
		const h = host();
		if (exit === undefined) rmSync(rule(h));
		else writeFileSync(rule(h), `process.exit(${exit});\n`);
		const r = deploy(h);
		expect([r.code, r.out]).toEqual([code, expect.stringContaining(said)]);
		expect(steps(h)).toEqual(["read"]);
	});

	// spec: orchestrator/an-image-older-than-the-check
	test("the read runs the checkout's rule mounted read-only, never the image's copy", () => {
		const h = host();
		deploy(h);
		const read = log(h).find((l) => /^docker run .*--entrypoint bun/.test(l)) ?? "";
		expect(read).toContain(`--mount type=bind,source=${rule(h)},target=/green-run.ts,readonly`);
		expect(read.endsWith(" orchestrator-runner /green-run.ts")).toBe(true);
		expect(read).not.toContain("/opt/orchestrator");
	});

	// spec: orchestrator/the-head-s-test-check-has-not-passed
	test("the read names the head's latest test runs", () => {
		const h = host();
		deploy(h);
		const read = log(h).find((l) => l.startsWith("curl "));
		expect(read).toContain(
			`https://api.github.com/repos/owner/repo/commits/${HEAD}/check-runs?check_name=test&filter=latest`,
		);
	});

	// spec: orchestrator/a-rerun-after-a-green-run
	test.each([
		["pending", null],
		["failed", "failure"],
	])(
		"a rerun %s by the read under the locks brings nothing up, records nothing and writes no stop file",
		(_, conclusion) => {
			const h = host();
			answer(h, conclusion, "github-actions", 2);
			const r = deploy(h);
			expect(r.code).toBe(0);
			expect(steps(h)).toEqual(["read", "ff", "tag", "build", "hold", "read"]);
			expect(deployed(h)).toBeUndefined();
			expect(stopped(h, "one")).toBeUndefined();
		},
	);

	// spec: orchestrator/a-green-head
	test("a green head is read, fast-forwarded, tagged, built, brought up under the locks, waited for, pushed, recorded and pruned, in that order", () => {
		const h = host();
		expect(existsSync(h.state)).toBe(false);
		const r = deploy(h);
		expect([r.code, r.out.trim().split("\n").at(-1)]).toEqual([0, `deploy: ${HEAD} deployed`]);
		expect(steps(h)).toEqual(["read", "ff", "tag", "build", "hold", "read", "up", "session", "wait", "push", "prune"]);
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
	test("a failed build writes the failure file and each clone's stop file, records nothing, and the next run deploys again from the start", () => {
		const h = host();
		set(h, "build", 1);
		const r = deploy(h);
		expect(r.code).toBe(1);
		expect(steps(h)).toEqual(["read", "ff", "tag", "build"]);
		expect(deployed(h)).toBeUndefined();
		expect(failure(h)).toMatch(STOP("the build"));
		for (const clone of ["one", "two"]) expect(stopped(h, clone)).toMatch(STOP("the build"));
		set(h, "build", 0);
		expect(deploy(h).code).toBe(0);
		expect(deployed(h)).toBe(`${HEAD}\n`);
	});

	// spec: orchestrator/the-build-fails
	test.each([
		["tag", "tag", "the tag"],
		["up", "up", "up"],
		["the engine wait", "engine", "the push"],
		["the push", "push", "the push"],
	])("a failed %s writes the failure file and the stop files naming it and records nothing", (_, file, step) => {
		const h = host();
		set(h, file, 1);
		expect(deploy(h).code).toBe(1);
		expect(deployed(h)).toBeUndefined();
		expect(failure(h)).toMatch(STOP(step));
		expect(stopped(h, "two")).toMatch(STOP(step));
	});

	// spec: orchestrator/github-cannot-be-reached
	test.each([
		["the fetch", "fetch", []],
		["the check read", "curl", ["read"]],
	])("%s failing exits 1 with no failure file, no stop file and no fast-forward", (_, file, expected) => {
		const h = host();
		set(h, file, 1);
		expect(deploy(h).code).toBe(1);
		expect(steps(h)).toEqual(expected);
		expect(failure(h)).toBeUndefined();
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

describe.skipIf(skip)(
	`deploy.sh under real locks${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`,
	() => {
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
	},
);
