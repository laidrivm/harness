#!/usr/bin/env bun
/**
 * The goal check: whether one OpenSpec stage of one change is done, decided
 * from the repository, the gate ledger and the pull request, never from the
 * conversation. A `/goal` condition names it, because Claude Code's evaluator
 * reads only the transcript and can match one line where it cannot judge a
 * stage. A launcher reruns it for its own target once the session ends, and
 * reads the exit status: 0 met, 1 open, 2 a call it cannot read.
 *
 *   bun goal-check.ts propose <change>
 *   bun goal-check.ts apply <change> <step>
 *   bun goal-check.ts archive <change>
 *
 * `--before-push`, last, holds every condition but the pull request's, for a
 * session whose launcher pushes and opens it; `HEAD` must still name a branch.
 *
 * Its last line opens `goal met` or `goal open`, never a gate line: the turn
 * gate would read one as the pre-PR sequence's report. Each verdict is
 * recorded in the gate ledger for counting. A record names no change or step,
 * so nothing decides from one, this check included.
 */
import { ran, ranUnder, record, RUNNER_STEPS } from "./gate-ledger.ts";
import { type Pull, readPullRequests } from "./pull-requests.ts";
import { complete, groups } from "./turn-gate.ts";

const git = (...args: string[]) => {
	const run = Bun.spawnSync(["git", ...args]);
	return run.exitCode === 0 ? run.stdout.toString().trim() : undefined;
};

/** Whether `HEAD` holds a path, and what a file there reads, if anything. */
const has = (path: string) => git("cat-file", "-e", `HEAD:${path}`) !== undefined;
const show = (path: string) => git("show", `HEAD:${path}`);

const args = process.argv.slice(2);
// Last alone: anywhere else, twice or misspelt, it leaves an argument the shape refuses.
const before = args.at(-1) === "--before-push";
const [stage, change, step, ...rest] = before ? args.slice(0, -1) : args;
const usage =
	"usage: goal-check.ts propose|archive <change> | apply <change> <step> [--before-push]";
const shaped =
	["propose", "apply", "archive"].includes(stage) &&
	// A path segment, so it can neither climb out of `openspec/changes/` nor
	// name another tree.
	/^[\w][\w.-]*$/.test(change ?? "") &&
	(stage === "apply" ? /^[1-9]\d*$/.test(step ?? "") : step === undefined) &&
	rest.length === 0;
const commit = git("rev-parse", "--verify", "-q", "HEAD");
const top = git("rev-parse", "--show-toplevel");
if (!shaped || !commit || !top) {
	console.log(usage);
	process.exit(2);
}
// A pathspec is read from the working directory, and a session may sit below
// the top level.
process.chdir(top);

const dir = `openspec/changes/${change}`;
const short = commit.slice(0, 7);
const missing: string[] = [];

if (git("status", "--porcelain", "--untracked-files=no"))
	missing.push("tracked files differ from HEAD");

if (stage === "propose" && !has(`${dir}/proposal.md`))
	missing.push(`no ${dir}/proposal.md in HEAD`);

if (stage === "apply") {
	const text = show(`${dir}/tasks.md`);
	// The step-th `## ` group in order, as `git-and-prs.md` numbers the steps.
	const heading = [...groups(text ?? "").keys()][Number(step) - 1];
	if (text === undefined) missing.push(`no ${dir}/tasks.md in HEAD`);
	else if (heading === undefined) missing.push(`tasks.md has no group ${step}`);
	else if (!complete(text).includes(heading))
		missing.push(`group "${heading}" is not complete`);
}

if (stage === "archive") {
	if (has(dir)) missing.push(`${dir}/ is still in HEAD`);
	const archive = "openspec/changes/archive/";
	const moved = (git("ls-tree", "--name-only", "HEAD", archive) ?? "")
		.split("\n")
		.map((path) => path.slice(archive.length))
		// The whole name: a date, then exactly this change.
		.some((name) => /^\d{4}-\d{2}-\d{2}-/.test(name) && name.slice(11) === change);
	if (!moved) missing.push(`no ${archive}<date>-${change}/ in HEAD`);
}

// On the host the record is the session's: made in its clone, in `agent`'s 0600 ledger, which only
// the launcher reads. The runner's own ledger and checkout never stand in for them.
const launcher = process.env.HARNESS_AS_AGENT?.split(" ").filter(Boolean) ?? [];
const recorded = launcher.length
	? ranUnder([...launcher, process.env.HARNESS_CLONE ?? ""], commit)
	: RUNNER_STEPS.every((rule) => ran(commit, top, "pass", undefined, rule));
if (!recorded) missing.push(`no passing pre-PR run record for ${short}`);

const branch = git("symbolic-ref", "--short", "-q", "HEAD");
// Before the push the launcher pushes and opens, so only the branch it pushes is asked for.
if (before) {
	if (!branch) missing.push("HEAD names no branch");
} else missing.push(...pullRequest(branch, commit));

/**
 * What is missing about the pull request whose head should be `HEAD`: one of
 * the branch's, open or merged, so a merge leaves the verdict where it was. One
 * closed unmerged withdraws the step. A failed read is tried three times.
 */
function pullRequest(branch: string | undefined, commit: string): string[] {
	if (!branch) return ["HEAD names no branch"];
	const listed = pullRequests(branch);
	// gh missing, unauthenticated or offline, or no `origin` to name, on every try: an unknown is never met.
	if (!listed) return ["the pull request's state could not be read"];
	const live = listed.filter((pr) => pr?.state === "OPEN" || pr?.state === "MERGED");
	if (live.some((pr) => pr?.headRefOid === commit)) return [];
	if (live.length === 0) return [`no open or merged pull request for ${branch}`];
	const theirs = String(live[0]?.headRefOid).slice(0, 7);
	return [`the pull request's head is ${theirs}, not ${commit.slice(0, 7)}`];
}

/** The branch's pull requests in every state, or undefined after three failed reads. */
function pullRequests(branch: string): Pull[] | undefined {
	const env = process.env.GOAL_CHECK_RETRY_MS ?? "";
	const pause = /^\d+$/.test(env) ? Number(env) : 2000;
	for (let tries = 1; ; tries++) {
		// A read that fails or runs past its limit fails the try.
		const listed = readPullRequests(branch);
		if (listed) return listed;
		if (tries === 3) return undefined;
		Bun.sleepSync(pause);
	}
}

const target = `${stage} ${change}${step ? ` step ${step}` : ""} at ${short}${before ? ", before the push" : ""}`;
const met = missing.length === 0;
console.log(met ? `goal met: ${target}` : `goal open: ${target} — ${missing.join("; ")}`);
// The writer prefers CLAUDE_PROJECT_DIR, which can name another checkout; the
// record names the one the check read, as the runner's does.
delete process.env.CLAUDE_PROJECT_DIR;
record(
	"goal",
	met ? "met" : "open",
	stage,
	{ session_id: process.env.CLAUDE_CODE_SESSION_ID || undefined, cwd: top },
	commit,
);
process.exit(met ? 0 : 1);
