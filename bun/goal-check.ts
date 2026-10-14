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
 * Its last line opens `goal met` or `goal open`, never a gate line: the turn
 * gate would read one as the pre-PR sequence's report. Each verdict is
 * recorded in the gate ledger for counting. A record names no change or step,
 * so nothing decides from one, this check included.
 */
import { ran, record } from "./gate-ledger.ts";
import { complete, groups } from "./turn-gate.ts";

const git = (...args: string[]) => {
	const run = Bun.spawnSync(["git", ...args]);
	return run.exitCode === 0 ? run.stdout.toString().trim() : undefined;
};

/** Whether `HEAD` holds a path, and what a file there reads, if anything. */
const has = (path: string) => git("cat-file", "-e", `HEAD:${path}`) !== undefined;
const show = (path: string) => git("show", `HEAD:${path}`);

const [stage, change, step, ...rest] = process.argv.slice(2);
const usage =
	"usage: goal-check.ts propose|archive <change> | apply <change> <step>";
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

if (!ran(commit, top, "pass"))
	missing.push(`no passing pre-PR run record for ${short}`);

const branch = git("symbolic-ref", "--short", "-q", "HEAD");
missing.push(...pullRequest(branch, commit));

/** What is missing about the open pull request whose head should be `HEAD`. */
function pullRequest(branch: string | undefined, commit: string): string[] {
	if (!branch) return ["HEAD names no branch"];
	let heads: string[];
	try {
		const query = ["gh", "pr", "list", "--head", branch, "--state", "open"];
		const run = Bun.spawnSync([...query, "--json", "headRefOid"]);
		if (run.exitCode !== 0) throw new Error();
		heads = JSON.parse(run.stdout.toString()).map(
			(pr: { headRefOid?: unknown }) => pr.headRefOid,
		);
	} catch {
		// gh missing, unauthenticated or offline: an unknown is never met.
		return ["the pull request's state could not be read"];
	}
	if (heads.includes(commit)) return [];
	if (heads.length === 0) return [`no open pull request for ${branch}`];
	const theirs = String(heads[0]).slice(0, 7);
	return [`the open pull request's head is ${theirs}, not ${commit.slice(0, 7)}`];
}

const target = `${stage} ${change}${step ? ` step ${step}` : ""} at ${short}`;
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
