#!/usr/bin/env bun
/**
 * The pre-PR sequence's runner: it runs the sequence's deterministic steps —
 * the diff budget, then the project checks named by `harness.bumpTest` — and
 * records each in the gate ledger for the commit it read. The turn gate and
 * the goal check read those records back, so a gate line no longer stands
 * alone as the evidence that a step ran. The steps that need judgement stay
 * with the agent.
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
import { RUNNER_STEPS, record } from "./gate-ledger.ts";

// trimEnd: porcelain's first line can open with a space that is part of it.
const git = (...args: string[]) =>
	Bun.spawnSync(["git", ...args]).stdout.toString().trimEnd();
// A status git cannot read is never a clean tree: the failure stands in for its lines.
const status = () => {
	const run = Bun.spawnSync(["git", "status", "--porcelain"]);
	return run.exitCode === 0 ? run.stdout.toString().trimEnd() : "git status failed";
};
const top = git("rev-parse", "--show-toplevel") || process.cwd();

// Read before the steps run, and again after, so a run that moved either vouches for no commit.
const commit = git("rev-parse", "--verify", "-q", "HEAD");
const dirty = status();

/** 0, 1, or 2 for every other status, a signal's `null` included. */
const exit = (code: number | null) => (code === 0 || code === 1 ? code : 2);
const shown = { stdout: "inherit", stderr: "inherit" } as const;

const budget = exit(
	Bun.spawnSync(["bash", join(import.meta.dir, "diff-budget.sh"), ...process.argv.slice(2)], shown).exitCode,
);
let checks = 2;
try {
	checks = exit(Bun.spawnSync(["sh", "-c", bumpTest(top)], { cwd: top, ...shown }).exitCode);
} catch (error) {
	// An absent or blank key, or a manifest that is no JSON: no command, so no pass.
	console.error(`PRE-PR: project checks not run: ${(error as Error).message}`);
}

const left = status();
if (!commit || dirty || left || git("rev-parse", "--verify", "-q", "HEAD") !== commit) {
	// Not shaped like a gate line, which the turn gate would read as a report.
	console.log(
		"PRE-PR: no run record written: files differ from HEAD, HEAD moved during the run, or there is no HEAD. Commit or ignore them, then run this again.",
	);
	if (left || dirty) console.log(left || dirty);
} else {
	const session = process.env.CLAUDE_CODE_SESSION_ID || undefined;
	// The writer prefers CLAUDE_PROJECT_DIR, which can name another checkout;
	// the turn gate matches the top level of the one the run read.
	delete process.env.CLAUDE_PROJECT_DIR;
	const codes = [budget, checks]; // in RUNNER_STEPS' order
	RUNNER_STEPS.forEach((rule, i) =>
		record("pre-pr", ["pass", "fail", "error"][codes[i]], rule, { session_id: session, cwd: top }, commit),
	);
}
process.exit(Math.max(budget, checks));
