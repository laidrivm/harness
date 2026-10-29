#!/usr/bin/env bun
/**
 * The pre-PR sequence's runner: it runs the sequence's deterministic steps —
 * the diff budget, then the project checks named by `harness.bumpTest` — and
 * records each in the gate ledger for the commit it read. The turn gate, the
 * goal check and `work.ts finish` read those records back as the evidence
 * that the steps passed; no gate line is. The steps that need judgement stay
 * with the agent; its last line names the ones the branch still requires
 * (`pre-pr-steps.ts`), from the diff against the base the budget measured.
 *
 * Both steps always run, and their output passes through untouched: the
 * runner reads only each exit status, and exits with the worse. The records
 * are written whatever the outcomes, once both steps have ended, so a run
 * killed midway leaves none. No record is written while a file differs from
 * `HEAD`, untracked ones included, or when `HEAD` or the tree changed during
 * the run, because a record names a commit and the run would then have read a
 * tree no commit holds.
 *
 * The pre-push hook and CI call `diff-budget.sh` directly, never this, so a
 * push writes no record and cannot stand in for the sequence.
 */
import { join } from "node:path";
import { bumpTest } from "./config.ts";
import { RUNNER_STEPS, recordCheckout } from "./gate-ledger.ts";
import { changedPaths, required } from "./pre-pr-steps.ts";
import { readPullRequests } from "./pull-requests.ts";

// trimEnd: porcelain's first line can open with a space that is part of it.
const git = (...args: string[]) =>
	Bun.spawnSync(["git", ...args]).stdout.toString().trimEnd();
// A status git cannot read is never a clean tree: the failure stands in for its lines.
// The flag overrides `status.showUntrackedFiles`, which can hide the untracked files a step reads;
// `all` names a file in a new directory, where `normal` names only the directory.
const status = () => {
	const run = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"]);
	return run.exitCode === 0 ? run.stdout.toString().trimEnd() : "git status failed";
};
const top = git("rev-parse", "--show-toplevel") || process.cwd();

// Read before the steps run, and again after, so a run that moved either vouches for no commit.
const commit = git("rev-parse", "--verify", "-q", "HEAD");
const dirty = status();

/** 0, 1, or 2 for every other status, a signal's `null` included. */
const exit = (code: number | null) => (code === 0 || code === 1 ? code : 2);
const shown = { stdout: "inherit", stderr: "inherit" } as const;
// Resolved once, so the budget and the step list read one diff.
const base = process.argv[2] || Bun.spawnSync(["bash", join(import.meta.dir, "diff-base.sh")], { cwd: top }).stdout.toString().trim();

const budget = exit(
	// From the top level: the budget's `.` pathspec would otherwise count only the subdirectory.
	Bun.spawnSync(["bash", join(import.meta.dir, "diff-budget.sh"), base, ...process.argv.slice(3)], { cwd: top, ...shown })
		.exitCode,
);
let checks = 2;
try {
	checks = exit(Bun.spawnSync(["sh", "-c", bumpTest(top)], { cwd: top, ...shown }).exitCode);
} catch (error) {
	// An absent or blank key, or a manifest that is no JSON: no command, so no pass.
	console.error(`PRE-PR: project checks not run: ${(error as Error).message}`);
}

// The checks' output can end mid-line; the runner's own lines must each open one.
console.log();
const left = status();
if (!commit || dirty || left || git("rev-parse", "--verify", "-q", "HEAD") !== commit) {
	console.log(
		"PRE-PR: no run record written: files differ from HEAD, HEAD moved during the run, or there is no HEAD. Commit or ignore them, then run this again.",
	);
	if (left || dirty) console.log(left || dirty);
} else {
	const session = process.env.CLAUDE_CODE_SESSION_ID || undefined;
	const codes = [budget, checks]; // in RUNNER_STEPS' order
	// The turn gate matches the top level of the checkout the run read.
	RUNNER_STEPS.forEach((rule, i) =>
		recordCheckout("pre-pr", ["pass", "fail", "error"][codes[i]], rule, { session_id: session, cwd: top }, commit),
	);
}

// A detached HEAD, a failed read and no pull request all read as none open, which requires more steps, never fewer.
const branch = git("symbolic-ref", "--quiet", "--short", "HEAD");
const open = branch !== "" && (readPullRequests(branch)?.some((pr) => pr.state === "OPEN") ?? false);
// Last, so it is read after every step's output.
console.log(`PRE-PR steps: ${required(base ? changedPaths(base) : undefined, open).join(", ")}`);
process.exit(Math.max(budget, checks));
