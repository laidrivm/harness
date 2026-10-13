/**
 * What the loop guard's test files need to drive it: `loop-guard.ts` as the
 * hooks run it, a spawned process reading one event on stdin and answering by
 * exit code, with each case's count under a temp directory of its own.
 *
 * Its own module because the cases split across two files, and two copies of
 * the events drift in what they fabricate while both files still pass. Each
 * test file registers `cleanup` itself.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const script = `${import.meta.dir}/loop-guard.ts`;
const made: string[] = [];

/** Removes every directory made so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** An empty directory, both the guard's `TMPDIR` and where it starts. */
export function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "loop-guard-test-"));
	made.push(dir);
	return dir;
}

/**
 * The environment a spawned guard runs under: only what the case needs, with
 * `XDG_STATE_HOME` keeping any ledger record away from the user's.
 */
export const env = (tmp: string) => ({
	PATH: process.env.PATH,
	TMPDIR: tmp,
	XDG_STATE_HOME: tmp,
});

/** Runs the guard on one event, in `tmp`. */
export function run(tmp: string, event: unknown) {
	const call = Bun.spawnSync(["bun", script], {
		cwd: tmp,
		env: env(tmp),
		stdin: Buffer.from(
			typeof event === "string" ? event : JSON.stringify(event),
		),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		out: call.stdout.toString(),
		err: call.stderr.toString(),
	};
}

export const SILENT = { code: 0, out: "", err: "" };

export const base = {
	session_id: "s1",
	prompt_id: "p1",
	tool_name: "Bash",
	tool_input: { command: "bun test", description: "Run the tests" },
};

export const failure = (over: object = {}) => ({
	hook_event_name: "PostToolUseFailure",
	...base,
	error: "Exit code 1\n 1 fail\nRan 9 tests in 120ms",
	is_interrupt: false,
	...over,
});

export const before = (over: object = {}) => ({
	hook_event_name: "PreToolUse",
	...base,
	...over,
});

export const thrice = (over: object = {}) => [1, 2, 3].map(() => failure(over));

/** Feeds the failures to one store in order, then decides the call. */
export function after(
	failures: object[],
	call: object = before(),
	tmp = temp(),
) {
	for (const event of failures) run(tmp, event);
	return run(tmp, call);
}

/** The text of each file the guard keeps. */
export const kept = (tmp: string) =>
	readdirSync(join(tmp, "loop-guard")).map((name) =>
		readFileSync(join(tmp, "loop-guard", name), "utf8"),
	);
