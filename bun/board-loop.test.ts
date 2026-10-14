import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { advance, clone, commit, out, records, run } from "./board-loop.fixture.ts";

/** Who may start the runner, the clone it starts from, and the install. [n]: `/zombies` ideas. */

afterAll(cleanup);

/** The position of the first logged call that starts with `call`. */
const at = (calls: string, call: string) =>
	calls.split("\n").findIndex((line) => line.startsWith(call));

describe("started from a session", () => {
	// spec: board-loop/started-from-an-agent-s-shell
	test.each([
		["set [1]", "1"],
		["empty [2]", ""],
	])("CLAUDECODE %s refuses before any command runs", (_, value) => {
		const { dir } = clone();
		const r = run(dir, ["demo"], {}, { env: { CLAUDECODE: value } });
		expect(r.code).toBe(1);
		expect(r.last).toContain("from a terminal of your own");
		expect(r.calls).toBe("");
	});
});

describe("the clone", () => {
	// spec: board-loop/an-edited-tracked-file
	test("a tracked edit refuses [3]", () => {
		const { dir } = clone();
		writeFileSync(join(dir, "package.json"), '{"edited": true}\n');
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.calls).not.toContain("claude");
	});

	// spec: board-loop/an-edited-tracked-file
	test("an untracked file alone does not refuse [3]", () => {
		const { dir } = clone();
		writeFileSync(join(dir, "scratch.txt"), "x\n");
		expect(run(dir).last).toStartWith("board-loop: met");
	});

	// spec: board-loop/unpushed-work
	test("an unpushed tip refuses and leaves the branch checked out [4]", () => {
		const { dir } = clone();
		git(dir, "switch", "-qc", "feat/demo");
		commit(dir);
		const tip = out(dir, "rev-parse", "HEAD");
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain("unpushed");
		const after = [out(dir, "branch", "--show-current"), out(dir, "rev-parse", "HEAD")];
		expect(after).toEqual(["feat/demo", tip]);
	});

	// spec: board-loop/the-previous-pass-s-step-branch
	test("a pushed step branch is switched off to the default branch's tip [5]", () => {
		const { dir, origin } = clone();
		git(dir, "switch", "-qc", "feat/demo");
		commit(dir);
		git(dir, "push", "-q", "origin", "feat/demo");
		advance(origin);
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: met");
		expect(out(dir, "branch", "--show-current")).toBe("main");
		expect(out(dir, "rev-parse", "HEAD")).toBe(out(dir, "rev-parse", "origin/main"));
	});

	// spec: board-loop/the-previous-pass-s-step-branch
	test.each([
		["diverged from", true, "cannot fast-forward"],
		["only ahead of", false, "holds commits origin/main lacks"],
	])("a local main %s origin refuses, merging and resetting nothing [6]", (_, moved, why) => {
		const { dir, origin } = clone();
		commit(dir);
		const local = out(dir, "rev-parse", "main");
		git(dir, "switch", "-qc", "feat/demo", "origin/main");
		git(dir, "push", "-q", "origin", "feat/demo");
		if (moved) advance(origin);
		const r = run(dir);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain(why);
		expect(out(dir, "rev-parse", "main")).toBe(local);
		expect(r.calls).not.toContain("claude");
	});
});

describe("the install", () => {
	// spec: board-loop/the-install-fails
	test("a failing install refuses, prints its output and starts no session [30]", () => {
		const { dir } = clone();
		const r = run(dir, ["demo"], { install: 1 });
		expect(r.code).toBe(1);
		expect(r.text).toContain("the install says this");
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.calls).not.toContain("claude");
		expect(records(r.state).map((x) => x.decision)).toEqual(["refused"]);
	});

	// spec: board-loop/the-pin-moved-on-the-default-branch
	test("the install runs after the fast-forward and before the session [31]", () => {
		const { dir, origin } = clone();
		advance(origin, { "bun.lock": "moved\n" });
		const { calls } = run(dir);
		const order = [
			at(calls, "git merge --ff-only"),
			at(calls, "bun install --frozen-lockfile"),
			at(calls, "claude"),
		];
		expect(order.every((n) => n >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	// spec: board-loop/the-pin-moved-on-the-default-branch
	test("the install runs on a pass whose fast-forward brought nothing [31]", () => {
		const { dir } = clone();
		expect(run(dir).calls).toContain("bun install --frozen-lockfile");
	});
});
