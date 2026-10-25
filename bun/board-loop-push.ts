/**
 * What a board-loop pass does between the stage session and its verdict: the
 * session pushes nothing and opens nothing, so the runner pushes the step's
 * branch and opens its pull request, as the GitHub App `github-app.ts` reads
 * when one is configured and with its user's own git and `gh` credentials
 * otherwise, and only for a step that is ready — the before-push goal check
 * met, run from the judge copy, `HEAD` on the step's branch, and a title and a
 * body named in the session's final message. Just before the push it records
 * the step's session in the PR → session table (`pr-sessions.ts`). On the host
 * it pushes from its own push clone, never the session's.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type App, credentials, mint, repository } from "./github-app.ts";
import { append, table } from "./pr-sessions.ts";
import { network, Transient } from "./transient.ts";

/** A command's result; one that cannot start reads as failed, never thrown. */
export const sh = (...args: string[]) => shWith({}, ...args);

/** `sh` with `extra` added to the child's environment alone, so the token a fetch needs is in no other process's. */
export function shWith(extra: Record<string, string>, ...args: string[]) {
	try {
		// Named, not left to the default, which misses a variable `publish` sets once the process runs.
		const run = Bun.spawnSync(args, { env: { ...process.env, ...extra } });
		const text = (b: Buffer) => b.toString().trim();
		return { ok: run.exitCode === 0, out: text(run.stdout), err: text(run.stderr) };
	} catch {
		return { ok: false, out: "", err: `${args[0]}: not found` };
	}
}

/** Over HTTPS as the App, even where `origin` is SSH: over SSH git ignores the header and uses a key of its own. */
export const over = (app: App) => `https://github.com/${app.owner}/${app.repo}.git`;

/**
 * Exactly `branch`'s ref to `to`, never forced, never retried: a branch that moved on origin is the user's.
 * From the working directory's repository, which on the host is the runner's push clone for both the board
 * loop and the CI flow, never the session's clone.
 */
export const pushRef = (to: string, branch: string) =>
	sh("git", "push", to, `refs/heads/${branch}:refs/heads/${branch}`);

/**
 * The pull request's title and body from the session's final message, or what
 * the message lacks. Untrusted text, read as `PICK:` is: one `PR-TITLE:` line,
 * then one `PR-BODY:` line with the body after it to the end, neither empty.
 */
export function named(said: string): { title: string; body: string } | string {
	const lines = said.split("\n");
	const at = (mark: string) => lines.flatMap((line, i) => (line.startsWith(mark) ? [i] : []));
	const [titles, bodies] = [at("PR-TITLE:"), at("PR-BODY:")];
	if (titles.length !== 1) return "the final message holds not one PR-TITLE: line";
	if (bodies.length !== 1) return "the final message holds not one PR-BODY: line";
	if (bodies[0] < titles[0]) return "PR-BODY: comes before PR-TITLE:";
	// `trim` drops the CR a CRLF message leaves on the title.
	const title = lines[titles[0]].slice("PR-TITLE:".length).trim();
	const body = lines.slice(bodies[0]).join("\n").slice("PR-BODY:".length).trim();
	if (!title) return "the PR-TITLE: line is empty";
	if (!body) return "nothing follows PR-BODY:";
	return { title, body };
}

/**
 * On the host: takes `branch` from the session's clone into the push clone the
 * pass runs in, as a bundle the session user writes, which carries objects and
 * refs and never config or hooks, and checks it out there at the bundle's tip.
 * `under` is the launcher's words and the session's clone. The push clone
 * fetches `origin` first, so a `base` that moved during the session is there
 * for the bundle's prerequisite, with `read`, a `contents` read token's
 * credentials, in the environment of those two fetches alone. Undefined once `HEAD` names `branch` at the
 * tip; otherwise why nothing was pushed, as a `Transient` where `origin`'s
 * fetch met the network.
 */
export function carry(under: string[], branch: string, base: string, read: Record<string, string> = {}): string | Transient | undefined {
	const dir = mkdtempSync(join(tmpdir(), "board-loop-bundle-"));
	try {
		const file = join(dir, "step.bundle");
		// On stdout, into the runner's own file: the session user needs no directory the runner reads.
		const made = Bun.spawnSync([...under, "git", "bundle", "create", "-", `refs/heads/${branch}`, `^refs/remotes/origin/${base}`]);
		if (made.exitCode !== 0) {
			console.error(made.stderr.toString().trim());
			return `the session's clone could not bundle ${branch}; nothing was pushed`;
		}
		writeFileSync(file, made.stdout);
		for (const [what, ...from] of [["origin", "origin"], ["the bundle", file, `refs/heads/${branch}`]]) {
			const run = shWith(read, "git", "fetch", "-q", ...from);
			if (run.ok) continue;
			console.error(run.err);
			const why = `the push clone could not fetch ${what}; nothing was pushed`;
			return what === "origin" && network(run.err) ? new Transient(why) : why;
		}
		const tip = sh("git", "rev-parse", "--verify", "-q", "FETCH_HEAD^{commit}").out;
		if (!tip || !sh("git", "checkout", "-qf", "-B", branch, tip).ok)
			return `the push clone could not check out ${branch} at the bundle's tip; nothing was pushed`;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Pushes `branch` and opens its pull request against `base`, or says why not.
 * `check` is the goal check's call, which runs here with `--before-push`.
 * `carried` names the stage session and the clone it ran in, for the table.
 * Undefined once the push went through, so the full check decides, a pull
 * request already at `HEAD` included; otherwise the reason the pass is `open`,
 * or a `Transient` where a fetch, a mint or the push met the network.
 * `under`, on the host, makes it `carry` the branch into the push clone first.
 * There the push runs no hook, the one exception `git-and-prs.md`'s hook rule
 * makes: the push clone's hooks are an empty directory, and the before-push
 * check found the session's passing pre-PR record of this SHA.
 */
export async function publish(
	said: string,
	check: string[],
	branch: string,
	base: string,
	carried: { session: string; clone: string },
	app?: App,
	under: string[] = [],
) {
	// A private repository refuses an unauthenticated fetch; the token goes to the two fetches alone.
	let read: Record<string, string> = {};
	if (app && under.length) {
		try {
			read = credentials(await mint(app, { contents: "read" }));
		} catch (error) {
			const why = `the App's read token could not be minted: ${(error as Error).message}; nothing was pushed`;
			return error instanceof Transient ? new Transient(why) : why;
		}
	}
	const carriedOver = under.length ? carry(under, branch, base, read) : undefined;
	if (carriedOver !== undefined) return carriedOver;
	const before = sh("bun", ...check, "--before-push");
	const last = before.out.split("\n").at(-1) ?? "";
	if (!last.startsWith("goal met")) return last || before.err || "the before-push check printed nothing";
	const on = sh("git", "symbolic-ref", "--short", "-q", "HEAD").out;
	if (on !== branch) return `HEAD is on ${on || "no branch"}, not ${branch}; nothing was pushed`;
	const pr = named(said);
	if (typeof pr === "string") return pr;
	if (app) {
		try {
			// Minted now, so no session can reach it. Into the runner's own environment, for the push,
			// `gh` and the full check after it, which reads the pull request with `gh`.
			Object.assign(process.env, credentials(await mint(app, { contents: "write", pull_requests: "write" })));
		} catch (error) {
			const why = `the App's token could not be minted: ${(error as Error).message}; nothing was pushed`;
			return error instanceof Transient ? new Transient(why) : why;
		}
	}
	// Recorded before the push, so no pull request of the loop's exists that the table does not name.
	// A non-GitHub `origin` records no repository, a line the lookup skips; its URL can hold a credential.
	const where = app ?? repository(sh("git", "config", "--get", "remote.origin.url").out);
	try {
		append({ repo: where ? `${where.owner}/${where.repo}` : "", branch, ...carried });
	} catch (error) {
		return `the PR → session table ${table()} could not be written: ${(error as Error).message}; nothing was pushed`;
	}
	const push = pushRef(app ? over(app) : "origin", branch);
	if (!push.ok) {
		console.error([push.out, push.err].filter(Boolean).join("\n"));
		const why = `origin refused the push of ${branch}, as printed above`;
		return network(push.err) ? new Transient(why) : why;
	}
	const create = ["gh", "pr", "create", "--base", base, "--head", branch, "--title", pr.title, "--body-file", "-"];
	try {
		// The body on stdin, where none of its lines can read as a flag.
		const run = Bun.spawnSync(create, { stdin: Buffer.from(pr.body), env: process.env });
		if (run.exitCode !== 0) console.error(run.stderr.toString().trim());
	} catch {
		console.error("gh: not found");
	}
}
