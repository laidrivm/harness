/**
 * The CI flow `on-event.ts` routes a `workflow_run` delivery to. From the
 * payload alone it drops a run that did not fail, a fork's, and one on a
 * branch the loop does not push; it finds the clone the PR → session table
 * names, or the repository's own for a scheduled run, then takes the
 * repository's lock and re-runs itself under it. There, as the App, it
 * re-reads the run and the pull request and posts the next attempt comment,
 * or the limit comment after three, then resumes the table's session on the
 * failed logs and pushes what it fixed. A scheduled run, or one a later
 * attempt passed, gets a fresh session that files a card and changes nothing.
 * `ci-run-agent`'s design fixes the order.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { LIMIT as HOUR } from "./board-loop.ts";
import { session } from "./board-loop-session.ts";
import { fetched, git, pushed, under } from "./ci-run-clone.ts";
import { draftWhile } from "./ci-run-draft.ts";
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
	join(process.env.PASS_STATE || join(homedir(), "orchestrator"), "locks", `${owner}+${repo}`.toLowerCase() + ".lock");

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
	let row: { clone: string; session: string } | undefined;
	if (run.event === "schedule") {
		if (run.head_branch !== repo?.default_branch)
			return ["ignored", `a scheduled run on ${run.head_branch}, not the default branch`];
		// `HARNESS_CI_CLONES` names another directory, which only the tests do; no session is resumed.
		row = { clone: join(process.env.HARNESS_CI_CLONES || "/home/agent/clones", name.split("/")[1]), session: "" };
	} else {
		if (!/^(feat|spec)\//.test(run.head_branch)) return ["ignored", `branch ${run.head_branch} is neither feat/ nor spec/`];
		row = lookup(name, run.head_branch);
		if (!row) return ["ignored", `the table holds no session for ${run.head_branch}`];
	}
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
	const token = await mint(app, { actions: "read", contents: "write", pull_requests: "write", workflows: "write" });
	const base = `/repos/${app.owner}/${app.repo}`;
	const shown = `${run.html_url} (${run.name ?? "a workflow"}) at ${run.head_sha}`;
	if (run.event === "schedule") {
		acted(marker);
		Object.assign(process.env, credentials(token));
		return fresh(clone, app, run, `scheduled run ${run.html_url} failed on ${run.head_branch}`, (log) =>
			[
				`Scheduled CI run ${shown} failed on ${run.head_branch}, the default branch of ${app.owner}/${app.repo}.`,
				`The failed jobs' logs are in ${log}: read them there, never with gh.`,
				"File one idea card naming the workflow and the run on the board this clone's package.json names under harness.board,",
				"unless a card that is not done already names that workflow's failure.",
				"Change no file and make no commit. Answer blocked, naming the card in the summary.",
			].join("\n"),
		);
	}
	const latest = (await request(`${base}/actions/runs/${run.id}`, token)) as Run;
	// A newer attempt still running or failed has its own event; one that passed makes this run flaky, below.
	if (latest.run_attempt > run.run_attempt && latest.conclusion !== "success")
		return ["ignored", `attempt ${latest.run_attempt} of the run is newer (${latest.conclusion ?? "running"})`];
	const head = encodeURIComponent(`${app.owner}:${run.head_branch}`);
	const [pull] = (await request(`${base}/pulls?state=open&head=${head}`, token)) as Pull[];
	if (!pull) return ["ignored", `no open pull request on ${run.head_branch}`];
	const bot = `${await slug(app)}[bot]`;
	if (pull.user?.login !== bot) return ["ignored", `#${pull.number} is not the App's`];
	if (pull.head?.sha !== run.head_sha) return ["ignored", `#${pull.number} moved past ${run.head_sha}: the run is stale`];
	if (git(clone, "status", "--porcelain", "--untracked-files=no") !== "") return ["failed", `${clone} holds a tracked edit`];
	if (latest.run_attempt > run.run_attempt) {
		acted(marker);
		Object.assign(process.env, credentials(token));
		return fresh(clone, app, run, `attempt ${latest.run_attempt} of the run passed: flaky on #${pull.number}`, (log) =>
			[
				`CI run ${shown} failed on attempt ${run.run_attempt} on #${pull.number}, and attempt ${latest.run_attempt} of it passed.`,
				`The failed attempt's logs are in ${log}: read them there, never with gh.`,
				"File the flaky finding as the card core/testing.md asks for, naming the tests that failed in that attempt.",
				"Change no file and make no commit. Answer flaky, naming the card in the summary.",
			].join("\n"),
		);
	}
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
				"Before you answer fixed, run the pre-PR sequence on the last of them: a commit with no passing pre-PR record is not pushed.",
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
	const [verdict, why] = await draftWhile(`${app.owner}/${app.repo}`, pull.number, () => resume(clone, app, run, resumed, ask, fixing));
	return [verdict, `${said}; ${why}`];
}

/**
 * The session after the comment, in the clone on the pull request's branch,
 * and the push of what it fixed: `ci-run-agent`'s design, *The session*. The
 * clone goes back to the branch it was on and the log file goes, unless the
 * session left the tree unclean, which stays as it is for the user. Beside the
 * outcome, whether the session answered `blocked`, its question on the card.
 */
async function resume(clone: string, app: App, run: Run, id: string, ask: (log: string) => string, fixing: boolean): Promise<[Outcome, boolean]> {
	const branch = run.head_branch;
	// Its commits are the App's bot's, as a board-loop stage's are; read before the clone changes, so a failure leaves it as found.
	const as = await identity(app);
	const back = git(clone, "symbolic-ref", "--short", "-q", "HEAD") ?? git(clone, "rev-parse", "HEAD");
	const log = logOf(run);
	const bundle = log.replace(/\.log$/, ".bundle");
	const done = (outcome: Outcome, asked = false): [Outcome, boolean] => {
		for (const file of [log, bundle]) rmSync(file, { force: true });
		if (back) git(clone, "checkout", "-q", back);
		return [outcome, asked];
	};
	const ready =
		fetched(clone, app, branch, bundle) &&
		git(clone, "switch", "-q", branch) !== undefined &&
		git(clone, "merge", "-q", "--ff-only", `origin/${branch}`) !== undefined;
	const head = git(clone, "rev-parse", "HEAD");
	if (!ready || head !== run.head_sha) return done(["failed", `${clone} could not be brought to ${branch} at ${run.head_sha}`]);
	if (!logged(app, run, log)) return done(["failed", `the failed logs of run ${run.id} could not be read`]);
	const outcome = await answered(clone, ask(log), as, ["-r", id]);
	if (git(clone, "status", "--porcelain") !== "")
		return [["failed", `the session left ${clone} with uncommitted changes; nothing pushed, the clone left as it is`], outcome === "blocked"];
	if (!outcome) return done(["failed", "the session gave no answer that matches the schema; nothing pushed"]);
	if (outcome !== "fixed" || !fixing) return done(["handled", `the session answered ${outcome}, nothing pushed`], outcome === "blocked");
	const on = git(clone, "symbolic-ref", "--short", "-q", "HEAD");
	if (on !== branch) return done(["failed", `the session answered fixed on ${on ?? "no branch"}, not ${branch}; nothing pushed`]);
	const fixed = git(clone, "rev-parse", "HEAD");
	if (fixed === run.head_sha) return done(["failed", `the session answered fixed with no commit after ${run.head_sha}; nothing pushed`]);
	if (git(clone, "merge-base", "--is-ancestor", run.head_sha, "HEAD") === undefined)
		return done(["failed", `${branch} no longer holds ${run.head_sha}; nothing pushed`]);
	const refused = pushed(clone, app, branch, fixed as string, run.head_sha);
	if (refused !== undefined) return done(["failed", refused]);
	return done(["handled", `pushed ${branch} at ${fixed}`]);
}

/**
 * The scheduled and flaky routes' session: a fresh one in the clone, on the
 * event's failed logs, that files a card and changes nothing. The clone is
 * not switched; a session that moved `HEAD` or the tree leaves it as it is,
 * with the log file, for the user.
 */
async function fresh(clone: string, app: App, run: Run, said: string, ask: (log: string) => string): Promise<Outcome> {
	const as = await identity(app);
	const [head, tree] = [git(clone, "rev-parse", "HEAD"), git(clone, "status", "--porcelain")];
	const log = logOf(run);
	if (!logged(app, run, log)) return ["failed", `${said}; the failed logs of run ${run.id} could not be read`];
	const outcome = await answered(clone, ask(log), as, ["--session-id", randomUUID()]);
	if (git(clone, "rev-parse", "HEAD") !== head || git(clone, "status", "--porcelain") !== tree)
		return ["failed", `${said}; the session changed ${clone}, which is left as it is`];
	rmSync(log, { force: true });
	if (!outcome) return ["failed", `${said}; the session gave no answer that matches the schema`];
	return ["handled", `${said}; the session answered ${outcome}`];
}

/** The event's attempt's log file, never the run's latest: a re-run started since would hand over another attempt's logs. */
const logOf = (run: Run) => join(process.env.HARNESS_CI_LOGS || "/home/agent/ci-logs", `${run.id}-${run.run_attempt}.log`);

/** Writes the event's attempt's failed logs to `log` with the runner's `gh`; false when `gh` fails. */
function logged(app: App, run: Run, log: string) {
	const repo = `${app.owner}/${app.repo}`;
	const view = Bun.spawnSync(["gh", "run", "view", String(run.id), "-R", repo, "--attempt", String(run.run_attempt), "--log-failed"], {
		env: process.env,
	});
	if (view.exitCode !== 0) return false;
	mkdirSync(dirname(log), { recursive: true });
	// Readable by the session user's group, which the host gives the directory.
	writeFileSync(log, view.stdout, { mode: 0o640 });
	return true;
}

/** Runs a session in the clone and reads its outcome, or undefined for no answer that matches the schema. */
async function answered(clone: string, prompt: string, as: Record<string, string>, extra: string[]) {
	// `session()` starts `claude` where the runner is. Moved only now, not spawned in the clone, so
	// `bun` itself never read a `bunfig.toml` a session can write; on the host the launcher enters it.
	if (!under(clone).length) process.chdir(clone);
	try {
		// `session()` asks for JSON output itself; the structured answer is in the whole object it printed.
		const flags = [...extra, "--json-schema", SCHEMA];
		const ended = await session(prompt, HOUR, process.kill, true, as, flags, under(clone));
		const answer = JSON.parse(ended.printed).structured_output as { outcome?: unknown; summary?: unknown } | undefined;
		return !ended.late && typeof answer?.summary === "string" ? OUTCOMES.find((o) => o === answer?.outcome) : undefined;
	} catch {
		// A session that cannot start reads as no answer, so the clone is still put back.
		return undefined;
	}
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
