import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "../bun/diff-budget.fixture.ts";
import { APP, CLAUDE, clone, GH, host, passEnv, release, running, skip, tick } from "./pass.fixture.ts";

/** The environment `pass.sh` starts the pass with, against a fabricated host (`pass.fixture.ts`). [n]: `/zombies` ideas. */

afterAll(cleanup);

describe.skipIf(skip)(`pass.sh's pass environment${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
	// spec: orchestrator/the-host-s-other-variables
	// spec: orchestrator/the-pass-s-environment orchestrator/the-app-s-settings-reach-the-pass
	test("holds only the allowlisted names, the App's two settings and no GitHub token or key path [16]", () => {
		const h = host();
		clone(h, "repo");
		// A token file left on the host is never opened.
		writeFileSync(join(h.secrets, "gh_token"), `${GH}\n`);
		const seen = passEnv(tick(h, "repo", { PASS_SENTINEL: "host", HARNESS_GITHUB_APP_KEY: "/k.pem", GH_TOKEN: GH }).out);
		// PWD, SHLVL and _ are the shell's own, set by the `bash -c` that reads the token.
		const shell = ["PWD", "SHLVL", "_"];
		expect(Object.keys(seen).filter((k) => !shell.includes(k)).sort()).toEqual([
			"CLAUDE_CODE_OAUTH_TOKEN",
			"DISABLE_AUTOUPDATER",
			"GH_CONFIG_DIR",
			...Object.keys(APP),
			"HOME",
			"LANG",
			"PATH",
		]);
		expect(seen.CLAUDE_CODE_OAUTH_TOKEN).toBe(CLAUDE);
		expect(JSON.stringify(seen)).not.toContain(GH);
	});

	// spec: orchestrator/a-login-stored-in-the-runner-s-home
	test("gh reads an empty directory of the pass's, never a login in the runner's home, and it goes with the pass", () => {
		const h = host();
		clone(h, "repo");
		mkdirSync(join(h.home, ".config/gh"), { recursive: true });
		writeFileSync(join(h.home, ".config/gh/hosts.yml"), "github.com:\n  oauth_token: stored\n");
		const dir = passEnv(tick(h, "repo").out).GH_CONFIG_DIR;
		expect(dir).toStartWith(`${h.state}/`);
		expect(existsSync(dir)).toBe(false);
	});

	// spec: orchestrator/the-tokens-stay-out-of-process-arguments
	test("no process's arguments hold the token while the runner runs [40]", async () => {
		const h = host();
		clone(h, "repo", { hold: true });
		const p = await running(h, "repo");
		const ps = Bun.spawnSync(["ps", "-A", "-ww", "-o", "args="]).stdout.toString();
		await release(h, "repo", p);
		expect(ps).toContain("board-loop.ts");
		expect(ps).not.toContain(CLAUDE);
	}, 20_000);

	// spec: orchestrator/started-from-a-claude-code-session
	test.each([
		["set", { CLAUDECODE: "1" }, "1"],
		["empty", { CLAUDECODE: "" }, ""],
		["unset", {}, undefined],
	])("CLAUDECODE %s reaches the pass as it reached the wrapper [17]", (_, extra, value) => {
		const h = host();
		clone(h, "repo");
		expect(passEnv(tick(h, "repo", extra).out).CLAUDECODE).toBe(value);
	});
});
