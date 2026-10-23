/**
 * The CI flow's git: in the session's clone, and on the host in the runner's
 * push clone, which `runner-isolation`'s design, *The CI flow's push*, puts
 * the App's fetch and the fix push in. On the host every command in the
 * session's clone runs through the launcher `HARNESS_AS_AGENT` names, as the
 * session user, so the App's token never enters that clone.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { carry, over, pushRef, sh } from "./board-loop-push.ts";
import { ranUnder } from "./gate-ledger.ts";
import type { App } from "./github-app.ts";

const launcher = process.env.HARNESS_AS_AGENT?.split(" ").filter(Boolean) ?? [];

/** The launcher's words and the session's clone, which a command then runs in as the session user; empty off the host. */
export const under = (clone: string) => (launcher.length ? [...launcher, clone] : []);

/** `git -C <clone> …`'s output, or undefined when it fails; off the host as the App once its credentials are set. */
export function git(clone: string, ...args: string[]) {
	const p = Bun.spawnSync([...under(clone), "git", "-C", clone, ...args], { env: process.env });
	return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

/** The runner's push clone of the App's repository, where `pass.sh` keeps it: `<PASS_PUSH>/<owner>/<repo>`, lower-cased. */
const pushOf = (app: App) => join(process.env.PASS_PUSH || join(homedir(), "push"), app.owner.toLowerCase(), app.repo.toLowerCase());

/**
 * Fetches the pull request's `branch` as the App into the clone's
 * `origin/<branch>`, or says false. On the host the fetch runs in the push
 * clone, which the runner then works in, and the clone takes the branch from
 * a bundle at `file`, beside the run's log, which its user can read.
 */
export function fetched(clone: string, app: App, branch: string, file: string) {
	const ref = `refs/remotes/origin/${branch}`;
	if (!launcher.length) return git(clone, "fetch", "-q", over(app), `+refs/heads/${branch}:${ref}`) !== undefined;
	const push = pushOf(app);
	if (!existsSync(join(push, ".git"))) return false;
	process.chdir(push);
	mkdirSync(dirname(file), { recursive: true });
	// shortcut: the branch's whole history, since what the session's clone holds is unknown here; fine at these repositories' size.
	if (!sh("git", "fetch", "-q", over(app), `+refs/heads/${branch}:${ref}`).ok || !sh("git", "bundle", "create", file, ref).ok)
		return false;
	return git(clone, "fetch", "-q", file, `+${ref}:${ref}`) !== undefined;
}

/**
 * Pushes the session's commit `fixed` on `branch`, on top of `base`, as the
 * App and never forced, or says why not. On the host the branch is carried
 * from the clone into the push clone as a bundle the session user writes, and
 * pushed from there only when the tip there is `fixed`, holds `base`, and the
 * session's clone holds a passing pre-PR record of it.
 */
export function pushed(clone: string, app: App, branch: string, fixed: string, base: string): string | undefined {
	if (launcher.length) {
		// `base` is the clone's `origin/<branch>`, which `fetched` set there; the bundle holds what came after it.
		const carried = carry(under(clone), branch, branch);
		if (carried !== undefined) return carried;
		if (sh("git", "rev-parse", "HEAD").out !== fixed || !sh("git", "merge-base", "--is-ancestor", base, "HEAD").ok)
			return `the push clone's ${branch} is not ${fixed} on top of ${base}; nothing pushed`;
		if (!ranUnder(under(clone), fixed)) return `no passing pre-PR run record for ${fixed.slice(0, 7)}; nothing pushed`;
	}
	if (!pushRef(over(app), branch).ok) return `GitHub refused the push of ${branch}; neither forced nor retried`;
}
