#!/usr/bin/env bun
/**
 * The pre-PR sequence's runner: it runs the sequence's deterministic step, the
 * diff budget, and records the run in the gate ledger for the commit it read.
 * The turn gate reads that record back, so a gate line no longer stands alone
 * as the evidence that the step ran. The steps that need judgement stay with
 * the agent.
 *
 * The step's gate line and exit status pass through untouched. The record is
 * written whatever the outcome, because it proves only that the step ran. No
 * record is written while a tracked file differs from `HEAD`, because the
 * record names a commit and the run would then have read a tree no commit
 * holds.
 *
 * The pre-push hook and CI call `diff-budget.sh` directly, never this, so a
 * push writes no record and cannot stand in for the sequence.
 */
import { join } from "node:path";
import { record } from "./gate-ledger.ts";

const git = (...args: string[]) =>
	Bun.spawnSync(["git", ...args]).stdout.toString().trim();

// Read before the step runs, so a commit made meanwhile is not the one named.
const commit = git("rev-parse", "--verify", "-q", "HEAD");
const dirty = git("status", "--porcelain", "--untracked-files=no");

const step = Bun.spawnSync(
	["bash", join(import.meta.dir, "diff-budget.sh"), ...process.argv.slice(2)],
	{ stdout: "inherit", stderr: "inherit" },
);
const code = step.exitCode ?? 2;

if (dirty || !commit) {
	// Not shaped like a gate line, which the turn gate would read as a report.
	console.log(
		"PRE-PR: no run record written: tracked files differ from HEAD, or there is no HEAD. Commit, then run this again.",
	);
} else {
	const decision = code === 0 ? "pass" : code === 1 ? "fail" : "error";
	const session = process.env.CLAUDE_CODE_SESSION_ID || undefined;
	// The writer prefers CLAUDE_PROJECT_DIR, which can name another checkout;
	// the turn gate matches the top level of the one the run read.
	delete process.env.CLAUDE_PROJECT_DIR;
	const top = git("rev-parse", "--show-toplevel");
	record(
		"pre-pr",
		decision,
		"diff-budget",
		{ session_id: session, cwd: top },
		commit,
	);
}
process.exit(code);
