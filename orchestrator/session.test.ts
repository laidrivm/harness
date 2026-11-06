import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { MARKETPLACE } from "../bun/settings.ts";

/**
 * The persistent session's start script (`session-runner-image` design, *The start script*), run
 * under sh and dash with a temporary `HOME` and stubs for git, bun, claude and sleep that log each
 * call; the second `claude` ends the loop by killing the script.
 */

afterAll(cleanup);

const script = join(import.meta.dir, "runner/session.sh");

/**
 * The script under `shell`, with a clone in `HOME` unless `clone` is false, git, bun or claude
 * failing when asked, and a conversation Claude Code keeps for the clone unless `conversation`
 * names `HOME` instead or is false. `linkHome` reaches `HOME` through a symlink; `configDir` keeps
 * Claude Code's files under `CLAUDE_CONFIG_DIR` rather than `~/.claude`. `failPlugin` names the
 * `claude plugin` subcommand that fails.
 */
function run(
	shell: string,
	opts: {
		clone?: boolean | "worktree";
		conversation?: "clone" | "home" | false;
		linkHome?: boolean;
		configDir?: boolean;
		failGit?: boolean;
		failBun?: boolean;
		failClaude?: boolean;
		failPlugin?: "marketplace" | "install";
		cacheIsFile?: boolean;
	} = {},
) {
	// The é makes every case a path Claude Code names by its characters, not its bytes.
	let home = emptyDir("orchestrator-séssion-");
	if (opts.linkHome) {
		const link = join(emptyDir("orchestrator-session-link-"), "home");
		symlinkSync(home, link);
		home = link;
	}
	const bin = join(home, "bin");
	mkdirSync(bin);
	const config = opts.configDir ? join(home, "config") : join(home, ".claude");
	// Claude Code names a directory's project by its real path with every other character a dash
	// (seen in the laptop's ~/.claude/projects, 2.1.316); the harness has no copy of it to import.
	const projects = (dir: string) =>
		join(config, "projects", join(realpathSync(home), dir).replace(/[^A-Za-z0-9]/g, "-"));
	// A project directory holds more than transcripts; only a transcript is a conversation.
	mkdirSync(join(projects("harness"), "memory"), { recursive: true });
	const conversation = opts.conversation ?? "clone";
	if (conversation) {
		const dir = projects(conversation === "home" ? "" : "harness");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "0b7e3c1a.jsonl"), "{}\n");
	}
	if (opts.clone === "worktree") {
		mkdirSync(join(home, "harness"));
		writeFileSync(join(home, "harness", ".git"), "gitdir: /elsewhere\n");
	} else if (opts.clone !== false) mkdirSync(join(home, "harness", ".git"), { recursive: true });
	if (opts.cacheIsFile) writeFileSync(join(home, ".cache"), "");
	const log = join(home, "calls.log");
	const stub = (name: string, body = "") =>
		writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $* @$(pwd)" >>"${log}"\n${body}`, { mode: 0o755 });
	// git records the variable that keeps a failed credential from waiting on a prompt.
	stub(
		"git",
		`echo "git sees GIT_TERMINAL_PROMPT=\${GIT_TERMINAL_PROMPT-unset}" >>"${log}"\n${opts.failGit ? "exit 1\n" : ""}`,
	);
	stub("bun", opts.failBun ? "exit 1\n" : "");
	// The laptop has no coreutils timeout; the stub logs its limit and runs the command.
	stub("timeout", 'shift 2\nexec "$@"\n');
	stub("sleep");
	// Records the three variables, ends the loop on its second session start (a plugin call is
	// not one), and otherwise exits as asked; a plugin call prints a line naming its subcommand.
	stub(
		"claude",
		`echo "env GIT_TERMINAL_PROMPT=\${GIT_TERMINAL_PROMPT-unset} DISABLE_AUTOUPDATER=\${DISABLE_AUTOUPDATER-unset} LANG=\${LANG-unset}" >>"${log}"\nif [ "$1" = plugin ]; then echo "claude plugin $2 printed this"; [ "$2" != "${opts.failPlugin ?? ""}" ]; exit; fi\n[ "$(grep -c '^claude .*remote-control' "${log}")" -lt 2 ] || kill "$PPID"\n${opts.failClaude ? "exit 1\n" : ""}`,
	);
	const r = Bun.spawnSync([shell, script], {
		env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: home, ...(opts.configDir && { CLAUDE_CONFIG_DIR: config }) },
		timeout: 10_000,
	});
	const lines = (file: string) => {
		try {
			return readFileSync(file, "utf8").split("\n").slice(0, -1);
		} catch {
			return [];
		}
	};
	return {
		// Each call with its directory named relative to HOME.
		calls: lines(log).map((c) => c.replace(` @${home}`, " @~")),
		out: r.stdout.toString() + r.stderr.toString(),
		startLog: lines(join(home, ".cache/session-start.log")),
	};
}

// Built from parts, so remoteControl()'s scan of the tree does not read this file as a starter.
const START = `claude ${"-".repeat(2)}remote-control harness`;
const CONTINUE = `claude --continue ${"-".repeat(2)}remote-control harness`;

const ENV = "env GIT_TERMINAL_PROMPT=0 DISABLE_AUTOUPDATER=1 LANG=C.UTF-8";
// The marketplace the script adds is the one the project's settings declare, at the same tag.
const ADD = `claude plugin marketplace add ${MARKETPLACE.source.repo}#${MARKETPLACE.source.ref} --scope local @~/harness`;
const INSTALL = "claude plugin install ponytail@ponytail --scope local @~/harness";
/** The marketplace's registration, each call under `timeout`. */
const register = [`timeout --foreground 120 ${ADD}`, ADD, ENV];
/** One round in the clone, `claude` started as `start`. */
const roundWith = (start: string) => [
	"git pull --ff-only @~/harness",
	"git sees GIT_TERMINAL_PROMPT=0",
	"bun install --frozen-lockfile @~/harness",
	...register,
	`timeout --foreground 120 ${INSTALL}`,
	INSTALL,
	ENV,
	`${start} @~/harness`,
	ENV,
];
const round = roundWith(CONTINUE);
/** A round up to and including the session's start. */
const toStart = round.slice(0, round.indexOf(`${CONTINUE} @~/harness`) + 1);

for (const shell of ["sh", "dash"])
	describe(`the start script under ${shell}`, () => {
		// spec: orchestrator/claude-code-exits
		test("with a clone, pulls, installs and continues the clone's conversation with Remote Control named harness, then sleeps 5 and does it again", () => {
			expect(run(shell).calls).toEqual([...round, "sleep 5 @~/harness", ...round]);
		});

		// spec: orchestrator/claude-code-exits
		test("a claude that crashes, exiting non-zero, is followed by the pause and a round that continues the same conversation", () => {
			expect(run(shell, { failClaude: true }).calls).toEqual([...round, "sleep 5 @~/harness", ...round]);
		});

		// spec: orchestrator/nothing-to-continue
		test("a clone with no conversation, its project directory holding no transcript, starts claude as a new conversation", () => {
			const fresh = roundWith(START);
			expect(run(shell, { conversation: false }).calls).toEqual([...fresh, "sleep 5 @~/harness", ...fresh]);
		});

		// spec: orchestrator/nothing-to-continue
		test("a conversation in HOME is not continued in the clone: the first start after the clone, and the next, are new", () => {
			const fresh = roundWith(START);
			expect(run(shell, { conversation: "home" }).calls).toEqual([...fresh, "sleep 5 @~/harness", ...fresh]);
		});

		// spec: orchestrator/nothing-to-continue
		test("with no clone, a conversation in HOME is continued there", () => {
			expect(run(shell, { clone: false, conversation: "home" }).calls[0]).toBe(`${CONTINUE} @~`);
		});

		// spec: orchestrator/claude-code-exits
		test("a HOME reached through a symlink still finds the conversation Claude Code keeps under the real path", () => {
			expect(run(shell, { linkHome: true }).calls.filter((c) => c.startsWith("claude --"))).toEqual(
				Array(2).fill(`${CONTINUE} @~/harness`),
			);
		});

		// spec: orchestrator/claude-code-exits
		test("with CLAUDE_CONFIG_DIR set, the conversation is read from there", () => {
			expect(run(shell, { configDir: true }).calls[toStart.length - 1]).toBe(`${CONTINUE} @~/harness`);
		});

		// spec: orchestrator/the-pull-fails
		test("a failing pull prints its line, and claude still starts", () => {
			const { calls, out } = run(shell, { failGit: true });
			expect(out).toContain("session: git pull failed; starting claude anyway");
			expect(calls.slice(0, toStart.length)).toEqual(toStart);
		});

		// spec: orchestrator/the-install-fails
		test("a failing install prints its line, and claude still starts", () => {
			const { calls, out } = run(shell, { failBun: true });
			expect(out).toContain("session: bun install failed; starting claude anyway");
			expect(calls.slice(0, toStart.length)).toEqual(toStart);
		});

		// spec: orchestrator/no-clone-yet
		test("with no clone, neither git nor bun runs, and claude starts in HOME as a new conversation", () => {
			const { calls } = run(shell, { clone: false });
			expect(calls.filter((c) => /^(?:git|bun) /.test(c))).toEqual([]);
			expect(calls[0]).toBe(`${START} @~`);
		});

		// spec: orchestrator/ponytail-is-installed-before-each-start
		test("ponytail's marketplace is added and the plugin installed in the clone at local scope, with the updater off and a 120 s limit in the pane's foreground, after bun and before each start", () => {
			// `round` lists both calls between bun's and the start, their env lines showing the updater off.
			expect(run(shell).calls).toEqual([...round, "sleep 5 @~/harness", ...round]);
		});

		// spec: orchestrator/the-install-s-output-is-kept-in-a-log
		test("both calls' output goes to the start log under a timestamp line per round, not to the pane", () => {
			const { out, startLog } = run(shell);
			const entry = [
				expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ ponytail's install$/),
				"claude plugin marketplace printed this",
				"claude plugin install printed this",
			];
			expect(startLog).toEqual([...entry, ...entry]);
			expect(out).not.toContain("printed this");
		});

		// spec: orchestrator/a-failed-plugin-install-leaves-the-session-starting
		test("a failing plugin install prints its line, and claude still starts", () => {
			const { calls, out } = run(shell, { failPlugin: "install" });
			expect(out).toContain("session: ponytail's install failed; starting claude anyway");
			expect(calls.slice(0, toStart.length)).toEqual(toStart);
		});

		// spec: orchestrator/a-failed-plugin-install-leaves-the-session-starting
		test("a failing marketplace add skips the install, prints the install's line, and claude still starts", () => {
			const { calls, out } = run(shell, { failPlugin: "marketplace" });
			expect(out).toContain("session: ponytail's install failed; starting claude anyway");
			const bunAt = round.indexOf("bun install --frozen-lockfile @~/harness");
			expect(calls.slice(0, bunAt + 1 + register.length + 2)).toEqual([
				...round.slice(0, bunAt + 1),
				...register,
				`${CONTINUE} @~/harness`,
				ENV,
			]);
		});

		// spec: orchestrator/a-failed-plugin-install-leaves-the-session-starting
		test("a start log that cannot be opened prints the install's line, and claude still starts", () => {
			const { calls, out } = run(shell, { cacheIsFile: true });
			expect(out).toContain("session: ponytail's install failed; starting claude anyway");
			expect(calls).toContain(`${CONTINUE} @~/harness`);
		});

		// spec: orchestrator/no-plugin-install-without-the-clone
		test("with no clone, ponytail's install does not run and writes no start log", () => {
			const { calls, startLog } = run(shell, { clone: false });
			expect(calls.filter((c) => c.startsWith("claude plugin "))).toEqual([]);
			expect(startLog).toEqual([]);
		});

		test("a clone whose .git is a file, as a worktree's is, is pulled and installed", () => {
			expect(run(shell, { clone: "worktree" }).calls.slice(0, toStart.length)).toEqual(toStart);
		});
	});
