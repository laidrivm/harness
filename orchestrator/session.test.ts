import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";

/**
 * The persistent session's start script (`session-runner-image` design, *The start script*), run
 * under sh and dash with a temporary `HOME` and stubs for git, bun, claude and sleep that log each
 * call; the second `claude` ends the loop by killing the script.
 */

afterAll(cleanup);

const script = join(import.meta.dir, "runner/session.sh");

/** The script under `shell`, with a clone in `HOME` unless `clone` is false, and git, bun or claude failing when asked. */
function run(
	shell: string,
	opts: { clone?: boolean | "worktree"; failGit?: boolean; failBun?: boolean; failClaude?: boolean } = {},
) {
	const home = emptyDir("orchestrator-session-");
	const bin = join(home, "bin");
	mkdirSync(bin);
	if (opts.clone === "worktree") {
		mkdirSync(join(home, "harness"));
		writeFileSync(join(home, "harness", ".git"), "gitdir: /elsewhere\n");
	} else if (opts.clone !== false) mkdirSync(join(home, "harness", ".git"), { recursive: true });
	const log = join(home, "calls.log");
	const stub = (name: string, body = "") =>
		writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $* @$(pwd)" >>"${log}"\n${body}`, { mode: 0o755 });
	// git records the variable that keeps a failed credential from waiting on a prompt.
	stub(
		"git",
		`echo "git sees GIT_TERMINAL_PROMPT=\${GIT_TERMINAL_PROMPT-unset}" >>"${log}"\n${opts.failGit ? "exit 1\n" : ""}`,
	);
	stub("bun", opts.failBun ? "exit 1\n" : "");
	stub("sleep");
	// Records the two variables, ends the loop on its second start, and otherwise exits as asked.
	stub(
		"claude",
		`echo "env GIT_TERMINAL_PROMPT=\${GIT_TERMINAL_PROMPT-unset} DISABLE_AUTOUPDATER=\${DISABLE_AUTOUPDATER-unset} LANG=\${LANG-unset}" >>"${log}"\n[ "$(grep -c '^claude ' "${log}")" -lt 2 ] || kill "$PPID"\n${opts.failClaude ? "exit 1\n" : ""}`,
	);
	const r = Bun.spawnSync([shell, script], {
		env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: home },
		timeout: 10_000,
	});
	let calls: string[] = [];
	try {
		calls = readFileSync(log, "utf8").split("\n").slice(0, -1);
	} catch {}
	// Each call with its directory named relative to HOME.
	return { calls: calls.map((c) => c.replace(` @${home}`, " @~")), out: r.stdout.toString() + r.stderr.toString() };
}

// Built from parts, so remoteControl()'s scan of the tree does not read this file as a starter.
const START = `claude ${"-".repeat(2)}remote-control harness`;

const round = [
	"git pull --ff-only @~/harness",
	"git sees GIT_TERMINAL_PROMPT=0",
	"bun install --frozen-lockfile @~/harness",
	`${START} @~/harness`,
	"env GIT_TERMINAL_PROMPT=0 DISABLE_AUTOUPDATER=1 LANG=C.UTF-8",
];

for (const shell of ["sh", "dash"])
	describe(`the start script under ${shell}`, () => {
		// spec: orchestrator/claude-code-exits
		test("with a clone, pulls, installs and starts claude with Remote Control named harness, then sleeps 5 and does it again, never --continue", () => {
			const { calls } = run(shell);
			expect(calls).toEqual([...round, "sleep 5 @~/harness", ...round]);
			expect(calls.join("\n")).not.toContain("--continue");
		});

		// spec: orchestrator/claude-code-exits
		test("a claude that crashes, exiting non-zero, is followed by the pause and a second round", () => {
			expect(run(shell, { failClaude: true }).calls).toEqual([...round, "sleep 5 @~/harness", ...round]);
		});

		// spec: orchestrator/the-pull-fails
		test("a failing pull prints its line, and claude still starts", () => {
			const { calls, out } = run(shell, { failGit: true });
			expect(out).toContain("session: git pull failed; starting claude anyway");
			expect(calls.slice(0, 4)).toEqual(round.slice(0, 4));
		});

		// spec: orchestrator/the-install-fails
		test("a failing install prints its line, and claude still starts", () => {
			const { calls, out } = run(shell, { failBun: true });
			expect(out).toContain("session: bun install failed; starting claude anyway");
			expect(calls.slice(0, 4)).toEqual(round.slice(0, 4));
		});

		// spec: orchestrator/no-clone-yet
		test("with no clone, neither git nor bun runs, and claude starts in HOME", () => {
			const { calls } = run(shell, { clone: false });
			expect(calls.filter((c) => /^(?:git|bun) /.test(c))).toEqual([]);
			expect(calls[0]).toBe(`${START} @~`);
		});

		test("a clone whose .git is a file, as a worktree's is, is pulled and installed", () => {
			expect(run(shell, { clone: "worktree" }).calls.slice(0, 4)).toEqual(round.slice(0, 4));
		});
	});
