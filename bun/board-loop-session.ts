/**
 * One `claude -p` session of a board-loop pass, the pick or the stage: how it
 * is launched, and how it and everything it started are ended, at the limit,
 * on Ctrl-C, or after it exits on its own.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { answered, LIMITED } from "./transient.ts";

export type Kill = (pid: number, signal: NodeJS.Signals | 0) => void | Promise<void>;

/**
 * Whether Claude Code's config trusts `dir`, keyed by its real path. The path
 * itself only: crediting a trusted parent could pass where Claude Code does not.
 * `read` is the config as the session's user read it, on the host.
 */
export function trusted(dir: string, read?: string): boolean {
	try {
		// Where Claude Code keeps it: `CLAUDE_CONFIG_DIR` when set, the home otherwise.
		const home = process.env.CLAUDE_CONFIG_DIR || homedir();
		const config = JSON.parse(read ?? readFileSync(join(home, ".claude.json"), "utf8"));
		return config?.projects?.[dir]?.hasTrustDialogAccepted === true;
	} catch {
		return false;
	}
}

/**
 * The variables a session gets of the runner's, and no others: an allowlist,
 * since a denylist would pass the next credential nobody listed. None carries
 * a GitHub credential, an SSH agent or an App setting; a credential stored
 * under `HOME` or `XDG_CONFIG_HOME` stays readable, which the VPS's separate
 * session user closes. Claude's own credential is the session's by necessity. `XDG_STATE_HOME` must pass, so the pre-PR
 * record a session writes is the one the runner's check reads.
 */
export const PASSED = new Set([
	"PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "LANG", "TMPDIR", "TZ",
	"XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
	"CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
	"HARNESS_GH_TIMEOUT_MS", "GOAL_CHECK_RETRY_MS",
]);

/** The runner's environment cut to the allowlist; every `LC_*` passes, by its whole prefix. */
const allowed =(env: NodeJS.ProcessEnv) =>
	Object.fromEntries(
		Object.entries(env).filter(([name, value]) => value !== undefined && (PASSED.has(name) || name.startsWith("LC_"))),
	) as Record<string, string>;

/**
 * A `kill` sent as the session's own user, through the launcher: the kernel
 * refuses `runner` a signal to `agent`'s group. Only a `kill` that finds no
 * such process reads as ESRCH; any other failure, EPERM included, and a
 * launcher that fails before `kill` runs read as a group still alive, so the
 * bounded wait polls on and names a member it cannot end as left.
 */
const through =
	(under: string[]): Kill =>
	async (pid, signal) => {
		const name = signal === 0 ? "0" : signal.replace(/^SIG/, "");
		// From `/`, not the clone: a session may remove its clone while a child of it runs on.
		const at = [...under.slice(0, -1), "/"];
		// No `--`: dash, the image's sh, reads it after a signal as a pid and fails.
		// Read by its message, C locale, as dash and bash both print strerror: exit 3 is ESRCH alone.
		const script = 'export LC_ALL=C; e=$(kill -$0 "$1" 2>&1 >/dev/null) && exit 0; case $e in *"No such process"*) exit 3 ;; esac; exit 4';
		const run = Bun.spawn([...at, "sh", "-c", script, name, String(pid)], { stdio: ["ignore", "ignore", "ignore"] });
		// Raced, never awaited past 3 s: the direct child is setuid sudo, which `runner` may not be able to
		// signal at all, so a spawnSync timeout's kill could not end it and would block the loop and every timer.
		let bound: Timer | undefined;
		const code = await Promise.race([run.exited, new Promise<null>((done) => (bound = setTimeout(() => done(null), 3_000)))]);
		clearTimeout(bound);
		if (code === null) {
			run.unref();
			try {
				run.kill("SIGKILL");
			} catch {}
		}
		if (code === 3) throw Object.assign(new Error(`kill ${name} ${pid} failed`), { code: "ESRCH" });
		if (code !== 0) throw Object.assign(new Error(`kill ${name} ${pid} through the launcher failed`), { code: "ELAUNCH" });
	};

/**
 * `--output-format json`'s one result object read: its `result` as `out`, and
 * whether the Claude API ended the session with no answer, a 5xx or a 429,
 * short of the usage limit (`retry-on-transient` *A session ended by a
 * transient Claude API error*). Output that is no result object is `out` as
 * printed, never transient.
 */
function ending(printed: string) {
	try {
		const ended = JSON.parse(printed);
		if (ended?.type === "result" && typeof ended.result === "string") {
			const status = ended.api_error_status;
			const api = ended.is_error === true && ended.terminal_reason === "api_error";
			const unanswered = status === null || (typeof status === "number" && answered(status));
			return { out: ended.result as string, transient: api && unanswered && !ended.result.startsWith(LIMITED) };
		}
	} catch {}
	return { out: printed, transient: false };
}

/**
 * One `claude -p` session, ended at `limit`, and everything it started ended
 * with it, however it exits. `capture` keeps its output rather than showing
 * it: `printed` as `claude` printed it, `out` and `transient` as `ending()`
 * reads it. `as` holds the variables the runner adds to the allowlist's, the commit
 * identity and the question gate's signal, and `extra` flags it adds to the
 * command line. `under` is the launcher's words and the session's clone on
 * the host, which `claude` then runs in as `agent`, and which then signals its
 * group in `kill`'s place. `left` names its process group when a member
 * outlived the bounded wait.
 */
export async function session(
	text: string,
	limit: number,
	kill: Kill,
	capture = false,
	as: Record<string, string> = {},
	extra: string[] = [],
	under: string[] = [],
) {
	if (under.length) kill = through(under);
	// Auto mode with nothing to answer prompts; never a bypass of permissions.
	// JSON, so the result object says why the session ended.
	const flags = ["--permission-mode", "auto", "--permission-prompts", "none", "--output-format", "json", ...extra];
	// A file, not a pipe: a child the session leaves running could hold a pipe open and stall the pass.
	const dir = capture ? mkdtempSync(join(tmpdir(), "board-loop-")) : "";
	let interrupt: (() => void) | undefined;
	try {
		// Leader of its own process group, so a child it starts (a test run, say) is signalled with it.
		const run = Bun.spawn([...under, "claude", "-p", text, ...flags], {
			stdio: ["ignore", capture ? Bun.file(join(dir, "out")) : "inherit", "inherit"],
			env: { ...allowed(process.env), ...as },
			detached: true,
		});
		const group = async (signal: NodeJS.Signals) => {
			try {
				await kill(-run.pid, signal);
			} catch {}
		};
		/** Only ESRCH proves the group empty: EPERM is a member this user cannot signal. */
		const alive = async () => {
			try {
				await kill(-run.pid, 0);
				return true;
			} catch (error) {
				return (error as NodeJS.ErrnoException).code !== "ESRCH";
			}
		};
		// Ctrl-C reaches the terminal's foreground group, which a detached one is not.
		interrupt = async () => {
			await group("SIGKILL");
			// `process.exit` skips the `finally` below.
			if (capture) rmSync(dir, { recursive: true, force: true });
			process.exit(130);
		};
		process.on("SIGINT", interrupt);
		let late = false;
		const timer = setTimeout(() => {
			late = true;
			void group("SIGTERM");
			// A member that ignores SIGTERM is killed outright.
			setTimeout(() => void group("SIGKILL"), 5_000).unref();
		}, limit);
		await run.exited;
		clearTimeout(timer);
		// Nothing the session started, a background job included, may go on working once the pass
		// judges or records: SIGTERM, SIGKILL 5 s later, and a wait of 10 s at most.
		let left: number | undefined;
		if (await alive()) {
			await group("SIGTERM");
			const outright = setTimeout(() => void group("SIGKILL"), 5_000);
			// By the clock, not a count: each check through the launcher may take up to its own bound.
			const until = Date.now() + 10_000;
			while (Date.now() < until && (await alive())) await Bun.sleep(100);
			clearTimeout(outright);
			if (await alive()) left = run.pid;
		}
		const printed = capture ? readFileSync(join(dir, "out"), "utf8") : "";
		return { late, left, printed, ...ending(printed) };
	} finally {
		if (interrupt) process.off("SIGINT", interrupt);
		if (capture) rmSync(dir, { recursive: true, force: true });
	}
}
