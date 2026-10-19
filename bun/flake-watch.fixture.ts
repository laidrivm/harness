/**
 * What the flake watch's test files need to drive it: `flake-watch.ts` as the
 * hooks run it, a spawned process reading one event on stdin, with each case's
 * store and ledger under a temp directory of its own and a fixture git
 * repository for the tree it reads. The events copy the shapes Claude Code
 * 2.1.303 sent for bun 1.4.2's reporter (probe, 2026-10-20).
 *
 * Its own module because the cases split across two files, and two copies of
 * the events drift in what they fabricate while both files still pass. Each
 * test file registers `cleanup` itself.
 */
import { expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./command-guard.fixture.ts";

export const script = `${import.meta.dir}/flake-watch.ts`;
const made: string[] = [];

/** Removes every directory made so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** An empty directory: the watch's `TMPDIR` and `XDG_STATE_HOME`, and where it starts. */
export function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "flake-watch-test-"));
	made.push(dir);
	return dir;
}

/** A repository on `main` with one commit, tracking `a.txt` and a `.gitignore` of `*.log`. */
export function repo(): string {
	const dir = temp();
	git(dir, "init", "-q", "-b", "main");
	writeFileSync(join(dir, "a.txt"), "one\n");
	writeFileSync(join(dir, ".gitignore"), "*.log\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-qm", "base");
	return dir;
}

/**
 * Runs the watch on one event, in `tmp`. Every run exits 0 with nothing on
 * stderr, whatever it was given — the watch never blocks [34].
 */
export function run(tmp: string, event: unknown) {
	const call = Bun.spawnSync(["bun", script], {
		cwd: tmp,
		env: { PATH: process.env.PATH, TMPDIR: tmp, XDG_STATE_HOME: tmp },
		stdin: Buffer.from(
			typeof event === "string" ? event : JSON.stringify(event),
		),
	});
	expect([call.exitCode, call.stderr.toString()]).toEqual([0, ""]);
	return call.stdout.toString();
}

/** Plays `steps` in order, an event run or an action taken, and returns the last run's output. */
export function play(steps: (object | (() => void))[], tmp = temp()): string {
	let out = "";
	for (const step of steps)
		if (typeof step === "function") step();
		else out = run(tmp, step);
	return out;
}

/** The text bun prints for a run whose failing tests are `names`. */
export const failing = (...names: string[]) =>
	[
		"bun test v1.4.2 (744846f84)",
		"",
		...names.map((name) => `(fail) ${name} [0.41ms]`),
		"",
		" 0 pass",
		` ${names.length} fail`,
		"Ran 1 test across 1 file. [5.00ms]",
	].join("\n");

export const PASSING =
	"bun test v1.4.2 (744846f84)\n\n 1 pass\n 0 fail\n 1 expect() calls\nRan 1 test across 1 file. [4.00ms]";

/** A Bash call in `cwd` that failed with `error`. */
export const failed = (
	cwd: string,
	error = `Exit code 1\n${failing("grp > flips")}`,
	over: object = {},
) => ({
	hook_event_name: "PostToolUseFailure",
	session_id: "s1",
	cwd,
	tool_name: "Bash",
	tool_input: { command: "bun test", description: "Run the tests" },
	error,
	is_interrupt: false,
	...over,
});

/** A Bash call in `cwd` that succeeded with `stdout`. */
export const passed = (cwd: string, stdout = PASSING, over: object = {}) => ({
	hook_event_name: "PostToolUse",
	session_id: "s1",
	cwd,
	tool_name: "Bash",
	tool_input: { command: "bun test", description: "Run the tests" },
	tool_response: { stdout, stderr: "", interrupted: false, isImage: false },
	...over,
});

/** The hint a run printed, or `undefined` when it printed nothing. */
export const hint = (out: string): string | undefined =>
	out ? JSON.parse(out).hookSpecificOutput.additionalContext : undefined;

/** Where the ledger lies in `tmp`, which `run` makes `XDG_STATE_HOME`. */
export const ledger = (tmp: string) => join(tmp, "harness", "gates.jsonl");
