/**
 * One `claude -p` session of a board-loop pass, the pick or the stage: how it
 * is launched, and how it and everything it started are ended, at the limit,
 * on Ctrl-C, or after it exits on its own.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Kill = (pid: number, signal: NodeJS.Signals | 0) => void;

/**
 * One `claude -p` session, ended at `limit`, and everything it started ended
 * with it, however it exits. `capture` keeps its output rather than showing
 * it. `left` names its process group when a member outlived the bounded wait.
 */
export async function session(text: string, limit: number, kill: Kill, capture = false) {
	// Auto mode with nothing to answer prompts; never a bypass of permissions.
	const flags = ["--permission-mode", "auto", "--permission-prompts", "none"];
	// A file, not a pipe: a child the session leaves running could hold a pipe open and stall the pass.
	const dir = capture ? mkdtempSync(join(tmpdir(), "board-loop-")) : "";
	let interrupt: (() => void) | undefined;
	try {
		// Leader of its own process group, so a child it starts (a test run, a push) is signalled with it.
		const run = Bun.spawn(["claude", "-p", text, ...flags], {
			stdio: ["ignore", capture ? Bun.file(join(dir, "out")) : "inherit", "inherit"],
			detached: true,
		});
		const group = (signal: NodeJS.Signals) => {
			try {
				kill(-run.pid, signal);
			} catch {}
		};
		/** Only ESRCH proves the group empty: EPERM is a member this user cannot signal. */
		const alive = () => {
			try {
				kill(-run.pid, 0);
				return true;
			} catch (error) {
				return (error as NodeJS.ErrnoException).code !== "ESRCH";
			}
		};
		// Ctrl-C reaches the terminal's foreground group, which a detached one is not.
		interrupt = () => {
			group("SIGKILL");
			// `process.exit` skips the `finally` below.
			if (capture) rmSync(dir, { recursive: true, force: true });
			process.exit(130);
		};
		process.on("SIGINT", interrupt);
		let late = false;
		const timer = setTimeout(() => {
			late = true;
			group("SIGTERM");
			// A member that ignores SIGTERM is killed outright.
			setTimeout(() => group("SIGKILL"), 5_000).unref();
		}, limit);
		await run.exited;
		clearTimeout(timer);
		// Nothing the session started, a background job included, may go on working once the pass
		// judges or records: SIGTERM, SIGKILL 5 s later, and a wait of 10 s at most.
		let left: number | undefined;
		if (alive()) {
			group("SIGTERM");
			const outright = setTimeout(() => group("SIGKILL"), 5_000);
			for (let wait = 0; wait < 100 && alive(); wait++) await Bun.sleep(100);
			clearTimeout(outright);
			if (alive()) left = run.pid;
		}
		return { late, left, out: capture ? readFileSync(join(dir, "out"), "utf8") : "" };
	} finally {
		if (interrupt) process.off("SIGINT", interrupt);
		if (capture) rmSync(dir, { recursive: true, force: true });
	}
}
