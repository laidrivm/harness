import { afterAll, describe, expect, test } from "bun:test";
import { closeSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { advance, change, clone, commit, EPERM, lowered, out, records, run, TICKED, trusting } from "./board-loop.fixture.ts";

/** Who may start the runner, and the clone it starts from. [n]: `/zombies` ideas. */

afterAll(cleanup);

/**
 * Whether the pass stood on the default branch at `origin`'s tip when the first
 * session started: the stage session switches to its step's branch, so the
 * clone's state afterwards cannot say.
 */
const fromMain = (dir: string, calls: string) => {
	const lines = calls.split("\n");
	const before = lines.slice(0, lines.findIndex((line) => line.startsWith("claude ")));
	return before.includes("git switch -q main") && out(dir, "rev-parse", "main") === out(dir, "rev-parse", "origin/main");
};

describe("started from a session", () => {
	// spec: board-loop/started-from-an-agent-s-shell board-loop/a-timer-started-inside-a-claude-code-session
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

describe("started by a timer", () => {
	// spec: board-loop/started-with-no-terminal
	// The fixture's environment holds no TERM.
	test("standard input from /dev/null and no TERM end as the default pass does", () => {
		const { dir } = clone();
		const stdin = openSync("/dev/null", "r");
		const r = run(dir, [], {}, { stdin });
		closeSync(stdin);
		expect([r.code, r.last]).toEqual([0, "board-loop: met — apply demo step 1"]);
		expect(records(r.state).map(({ decision, rule }) => [decision, rule])).toEqual([["met", "apply"]]);
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

	/** These [n] number `step-branch-retry`'s `/zombies` ideas. */
	describe("an unpushed tip", () => {
		const TWO = "## 1. A\n\n- [ ] 1.1 a\n\n## 2. B\n\n- [ ] 2.1 b\n";
		/** Cuts `branch` from `HEAD` with one commit no remote holds, and returns its tip. */
		const unpushed = (dir: string, branch: string) => {
			git(dir, "switch", "-qc", branch);
			commit(dir);
			return out(dir, "rev-parse", "HEAD");
		};
		const none = (branch: string) => `unpushed work on ${branch}, which is no step's branch`;

		// spec: board-loop/a-dead-session-s-unpushed-commits
		test("on the step's own branch, the pass goes on from main's tip [13], the branch keeps its tip, and the stage continues it [19]", () => {
			const { dir, origin } = clone();
			const tip = unpushed(dir, "feat/demo");
			advance(origin);
			const r = run(dir);
			expect(r.last).toBe("board-loop: met — apply demo step 1");
			expect(r.text).toContain("leaving feat/demo, unpushed, for the pass that carries its step");
			expect(r.calls).toContain("A session left the branch feat/demo: switch to it with `git switch feat/demo`");
			expect(out(dir, "rev-parse", "feat/demo")).toBe(tip);
			expect(fromMain(dir, r.calls)).toBe(true);
		});

		// spec: board-loop/a-dead-session-s-unpushed-commits
		test("on an answer candidate's step branch, the pass goes on and carries that step", () => {
			const { dir } = clone(change("demo", TICKED));
			unpushed(dir, "feat/demo-2");
			const r = run(dir);
			expect(r.last).toBe("board-loop: met — apply demo step 2");
			expect(r.calls).toContain("A session left the branch feat/demo-2:");
		});

		// spec: board-loop/refused-after-the-switch
		test("on the step's branch, a refusal once the steps are known is back on that branch at its tip", () => {
			const { dir } = clone();
			const tip = unpushed(dir, "feat/demo");
			const r = run(dir, [], { pick: "" });
			expect(r.last).toStartWith("board-loop: refused — the pick session returned not one exact PICK: line");
			expect([out(dir, "branch", "--show-current"), out(dir, "rev-parse", "HEAD")]).toEqual(["feat/demo", tip]);
		});

		// spec: board-loop/unpushed-work board-loop/refused-after-the-switch
		test.each([
			["no step's branch [15][16]", change("demo"), "feat/other", {}, none("feat/other"), false],
			["another step's branch, demo being at step 1 [14]", change("demo", TWO), "feat/demo-2", {}, none("feat/demo-2"), false],
			["no step's branch, with no takeable change [12]", {}, "feat/other", {}, none("feat/other"), false],
			["the step's branch, with gh failing [18]", change("demo"), "feat/demo", { ghCode: 1 }, none("feat/demo"), false],
			["the step's branch, with the install failing", change("demo"), "feat/demo", { install: 1 }, "bun install --frozen-lockfile failed", false],
			["the step's branch, with a local main that cannot fast-forward", change("demo"), "feat/demo", {}, "main cannot fast-forward", true],
		] as const)("on %s is refused, back on that branch at its tip", (_, tree, branch, stubs, why, diverged) => {
			const { dir, origin } = clone(tree);
			if (diverged) {
				commit(dir);
				advance(origin);
			}
			const tip = unpushed(dir, branch);
			const r = run(dir, [], stubs);
			expect(r.last).toStartWith("board-loop: refused");
			expect(r.last).toContain(why);
			expect(r.calls).not.toContain("claude");
			expect([out(dir, "branch", "--show-current"), out(dir, "rev-parse", "HEAD")]).toEqual([branch, tip]);
		});

		/**
		 * Lands the patch of `dir`'s one-commit branch on `origin`'s main from another checkout, as a squash merge
		 * does, after main moved: a parent of its own keeps the commit's id off the branch's.
		 */
		const squashed = (dir: string, origin: string) => {
			advance(origin, { "moved.txt": "x\n" });
			advance(origin, { "note.txt": readFileSync(join(dir, "note.txt"), "utf8") });
		};
		/** Moves `origin`'s main to the branch's own tip, with no remote-tracking branch in `dir` told. */
		const forwarded = (dir: string, origin: string) => git(origin, "fetch", "-q", dir, "feat/other:main");

		// spec: board-loop/a-merged-branch-s-leftover
		test.each([
			["squash-merged after main moved", squashed],
			["fast-forwarded into main", forwarded],
		])("on no step's branch %s, the pass goes on from main and keeps the branch", (_, merge) => {
			const { dir, origin } = clone();
			const tip = unpushed(dir, "feat/other");
			merge(dir, origin);
			const r = run(dir);
			expect(r.last).toBe("board-loop: met — apply demo step 1");
			expect(r.text).toContain("switching off feat/other: origin/main holds its every commit by patch");
			expect(fromMain(dir, r.calls)).toBe(true);
			expect(out(dir, "rev-parse", "feat/other")).toBe(tip);
		});

		// spec: board-loop/a-merged-branch-s-leftover
		test("on a merged branch, a refusal after the switch leaves the clone on main", () => {
			const { dir, origin } = clone();
			unpushed(dir, "feat/other");
			squashed(dir, origin);
			const r = run(dir, [], { install: 1 });
			expect(r.last).toStartWith("board-loop: refused — bun install --frozen-lockfile failed");
			expect(out(dir, "branch", "--show-current")).toBe("main");
		});

		// spec: board-loop/a-merged-branch-s-leftover board-loop/unpushed-work board-loop/an-edited-tracked-file
		test.each([
			["a commit main lacks", (dir: string) => commit(dir)],
			["a tracked edit", (dir: string) => writeFileSync(join(dir, "package.json"), '{"edited": true}\n')],
			// `git cherry` lists no merge: one of main from before the squash leaves the branch's commit
			// matched by patch, and only the merge carries this work.
			[
				"a merge whose resolution main lacks",
				(dir: string) => {
					git(dir, "fetch", "-q", "origin");
					// A merge wants an identity even with `--no-commit`, and CI's runner has none.
					git(dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "merge", "-q", "--no-ff", "--no-commit", "origin/main~1");
					commit(dir, { "resolution.txt": "x\n" });
				},
			],
		])("on a merged branch with %s is refused, on that branch at its tip", (_, add) => {
			const { dir, origin } = clone();
			unpushed(dir, "feat/other");
			squashed(dir, origin);
			add(dir);
			const tip = out(dir, "rev-parse", "HEAD");
			const r = run(dir);
			expect(r.last).toStartWith("board-loop: refused");
			expect(r.calls).not.toContain("claude");
			expect([out(dir, "branch", "--show-current"), out(dir, "rev-parse", "HEAD")]).toEqual(["feat/other", tip]);
		});

		// spec: board-loop/a-session-s-process-group-outlived-it
		// The run blocks bun's own timer, so the case names a limit of its own.
		test("on the step's branch, a session whose group outlived it is refused with the clone left where it is", () => {
			const { dir } = clone();
			unpushed(dir, "feat/demo");
			const r = run(dir, [], {}, { entry: lowered(60_000, EPERM) });
			expect(r.last).toStartWith("board-loop: refused — process group ");
			expect(r.last).toEndWith("; the clone is left as the session left it");
			expect(r.calls).not.toContain("git switch -q feat/demo");
			expect(out(dir, "branch", "--show-current")).toBe("main");
		}, 40_000);

		// spec: board-loop/unpushed-work-on-a-detached-head
		test("on a detached HEAD is refused before any fetch [17]", () => {
			const { dir } = clone();
			git(dir, "switch", "-q", "--detach");
			commit(dir);
			const tip = out(dir, "rev-parse", "HEAD");
			const r = run(dir);
			expect(r.last).toStartWith("board-loop: refused — HEAD names no branch");
			expect(r.last).toContain("unpushed");
			expect(r.calls).not.toContain("git fetch");
			expect(out(dir, "rev-parse", "HEAD")).toBe(tip);
		});
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
		expect(fromMain(dir, r.calls)).toBe(true);
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
