/**
 * What a board-loop pass does between the stage session and its verdict: the
 * session pushes nothing and opens nothing, so the runner pushes the step's
 * branch and opens its pull request, as the GitHub App `github-app.ts` reads
 * when one is configured and with its user's own git and `gh` credentials
 * otherwise, and only for a step that is ready — the before-push goal check
 * met, run from the judge copy, `HEAD` on the step's branch, and a title and a
 * body named in the session's final message. Just before the push it records
 * the step's session in the PR → session table (`pr-sessions.ts`).
 */
import { type App, credentials, mint, repository } from "./github-app.ts";
import { append, table } from "./pr-sessions.ts";

/** A command's result; one that cannot start reads as failed, never thrown. */
export function sh(...args: string[]) {
	try {
		// Named, not left to the default, which misses a variable `publish` sets once the process runs.
		const run = Bun.spawnSync(args, { env: process.env });
		const text = (b: Buffer) => b.toString().trim();
		return { ok: run.exitCode === 0, out: text(run.stdout), err: text(run.stderr) };
	} catch {
		return { ok: false, out: "", err: `${args[0]}: not found` };
	}
}

/** Over HTTPS as the App, even where `origin` is SSH: over SSH git ignores the header and uses a key of its own. */
export const over = (app: App) => `https://github.com/${app.owner}/${app.repo}.git`;

/** Exactly `branch`'s ref to `to`, never forced, never retried: a branch that moved on origin is the user's. */
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
 * Pushes `branch` and opens its pull request against `base`, or says why not.
 * `check` is the goal check's call, which runs here with `--before-push`.
 * `carried` names the stage session and the clone it ran in, for the table.
 * Undefined once the push went through, so the full check decides, a pull
 * request already at `HEAD` included; otherwise the reason the pass is `open`.
 */
export async function publish(
	said: string,
	check: string[],
	branch: string,
	base: string,
	carried: { session: string; clone: string },
	app?: App,
) {
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
			return `the App's token could not be minted: ${(error as Error).message}; nothing was pushed`;
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
		return `origin refused the push of ${branch}, as printed above`;
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
