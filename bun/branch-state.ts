/**
 * What `command-guard.ts` asks git about the branch a commit would land on:
 * which branch it is, whether its pull request has already merged, and whether
 * `origin/main` is recent enough to say. Facts the guard consumes, kept apart
 * from its statement of what is refused, as `command-parse.ts` keeps how a
 * command line is read.
 *
 * Local git only, in the repository the caller names rather than `cwd` —
 * `git -C <dir> commit` commits elsewhere. The guard runs on every Bash call,
 * so a fetch or a `gh` call per commit is a different order of cost, and
 * offline it would answer from a stale base without saying so.
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "refs/remotes/origin/main";

/**
 * How old the base's last fetch may be, inclusive. It bounds how long a merge
 * can go unseen, at the cost of one `git fetch` at most twice an hour while
 * committing on a pushed branch — a judgement, not a measurement.
 */
export const FETCH_MAX_AGE = 30 * 60 * 1000;

/** `ok`, or what makes a commit on the branch refused. */
export type BranchState = "ok" | "merged" | "stale" | "unknown";

/** git's exit code and output; `-1` where it could not be started at all. */
function git(dir: string, ...args: string[]): { code: number; out: string } {
	try {
		const run = Bun.spawnSync(["git", ...args], { cwd: dir });
		return { code: run.exitCode, out: run.stdout.toString() };
	} catch {
		// An unreadable `dir` makes spawnSync throw, which would exit the guard
		// non-zero and non-blocking. A code no caller accepts blocks instead.
		return { code: -1, out: "" };
	}
}

/** The branch `HEAD` points at in `dir`, or `null` when git cannot say. */
export function headBranch(dir: string): string | null {
	const head = git(dir, "symbolic-ref", "--quiet", "--short", "HEAD");
	return head.code === 0 ? head.out.trim() : null;
}

/** Whether `ref` exists, by `rev-parse --verify --quiet`: 0 yes, 1 no, else unknown. */
const verify = (dir: string, ref: string) =>
	git(dir, "rev-parse", "--verify", "--quiet", ref).code;

/**
 * Whether a commit on `branch`, checked out in `dir`, would be stranded by a
 * merged pull request, measured against `origin/main` as of `now`.
 */
export function branchState(
	dir: string,
	branch: string,
	now = Date.now(),
): BranchState {
	const base = verify(dir, BASE);
	// No upstream for a pull request to have merged into, so nothing to strand:
	// the one exception to blocking what cannot be decided, since refusing here
	// would refuse every commit in every scratch repository.
	if (base === 1) return "ok";
	// An unborn branch has no commit a merge could have carried, and `git cherry`
	// cannot name its `HEAD`, so it would otherwise read as unknown.
	if (verify(dir, "HEAD") === 1) return "ok";
	const cherry = git(dir, "cherry", BASE, "HEAD");
	if (base !== 0 || cherry.code !== 0) return "unknown";
	// At least one `-`, never "no `+`": a branch with no commits prints no mark
	// at all, and a stranded commit prints `+` beside the merged ones' `-`. Asked
	// of every branch, however old the base: staleness can hide a merge, never
	// invent one.
	if (/^-/m.test(cherry.out)) return "merged";

	// No remote counterpart reads as never pushed, so no merge to miss. A branch
	// deleted on the remote and pruned reads the same, which is why the verdict
	// above does not ask.
	const pushed = verify(dir, `refs/remotes/origin/${branch}`);
	if (pushed === 1) return "ok";
	const path = git(dir, "rev-parse", "--git-path", "FETCH_HEAD");
	if (pushed !== 0 || path.code !== 0) return "unknown";
	try {
		// Every fetch rewrites FETCH_HEAD, one that updates no ref and so leaves
		// no reflog entry included; but so does a fetch of some other ref, so only
		// a line naming `main` shows the base was among what it fetched.
		const file = resolve(dir, path.out.trim());
		const covers = /^[0-9a-f]+\t[^\t]*\tbranch 'main' of /m.test(
			readFileSync(file, "utf8"),
		);
		// Absolute: a time in the future is a clock fault, not a recent fetch.
		const age = Math.abs(now - statSync(file).mtimeMs);
		return covers && age <= FETCH_MAX_AGE ? "ok" : "stale";
	} catch {
		return "unknown";
	}
}
