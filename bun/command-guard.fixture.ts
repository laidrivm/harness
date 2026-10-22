/**
 * What the guard's test files need to drive it: a throwaway repository — with
 * an `origin` and a fetch of a chosen age where the branch's state is the
 * question — and a spawned `command-guard.ts` reading a fabricated hook event.
 *
 * Its own module rather than a copy in each file, because the guard's cases
 * split across files and this is a fabricated repository rather than a
 * stub — a second copy would drift in what it fabricates, and the tests would
 * still pass while exercising something else. `afterAll` is not registered
 * here: a lifecycle hook belongs to the file it runs for, so each test file
 * registers `cleanup` itself.
 */
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const guard = `${import.meta.dir}/command-guard.ts`;
const made: string[] = [];

/** Removes every directory fabricated so far. */
export function cleanup(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** Runs git with the identity a commit needs, whatever the machine's config. */
export function git(cwd: string, ...args: string[]): void {
	const run = Bun.spawnSync(
		[
			"git",
			"-c",
			"user.email=t@e",
			"-c",
			"user.name=T",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{ cwd },
	);
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
	git(dir, "commit", "--allow-empty", "-m", "x");
	git(dir, "checkout", "--detach");
	return dir;
}

export type Upstream = {
	/** The branch `HEAD` is left on; `feat/x` when not given. */
	branch?: string;
	/** A branch commit `origin/main` carries as an equivalent patch. */
	merged?: boolean;
	/** A commit only the branch carries, made after the merged one. */
	own?: boolean;
	/** Whether the branch is pushed, leaving a ref under `refs/remotes/origin/`. */
	pushed?: boolean;
	/** How long ago `FETCH_HEAD` was written, in ms; negative is the future. */
	fetchedAgo?: number;
	/** Replaces what the last fetch wrote into `FETCH_HEAD`; `null` removes it. */
	fetchHead?: string | null;
};

/**
 * A work tree whose `origin` is a bare repository carrying `main`, with
 * `HEAD` on a branch cut from it. A merged commit is a cherry-pick onto
 * `main`, which is what a rebase merge or a squash of one commit leaves. The
 * last step is a real `git fetch origin`, so `FETCH_HEAD` is git's own unless
 * the caller replaces it. No reflog is arranged: freshness is deliberately
 * not read from one, and a fixture offering it invites a test of the wrong
 * thing.
 */
export function upstream({
	branch = "feat/x",
	merged = false,
	own = false,
	pushed = true,
	fetchedAgo = 0,
	fetchHead,
}: Upstream = {}): string {
	const remote = fabricate();
	git(remote, "init", "--bare", "-b", "main");
	const dir = fabricate("main");
	git(dir, "commit", "--allow-empty", "-m", "base");
	git(dir, "remote", "add", "origin", remote);
	git(dir, "push", "origin", "main");
	git(dir, "switch", "-c", branch);
	if (merged) {
		writeFileSync(join(dir, "merged.txt"), "merged\n");
		git(dir, "add", "merged.txt");
		git(dir, "commit", "-m", "merged");
		git(dir, "switch", "main");
		// `-x` changes the message, so the copy is a new commit with the same
		// patch: without it, the same second and parent rebuild the branch's own
		// commit, which `main` then contains as an ancestor — a fast-forward.
		git(dir, "cherry-pick", "-x", branch);
		git(dir, "push", "origin", "main");
		git(dir, "switch", branch);
	}
	if (pushed) git(dir, "push", "origin", branch);
	if (own) {
		writeFileSync(join(dir, "own.txt"), "own\n");
		git(dir, "add", "own.txt");
		git(dir, "commit", "-m", "own");
	}
	git(dir, "fetch", "origin");
	const file = join(dir, ".git", "FETCH_HEAD");
	if (fetchHead === null) rmSync(file);
	else {
		if (fetchHead !== undefined) writeFileSync(file, fetchHead);
		const at = new Date(Date.now() - fetchedAgo);
		utimesSync(file, at, at);
	}
	return dir;
}

/**
 * Runs the guard against a fabricated event and repository. The default
 * environment points the gate ledger at a directory of the run's own, so a
 * case that blocks never writes to the user's.
 */
export function run(
	payload: unknown,
	cwd: string,
	env: Record<string, string | undefined> = {
		...process.env,
		XDG_STATE_HOME: fabricate(undefined, "command-guard-state-"),
	},
) {
	const call = Bun.spawnSync(["bun", guard], {
		cwd,
		env,
		stdin: Buffer.from(
			typeof payload === "string" ? payload : JSON.stringify(payload),
		),
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		reason: call.stderr.toString(),
		out: call.stdout.toString(),
	};
}

export const event = (command: unknown, description = "") => ({
	tool_name: "Bash",
	tool_input: { command, description },
});

/** The guard's verdict on `command` from a feature branch, with the rule it recorded. */
export function verdict(command: string, dir = fabricate("feat/x")): {
	code: number;
	reason: string;
	rule?: string;
} {
	const state = fabricate(undefined, "command-guard-state-");
	const env = { ...process.env, XDG_STATE_HOME: state };
	const { code, reason } = run(event(command), dir, env);
	const ledger = join(state, "harness", "gates.jsonl");
	if (!existsSync(ledger)) return { code, reason };
	return { code, reason, rule: JSON.parse(readFileSync(ledger, "utf8")).rule };
}
