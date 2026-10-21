/**
 * The CI flow `on-event.ts` routes a `workflow_run` delivery to. From the
 * payload alone it drops a run that did not fail, a fork's, and one on a
 * branch the loop does not push; it finds the clone the PR → session table
 * names, then takes the repository's lock and re-runs itself under it. There,
 * as the App, it re-reads the run and the pull request and posts the next
 * attempt comment, or the limit comment after three, then resumes the
 * table's session on the failed logs and pushes what it fixed.
 * `ci-run-agent`'s design fixes the order.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { LIMIT as HOUR } from "./board-loop.ts";
import { over, pushRef } from "./board-loop-push.ts";
import { session } from "./board-loop-session.ts";
import { type App, configured, credentials, identity, mint, repository, request, slug } from "./github-app.ts";
import { lookup } from "./pr-sessions.ts";

export type Outcome = ["handled" | "ignored" | "failed", string];

type Run = {
	id: number;
	conclusion: string | null;
	run_attempt: number;
	head_sha: string;
	head_branch: string;
	event: string;
	name?: string;
	html_url: string;
	head_repository?: { full_name?: string };
};
type Payload = { action?: string; workflow_run?: Run; repository?: { full_name?: string; default_branch?: string } };
type Pull = { number: number; user?: { login?: string }; head?: { sha?: string } };
type Comment = { user?: { login?: string }; body?: string };

const ATTEMPT = "`harness-ci-attempt`";
const LIMIT = "`harness-ci-limit`";
const ATTEMPTS = 3;
const OUTCOMES = ["fixed", "blocked", "flaky"];
const SCHEMA = JSON.stringify({
	type: "object",
	required: ["outcome", "summary"],
	additionalProperties: false,
	properties: { outcome: { enum: OUTCOMES }, summary: { type: "string" } },
});

/** The file `pass.sh` locks for the repository, keyed as it keys it, so a pass and a flow never share a clone. */
export const lockOf = (owner: string, repo: string) =>
	join(process.env.PASS_STATE || join(homedir(), "orchestrator"), "locks", `${owner}-${repo}`.toLowerCase() + ".lock");

/** `git -C <clone> …`'s output, or undefined when it fails; as the App once its credentials are set. */
function git(clone: string, ...args: string[]) {
	const p = Bun.spawnSync(["git", "-C", clone, ...args], { env: process.env });
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
	const locked = Bun.spawn(["flock", "-w", "7200", "-E", "75", lock, "bun", import.meta.path, row.clone, marker, row.session], {
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

/** The flow under the lock, as the App: the re-read, the tracked-edit refusal, the comment and the session. */
async function decide(body: string, clone: string, marker: string, resumed: string): Promise<Outcome> {
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
	const comments: Comment[] = [];
	for (let page = 1; ; page++) {
		const next = (await request(`${base}/issues/${pull.number}/comments?per_page=100&page=${page}`, token)) as Comment[];
		if (!Array.isArray(next)) throw new Error(`the comments of #${pull.number} are not a list`);
		comments.push(...next);
		if (next.length < 100) break;
	}
	const marks = comments.filter((c) => c.user?.login === bot).map((c) => c.body ?? "");
	if (marks.some((b) => b.startsWith(LIMIT))) return ["ignored", `#${pull.number} is past its limit`];
	const attempts = marks.filter((b) => b.startsWith(ATTEMPT));
	if (attempts.some((b) => b.endsWith(` at ${run.head_sha}`)))
		return ["ignored", `${run.head_sha} already has an attempt on #${pull.number}`];
	const post = (text: string) => request(`${base}/issues/${pull.number}/comments`, token, { body: text });
	acted(marker);
	// Into the runner's own environment for the fetch, `gh` and the push; the session's allowlist drops them.
	Object.assign(process.env, credentials(token));
	const n = attempts.length + 1;
	const fixing = n <= ATTEMPTS;
	const shown = `${run.html_url} (${run.name ?? "a workflow"}) at ${run.head_sha}`;
	let said: string;
	let ask: (log: string) => string;
	if (fixing) {
		await post(`${ATTEMPT} ${n}/${ATTEMPTS} — ${run.html_url} at ${run.head_sha}`);
		said = `attempt ${n}/${ATTEMPTS} posted on #${pull.number}`;
		ask = (log) =>
			[
				`CI run ${shown} failed on this step's pull request #${pull.number}; this is fix attempt ${n}/${ATTEMPTS}.`,
				`The failed jobs' logs are in ${log}: read them there, never with gh.`,
				"Fix the failure in new commits on this branch, with no amend, no rebase and no push.",
				"If you cannot, put one question on the step's card under the question gate's mark and answer blocked.",
				"If the failure is no defect of this branch, answer flaky and file the card core/testing.md asks for.",
			].join("\n");
	} else {
		await post(`${LIMIT} — ${ATTEMPTS} attempts used; ${run.html_url} at ${run.head_sha} gets none`);
		said = `#${pull.number} used its ${ATTEMPTS} attempts: limit posted`;
		ask = () =>
			[
				`CI run ${shown} failed again on #${pull.number}, which has used its three fix attempts.`,
				`Change nothing. Put one question on the step's card naming #${pull.number} and its three ${ATTEMPT} comments, and answer blocked.`,
			].join("\n");
	}
	const [verdict, why] = await resume(clone, app, run, resumed, ask, fixing);
	return [verdict, `${said}; ${why}`];
}

/**
 * The session after the comment, in the clone on the pull request's branch,
 * and the push of what it fixed: `ci-run-agent`'s design, *The session*. The
 * clone goes back to the branch it was on and the log file goes, unless the
 * session left the tree unclean, which stays as it is for the user.
 */
async function resume(clone: string, app: App, run: Run, id: string, ask: (log: string) => string, fixing: boolean): Promise<Outcome> {
	const branch = run.head_branch;
	// Its commits are the App's bot's, as a board-loop stage's are; read before the clone changes, so a failure leaves it as found.
	const as = await identity(app);
	const back = git(clone, "symbolic-ref", "--short", "-q", "HEAD") ?? git(clone, "rev-parse", "HEAD");
	const logs = process.env.HARNESS_CI_LOGS || "/home/agent/ci-logs";
	// The event's attempt, never the run's latest: a re-run started since would hand over another attempt's logs.
	const log = join(logs, `${run.id}-${run.run_attempt}.log`);
	const done = (outcome: Outcome): Outcome => {
		rmSync(log, { force: true });
		if (back) git(clone, "checkout", "-q", back);
		return outcome;
	};
	const ready =
		git(clone, "fetch", "-q", over(app), `+refs/heads/${branch}:refs/remotes/origin/${branch}`) !== undefined &&
		git(clone, "switch", "-q", branch) !== undefined &&
		git(clone, "merge", "-q", "--ff-only", `origin/${branch}`) !== undefined;
	const head = git(clone, "rev-parse", "HEAD");
	if (!ready || head !== run.head_sha) return done(["failed", `${clone} could not be brought to ${branch} at ${run.head_sha}`]);
	const repo = `${app.owner}/${app.repo}`;
	const view = Bun.spawnSync(["gh", "run", "view", String(run.id), "-R", repo, "--attempt", String(run.run_attempt), "--log-failed"], {
		env: process.env,
	});
	if (view.exitCode !== 0) return done(["failed", `the failed logs of run ${run.id} could not be read`]);
	mkdirSync(logs, { recursive: true });
	// Readable by the session user's group, which the host gives the directory.
	writeFileSync(log, view.stdout, { mode: 0o640 });
	// `session()` starts `claude` where the runner is. Moved only now, not spawned in the clone, so
	// `bun` itself never read a `bunfig.toml` a session can write.
	process.chdir(clone);
	let answer: { outcome?: unknown; summary?: unknown } | undefined;
	let late = false;
	try {
		// A session that cannot start reads as no answer, so the clone is still put back.
		const ended = await session(ask(log), HOUR, process.kill, true, as, ["-r", id, "--json-schema", SCHEMA, "--output-format", "json"]);
		late = ended.late;
		answer = JSON.parse(ended.out).structured_output;
	} catch {}
	const outcome = !late && typeof answer?.summary === "string" ? OUTCOMES.find((o) => o === answer?.outcome) : undefined;
	if (git(clone, "status", "--porcelain") !== "")
		return ["failed", `the session left ${clone} with uncommitted changes; nothing pushed, the clone left as it is`];
	if (!outcome) return done(["failed", "the session gave no answer that matches the schema; nothing pushed"]);
	if (outcome !== "fixed" || !fixing) return done(["handled", `the session answered ${outcome}, nothing pushed`]);
	const on = git(clone, "symbolic-ref", "--short", "-q", "HEAD");
	if (on !== branch) return done(["failed", `the session answered fixed on ${on ?? "no branch"}, not ${branch}; nothing pushed`]);
	const fixed = git(clone, "rev-parse", "HEAD");
	if (fixed === run.head_sha) return done(["failed", `the session answered fixed with no commit after ${run.head_sha}; nothing pushed`]);
	if (git(clone, "merge-base", "--is-ancestor", run.head_sha, "HEAD") === undefined)
		return done(["failed", `${branch} no longer holds ${run.head_sha}; nothing pushed`]);
	if (!pushRef(over(app), branch).ok) return done(["failed", `GitHub refused the push of ${branch}; neither forced nor retried`]);
	return done(["handled", `pushed ${branch} at ${fixed}`]);
}

// Run by `flow()` under the lock; the verdict is its last line.
if (import.meta.main) {
	const [clone, marker, resumed] = process.argv.slice(2);
	let outcome: Outcome;
	try {
		outcome = await decide(await Bun.stdin.text(), clone, marker, resumed);
	} catch (e) {
		outcome = ["failed", e instanceof Error ? e.message : String(e)];
	}
	console.log(JSON.stringify(outcome));
}
