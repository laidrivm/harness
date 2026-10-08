/**
 * What the turn gate's test files need to drive it: a throwaway repository
 * holding OpenSpec task lists, a throwaway mark store, and the hook events.
 *
 * Its own module because the gate's cases split across two files, and a
 * second copy of a fabricated repository drifts in what it fabricates while
 * both copies' tests still pass. Each test file registers `cleanup` itself.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const made: string[] = [];

/** Removes every directory fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

function temp(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	made.push(dir);
	return dir;
}

export function git(cwd: string, ...args: string[]): string {
	const run = Bun.spawnSync(
		["git", "-c", "user.email=t@e", "-c", "user.name=T", ...args],
		{ cwd },
	);
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	return run.stdout.toString().trim();
}

/** Writes each file, then commits whatever the tree holds. */
export function commit(dir: string, files: Record<string, string> = {}): void {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	git(dir, "add", "-A");
	git(dir, "commit", "--allow-empty", "-m", "x");
}

/**
 * A repository on branch `feat` whose first commit holds `files`, pushed to a
 * bare `origin` it tracks.
 */
export function repo(files: Record<string, string> = {}): string {
	const dir = temp("turn-gate-");
	git(dir, "init", "-b", "feat");
	commit(dir, files);
	const origin = temp("turn-gate-origin-");
	git(origin, "init", "--bare");
	git(dir, "remote", "add", "origin", origin);
	git(dir, "push", "-u", "origin", "feat");
	return dir;
}

/** An empty directory for the marks, so no case reads another's. */
export const store = () => temp("turn-gate-store-");

export const TASKS = "openspec/changes/c/tasks.md";

/** One group, one box still open. */
export const OPEN = "# c\n\n## 1. Group\n\n- [x] 1.1 a\n- [ ] 1.2 b\n";

/** The same group with its last box ticked. */
export const DONE = "# c\n\n## 1. Group\n\n- [x] 1.1 a\n- [x] 1.2 b\n";

/** A turn's final message carrying no report. */
export const SILENT = "Group 1 is done. Want me to run the pre-PR sequence?";

export const prompt = (cwd: string, session = "s1") => ({
	session_id: session,
	cwd,
	prompt: "go",
});

export const end = (cwd: string, message?: string, session = "s1") => ({
	session_id: session,
	cwd,
	last_assistant_message: message,
});
