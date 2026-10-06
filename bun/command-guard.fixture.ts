/**
 * What the guard's test files need to drive it: a throwaway repository and a
 * spawned `command-guard.ts` reading a fabricated hook event.
 *
 * Its own module rather than a copy in each file, because the guard's cases
 * split across two of them and this is a fabricated repository rather than a
 * stub — a second copy would drift in what it fabricates, and the tests would
 * still pass while exercising something else. `afterAll` is not registered
 * here: a lifecycle hook belongs to the file it runs for, so each test file
 * registers `cleanup` itself.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const guard = `${import.meta.dir}/command-guard.ts`;
const made: string[] = [];

/** Removes every directory fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

function git(cwd: string, ...args: string[]): void {
	const run = Bun.spawnSync(["git", ...args], { cwd });
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
}

/**
 * A throwaway directory; `git init` only when a branch is asked for. `prefix`
 * is what the one test needing a path with a space in it varies.
 */
export function fabricate(branch?: string, prefix = "command-guard-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	made.push(dir);
	if (branch) git(dir, "init", "-b", branch);
	return dir;
}

export function detached(): string {
	const dir = fabricate("main");
	git(
		dir,
		"-c",
		"user.email=t@e",
		"-c",
		"user.name=T",
		"commit",
		"--allow-empty",
		"-m",
		"x",
	);
	git(dir, "checkout", "--detach");
	return dir;
}

/** Runs the guard against a fabricated event and repository. */
export function run(payload: unknown, cwd: string) {
	const call = Bun.spawnSync(["bun", guard], {
		cwd,
		stdin: Buffer.from(
			typeof payload === "string" ? payload : JSON.stringify(payload),
		),
		stderr: "pipe",
	});
	return { code: call.exitCode, reason: call.stderr.toString() };
}

export const event = (command: unknown, description = "") => ({
	tool_name: "Bash",
	tool_input: { command, description },
});
