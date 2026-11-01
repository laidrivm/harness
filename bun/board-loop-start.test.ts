import { afterAll, describe, expect, test } from "bun:test";
import { closeSync, openSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { clone, records, run, trusting } from "./board-loop.fixture.ts";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";

/** Who may start the runner, and the trust and tracked-edit checks on its clone. [n]: `/zombies` ideas. */

afterAll(cleanup);

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
});
