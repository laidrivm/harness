import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import {
	deploy,
	deployed,
	failure,
	failureOf,
	HEAD,
	host,
	log,
	moved,
	rolledBack,
	STOP,
	set,
	steps,
	stopped,
} from "./deploy.fixture.ts";

/** `deploy.sh` and the persistent session: the fresh-session mark, the restart, the wait for `main`, the rollback. */

afterAll(cleanup);

const sleeps = (h: ReturnType<typeof host>) => log(h).filter((l) => l === "sleep 5").length;

describe("deploy.sh and the session", () => {
	// spec: orchestrator/a-session-at-work
	test("without the fresh-session mark a built head recreates nothing, records nothing, prunes, exits 0, and the next tick deploys it", () => {
		const h = host();
		rmSync(join(h.agent, ".harness-fresh"));
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(r.out).toContain(`deploy: the session is at work; ${HEAD} waits for a fresh one`);
		expect(steps(h)).toEqual(["read", "ff", "tag", "build", "prune"]);
		expect(deployed(h)).toBeUndefined();
		writeFileSync(join(h.agent, ".harness-fresh"), "");
		expect(deploy(h).code).toBe(0);
		expect(deployed(h)).toBe(`${HEAD}\n`);
	});

	// spec: orchestrator/a-session-at-work
	test("a message during the hold or the second read brings nothing up and leaves an older failure file", () => {
		const h = host();
		writeFileSync(failureOf(h), "an older failure\n");
		set(h, "unmark.2", "");
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(steps(h)).toEqual(["read", "ff", "tag", "build", "hold", "read"]);
		expect(failure(h)).toBe("an older failure\n");
		expect(deployed(h)).toBeUndefined();
	});

	// spec: orchestrator/a-fresh-session
	test("with the mark the stack comes up and the deploy waits for main before it records", () => {
		const h = host();
		expect(deploy(h).code).toBe(0);
		expect(steps(h).slice(3, 8)).toEqual(["build", "hold", "read", "up", "session"]);
		expect(deployed(h)).toBe(`${HEAD}\n`);
	});

	// spec: orchestrator/a-fresh-session
	test("the tag names the image of the runner container, before the build", () => {
		const h = host();
		deploy(h);
		expect(log(h)).toContain("docker tag sha256:old orchestrator-runner:previous");
		expect(steps(h).slice(2, 4)).toEqual(["tag", "build"]);
	});

	// spec: orchestrator/a-fresh-session
	test("with no runner container the image the name holds is tagged and the stack comes up", () => {
		const h = host();
		set(h, "id", "");
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(log(h)).toContain("docker tag orchestrator-runner orchestrator-runner:previous");
		expect(steps(h)).not.toContain("restart");
		expect(deployed(h)).toBe(`${HEAD}\n`);
	});

	// spec: orchestrator/an-unchanged-image
	test.each([
		["recreated by up", false],
		["left as it was by up", true],
	])("a runner %s is restarted only when up kept it", (_, kept) => {
		const h = host();
		if (kept) set(h, "kept", "");
		expect(deploy(h).code).toBe(0);
		expect(steps(h).includes("restart")).toBe(kept);
		if (kept) expect(steps(h).slice(6, 9)).toEqual(["up", "restart", "session"]);
	});

	// spec: orchestrator/an-unchanged-image
	test("a failed restart writes the failure file naming it and records nothing", () => {
		const h = host();
		set(h, "kept", "");
		set(h, "restart", 1);
		expect(deploy(h).code).toBe(1);
		expect(failure(h)).toMatch(STOP("the restart"));
		expect(deployed(h)).toBeUndefined();
	});

	// spec: orchestrator/the-session-comes-back
	test("main up at the third poll records the head, and the old failure file is gone before up", () => {
		const h = host();
		writeFileSync(failureOf(h), "an older failure\n");
		set(h, "session", 1);
		set(h, "session.3", 0);
		expect(deploy(h).code).toBe(0);
		expect(sleeps(h)).toBe(2);
		expect(deployed(h)).toBe(`${HEAD}\n`);
		expect(failure(h)).toBeUndefined();
		expect(log(h)).not.toContain("up with the failure file");
		expect(rolledBack(h)).toBeUndefined();
	});

	// spec: orchestrator/the-session-comes-back
	test("main up at the 25th poll, after 120 s, still records the head", () => {
		const h = host();
		set(h, "session", 1);
		set(h, "session.25", 0);
		expect(deploy(h).code).toBe(0);
		expect(sleeps(h) * 5).toBe(120);
		expect(deployed(h)).toBe(`${HEAD}\n`);
		expect(rolledBack(h)).toBeUndefined();
	});

	// spec: orchestrator/the-session-does-not-come-back
	test("main not up within two minutes: the failure file and rolled-back written, then the tag back and up runner, exit 1", () => {
		const h = host();
		set(h, "session", 1);
		const r = deploy(h);
		expect(r.code).toBe(1);
		expect(sleeps(h) * 5).toBe(120);
		expect(steps(h).slice(-3)).toEqual(["session", "back", "up"]);
		expect(log(h).slice(-3)).toEqual([
			"docker compose up -d runner",
			"up with the failure file",
			"up with rolled-back",
		]);
		expect(rolledBack(h)).toBe(`${HEAD}\n`);
		expect(failure(h)).toMatch(STOP("the wait for main"));
		expect(deployed(h)).toBeUndefined();
		expect(steps(h)).not.toContain("push");
	});

	// spec: orchestrator/the-rollback-fails
	test.each([
		["the tag back", "back", ["session", "back"]],
		["the rollback's up", "rollup", ["session", "back", "up"]],
	])("%s failing names it in the failure file, keeps rolled-back, and no later run retries", (step, file, tail) => {
		const h = host();
		set(h, "session", 1);
		set(h, file, 1);
		expect(deploy(h).code).toBe(1);
		expect(steps(h).slice(-tail.length)).toEqual(tail);
		expect(failure(h)).toMatch(STOP(step));
		expect(rolledBack(h)).toBe(`${HEAD}\n`);
		const before = log(h).length;
		expect(deploy(h).code).toBe(0);
		expect(moved(h, before)).toEqual([]);
	});

	// spec: orchestrator/the-rolled-back-record-cannot-be-written
	// spec: orchestrator/the-rollback-fails-without-its-record
	test.each([
		["the wait for main", undefined, ["session", "back", "up"]],
		["the tag back", "back", ["session", "back"]],
		["the rollback's up", "rollup", ["session", "back", "up"]],
	])("with rolled-back unwritable, %s and the record are named, and the next run deploys again", (step, file, tail) => {
		const h = host();
		mkdirSync(join(h.state, "rolled-back"), { recursive: true });
		set(h, "session", 1);
		if (file) set(h, file, 1);
		const r = deploy(h);
		expect(r.code).toBe(1);
		expect(r.out).toContain(`deploy: ${HEAD} could not be recorded as rolled back`);
		expect(steps(h).slice(-tail.length)).toEqual(tail);
		expect(failure(h)).toMatch(STOP(`${step} and the rolled-back record`));
		// A stop file keeps the first failure line, so the record is written before it.
		expect(stopped(h, "one")).toMatch(STOP("the wait for main and the rolled-back record"));
		expect(deployed(h)).toBeUndefined();
		const before = log(h).length;
		deploy(h);
		expect(moved(h, before)).toContain("git merge -q --ff-only origin/main");
	});

	// spec: orchestrator/a-failure-after-main-is-up
	// Pins what the prompt hook relies on; deploy.sh is unchanged for it.
	test("a push failing after main is up leaves the failure file after the start, and a retry while fresh leaves it again", () => {
		const h = host();
		set(h, "push", 1);
		expect(deploy(h).code).toBe(1);
		expect(failure(h)).toMatch(STOP("the push"));
		expect(steps(h).slice(-4)).toEqual(["up", "session", "wait", "push"]);
		expect(deployed(h)).toBeUndefined();
		// Read by the session's hook in between; the retry writes it anew.
		writeFileSync(failureOf(h), "reported\n");
		const before = log(h).length;
		expect(deploy(h).code).toBe(1);
		const retry = log(h).slice(before);
		expect(retry).toContain("docker compose up -d");
		expect(retry).not.toContain("up with the failure file");
		expect(retry.some((l) => /^docker run .*--entrypoint sh/.test(l))).toBe(true);
		expect(failure(h)).toMatch(STOP("the push"));
	});

	// spec: orchestrator/the-build-fails
	test("a symlink planted at the failure file is replaced, never followed", () => {
		const h = host();
		const target = join(h.fake, "host-file");
		writeFileSync(target, "root's\n");
		symlinkSync(target, failureOf(h));
		set(h, "build", 1);
		expect(deploy(h).code).toBe(1);
		expect(readFileSync(target, "utf8")).toBe("root's\n");
		expect(lstatSync(failureOf(h)).isSymbolicLink()).toBe(false);
		expect(failure(h)).toMatch(STOP("the build"));
	});

	// spec: orchestrator/a-rolled-back-head
	test("a head equal to the rolled-back one reads no check, moves nothing and exits 0", () => {
		const h = host();
		mkdirSync(h.state, { recursive: true });
		writeFileSync(join(h.state, "rolled-back"), `${HEAD}\n`);
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(r.out).toContain(`deploy: ${HEAD} was rolled back`);
		expect(moved(h)).toEqual([]);
	});

	// spec: orchestrator/the-deploy-token-is-absent
	test("without the token file no engine wait and no push run, the journal says so, and the head is recorded", () => {
		const h = host();
		rmSync(join(h.dir, "secrets/windmill_deploy_token"));
		const r = deploy(h);
		expect(r.code).toBe(0);
		expect(r.out).toContain("deploy: no secrets/windmill_deploy_token; the Windmill push is skipped");
		expect(steps(h)).not.toContain("wait");
		expect(steps(h)).not.toContain("push");
		expect(steps(h).at(-1)).toBe("prune");
		expect(deployed(h)).toBe(`${HEAD}\n`);
		expect(existsSync(failureOf(h))).toBe(false);
	});
});
