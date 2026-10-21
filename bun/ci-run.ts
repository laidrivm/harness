/**
 * The CI flow `on-event.ts` routes a `workflow_run` delivery to. From the
 * payload alone it drops a run that did not fail, a fork's, and one on a
 * branch the loop does not push; it finds the clone the PR → session table
 * names, then takes the repository's lock and re-runs itself under it. There,
 * as the App, it re-reads the run and the pull request and posts the next
 * attempt comment, or the limit comment after three. `ci-run-agent`'s design
 * fixes the order; its group 4 starts the session after the comment.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { configured, mint, repository, request, slug } from "./github-app.ts";
import { lookup } from "./pr-sessions.ts";

export type Outcome = ["handled" | "ignored" | "failed", string];

type Run = {
	id: number;
	conclusion: string | null;
	run_attempt: number;
	head_sha: string;
	head_branch: string;
	event: string;
	html_url: string;
	head_repository?: { full_name?: string };
};
type Payload = { action?: string; workflow_run?: Run; repository?: { full_name?: string; default_branch?: string } };
type Pull = { number: number; user?: { login?: string }; head?: { sha?: string } };
type Comment = { user?: { login?: string }; body?: string };

const ATTEMPT = "`harness-ci-attempt`";
const LIMIT = "`harness-ci-limit`";
const ATTEMPTS = 3;

/** The file `pass.sh` locks for the repository, keyed as it keys it, so a pass and a flow never share a clone. */
export const lockOf = (owner: string, repo: string) =>
	join(process.env.PASS_STATE || join(homedir(), "orchestrator"), "locks", `${owner}-${repo}`.toLowerCase() + ".lock");

/** `git -C <clone> …`'s output, or undefined when it fails. */
function git(clone: string, ...args: string[]) {
	const p = Bun.spawnSync(["git", "-C", clone, ...args]);
	return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
}

/** The repository a clone's `origin` names, as `github-app.ts` reads it. */
const originOf = (clone: string) => {
	const url = git(clone, "config", "--get", "remote.origin.url");
	return url === undefined ? undefined : { url, repo: repository(url) };
};

/** Marks the delivery acted, whole or not at all, so a redelivery after a later failure is a duplicate. */
function acted(marker: string) {
	writeFileSync(`${marker}.${process.pid}.acted`, "acted");
	renameSync(`${marker}.${process.pid}.acted`, marker);
}

/** The flow up to the lock: `body` is the verified payload, `marker` the delivery's file. */
export async function flow(body: string, marker: string): Promise<Outcome> {
	const { action, workflow_run: run, repository: repo } = JSON.parse(body) as Payload;
	if (action !== "completed" || run?.conclusion !== "failure")
		return ["ignored", `the run did not fail (${action}, ${run?.conclusion})`];
	const name = repo?.full_name;
	if (!name || run.head_repository?.full_name !== name) return ["ignored", "the run is a fork's"];
	if (run.event === "schedule" && run.head_branch === repo?.default_branch)
		return ["ignored", "a scheduled run: that route is not built yet"];
	if (!/^(feat|spec)\//.test(run.head_branch)) return ["ignored", `branch ${run.head_branch} is neither feat/ nor spec/`];
	const row = lookup(name, run.head_branch);
	if (!row) return ["ignored", `the table holds no session for ${run.head_branch}`];
	const origin = originOf(row.clone)?.repo;
	if (!origin || `${origin.owner}/${origin.repo}`.toLowerCase() !== name.toLowerCase())
		return ["ignored", `no clone of ${name}: ${row.clone}`];
	const lock = lockOf(origin.owner, origin.repo);
	mkdirSync(dirname(lock), { recursive: true });
	// Bounded where pass.sh's is not: a dropped event is lost, and a pass ends within its hour.
	const locked = Bun.spawn(["flock", "-w", "7200", "-E", "75", lock, "bun", import.meta.path, row.clone, marker], {
		stdin: new Blob([body]),
		stdout: "pipe",
		stderr: "inherit",
	});
	const [out, code] = await Promise.all([new Response(locked.stdout).text(), locked.exited]);
	if (code === 75) return ["failed", `${lock} stayed held past the wait's bound`];
	try {
		return JSON.parse(out.trim().split("\n").at(-1) ?? "") as Outcome;
	} catch {
		return ["failed", `the flow under ${lock} ended ${code} with no verdict`];
	}
}

/** The flow under the lock, as the App: the re-read, the tracked-edit refusal and the comment. */
async function decide(body: string, clone: string, marker: string): Promise<Outcome> {
	const run = (JSON.parse(body) as Payload).workflow_run as Run;
	const app = configured(process.env, originOf(clone)?.url ?? "");
	if (!app) return ["failed", "the App's settings are not set"];
	const token = await mint(app, { actions: "read", contents: "write", pull_requests: "write" });
	const base = `/repos/${app.owner}/${app.repo}`;
	const latest = (await request(`${base}/actions/runs/${run.id}`, token)) as Run;
	// A later attempt that passed is the flaky route's, not built yet; one still running or failed has its own event.
	if (latest.run_attempt > run.run_attempt)
		return ["ignored", `attempt ${latest.run_attempt} of the run is newer (${latest.conclusion ?? "running"})`];
	const head = encodeURIComponent(`${app.owner}:${run.head_branch}`);
	const [pull] = (await request(`${base}/pulls?state=open&head=${head}`, token)) as Pull[];
	if (!pull) return ["ignored", `no open pull request on ${run.head_branch}`];
	const bot = `${await slug(app)}[bot]`;
	if (pull.user?.login !== bot) return ["ignored", `#${pull.number} is not the App's`];
	if (pull.head?.sha !== run.head_sha) return ["ignored", `#${pull.number} moved past ${run.head_sha}: the run is stale`];
	if (git(clone, "status", "--porcelain", "--untracked-files=no") !== "") return ["failed", `${clone} holds a tracked edit`];
	// shortcut: the first 100 comments only; follow the `Link` header once a loop's pull request carries more.
	const comments = (await request(`${base}/issues/${pull.number}/comments?per_page=100`, token)) as Comment[];
	const marks = comments.filter((c) => c.user?.login === bot).map((c) => c.body ?? "");
	if (marks.some((b) => b.startsWith(LIMIT))) return ["ignored", `#${pull.number} is past its limit`];
	const attempts = marks.filter((b) => b.startsWith(ATTEMPT));
	if (attempts.some((b) => b.endsWith(` at ${run.head_sha}`)))
		return ["ignored", `${run.head_sha} already has an attempt on #${pull.number}`];
	const post = (text: string) => request(`${base}/issues/${pull.number}/comments`, token, { body: text });
	acted(marker);
	if (attempts.length >= ATTEMPTS) {
		await post(`${LIMIT} — ${ATTEMPTS} attempts used; ${run.html_url} at ${run.head_sha} gets none`);
		return ["handled", `#${pull.number} used its ${ATTEMPTS} attempts: limit posted`];
	}
	const n = attempts.length + 1;
	await post(`${ATTEMPT} ${n}/${ATTEMPTS} — ${run.html_url} at ${run.head_sha}`);
	return ["handled", `attempt ${n}/${ATTEMPTS} posted on #${pull.number}`];
}

// Run by `flow()` under the lock; the verdict is its last line.
if (import.meta.main) {
	const [clone, marker] = process.argv.slice(2);
	let outcome: Outcome;
	try {
		outcome = await decide(await Bun.stdin.text(), clone, marker);
	} catch (e) {
		outcome = ["failed", e instanceof Error ? e.message : String(e)];
	}
	console.log(JSON.stringify(outcome));
}
