import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";

/**
 * The environment a board-loop session starts with. `session()` is driven
 * straight from an entry module, since the runner refuses to start at all
 * where `CLAUDECODE` is set. [n]: `github-app-identity`'s `/zombies` ideas.
 */

afterAll(cleanup);

const module = join(import.meta.dir, "board-loop-session.ts");

/**
 * What the stub `claude` saw as its environment, the pick's (`capture`) or the
 * stage's, beside the `PATH` and `HOME` the session was started with.
 */
function seen(capture: boolean, env: Record<string, string>) {
	const dir = emptyDir("board-loop-env-");
	const file = join(dir, "env");
	// `PATH` names this directory alone, hence the absolute path.
	writeFileSync(join(dir, "claude"), `#!/bin/sh\n/usr/bin/env > '${file}'\n`);
	chmodSync(join(dir, "claude"), 0o755);
	const entry = join(dir, "entry.ts");
	writeFileSync(
		entry,
		`import { session } from ${JSON.stringify(module)};\nawait session("PICK", 60_000, process.kill, ${capture});\n`,
	);
	const given = { PATH: dir, HOME: emptyDir("board-loop-home-") };
	const run = Bun.spawnSync([process.execPath, entry], { cwd: emptyDir("board-loop-cwd-"), env: { ...given, ...env } });
	expect(run.exitCode).toBe(0);
	const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
	const split = (line: string) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const;
	return { env: new Map(lines.map(split)), given };
}

const SECRETS = {
	GH_TOKEN: "",
	GITHUB_TOKEN: "ghs_runner",
	GH_ENTERPRISE_TOKEN: "ghe_runner",
	SSH_AUTH_SOCK: "/tmp/agent.sock",
	HARNESS_GITHUB_APP_ID: "12345",
	HARNESS_GITHUB_APP_KEY: "/home/runner/app.pem",
	CLAUDECODE: "1",
	CLAUDE_PROJECT_DIR: "/elsewhere",
	SOME_OTHER_VARIABLE: "unlisted",
};

describe.each([
	["the pick session", true],
	["the stage session", false],
])("%s's environment", (_, capture) => {
	// spec: board-loop/a-token-in-the-runner-s-environment
	test.each(Object.keys(SECRETS))("holds no %s, empty or not [10–14]", (name) => {
		expect(seen(capture, SECRETS).env.has(name)).toBe(false);
	});

	// spec: board-loop/what-a-session-needs
	test("passes PATH, HOME, XDG_STATE_HOME and every LC_* unchanged, and no XLC_ALL [15][16]", () => {
		const state = emptyDir("board-loop-state-");
		const { env, given } = seen(capture, { XDG_STATE_HOME: state, LC_ALL: "C", LC_CTYPE: "en_GB.UTF-8", XLC_ALL: "x" });
		expect(["PATH", "HOME", "XDG_STATE_HOME", "LC_ALL", "LC_CTYPE", "XLC_ALL"].map((name) => env.get(name))).toEqual([
			given.PATH,
			given.HOME,
			state,
			"C",
			"en_GB.UTF-8",
			undefined,
		]);
	});

	// spec: board-loop/what-a-session-needs
	test("passes Claude's own credential, which the session cannot run without", () => {
		const { env } = seen(capture, { CLAUDE_CODE_OAUTH_TOKEN: "oauth", ANTHROPIC_API_KEY: "key" });
		expect([env.get("CLAUDE_CODE_OAUTH_TOKEN"), env.get("ANTHROPIC_API_KEY")]).toEqual(["oauth", "key"]);
	});
});
