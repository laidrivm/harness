import { afterAll, describe, expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { advance, clone, commit, out, records, run, trusting } from "./board-loop.fixture.ts";

/** Who may start the runner, and the clone it starts from. [n]: `/zombies` ideas. */

afterAll(cleanup);

describe("started from a session", () => {
	// spec: board-loop/started-from-an-agent-s-shell
	test.each([
		["set [1]", "1"],
		["empty [2]", ""],
	])("CLAUDECODE %s refuses before any command runs", (_, value) => {
		const { dir } = clone();
		const r = run(dir, [], {}, { env: { CLAUDECODE: value } });
		expect(r.code).toBe(1);
		expect(r.last).toContain("from a terminal of your own");
		expect(r.calls).toBe("");
	});
});

describe("the clone", () => {
	// spec: board-loop/an-untrusted-clone
	// Claude Code ignores the tracked `permissions.allow` in a folder nobody trusted.
	test.each([
		["no ~/.claude.json", () => null],
		["a ~/.claude.json that is not JSON", () => "{"],
		["the trust dialog not accepted", (dir: string) => trusting(dir).replace("true", "false")],
		["only a parent directory trusted", (dir: string) => trusting(dirname(dir))],
	])("an untrusted clone refuses before fetching: %s", (_, json) => {
		const { dir } = clone();
		const r = run(dir, [], {}, { claudeJson: json(dir) });
		expect(r.code).toBe(1);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain(`run claude once in ${realpathSync(dir)}, accept the trust dialog`);
		expect(r.calls).not.toContain("git fetch");
		expect(r.calls).not.toContain("claude");
		expect(records(r.state).map((x) => x.decision)).toEqual(["refused"]);
	});

	test("trust is read from CLAUDE_CONFIG_DIR when it is set, not the home", () => {
		const { dir } = clone();
		const config = emptyDir("board-loop-config-");
		writeFileSync(join(config, ".claude.json"), trusting(dir));
		const r = run(dir, [], {}, { claudeJson: null, env: { CLAUDE_CONFIG_DIR: config } });
		expect(r.last).toStartWith("board-loop: met");
	});

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
