/**
 * `work.ts finish [--card <id>] [--title <text> --body-file <path>]`: ends an
 * agent's work on a branch in the order the draft rule sets — the refusals,
 * then the push while the pull request is a draft, the draft opened when none
 * is, and the ready switch unless a question waits on the card, when one is given
 * (`openspec/changes/work-finish/design.md`, *The sequence and where each
 * refusal sits*). Every refusal comes before the push, changes nothing but
 * the ledger, and is one `finish` record of `HEAD`; a failure after the push
 * leaves the draft and records nothing.
 */
import { statSync } from "node:fs";
import { ready } from "./ci-run-draft.ts";
import { ran, record, RUNNER_STEPS } from "./gate-ledger.ts";
import { integration } from "./notion-ask.ts";
import { waiting } from "./notion-bot.ts";
import { limit, originRepository, readPullRequests, readyOne } from "./pull-requests.ts";

const git = (...args: string[]) => {
	const run = Bun.spawnSync(["git", ...args]);
	// Only git's terminator, not `trim()`: a checkout's path may end in a space (bun/root.ts).
	return run.exitCode === 0 ? run.stdout.toString().replace(/\n$/, "") : undefined;
};

/**
 * What the branch still owes for `commit` in `top`, as lines, none when it
 * owes nothing. `opening` is whether `finish` would open the pull request.
 * shortcut: every runner step's passing record, as the goal check reads them, and `opening` unused; the required-steps change (card 3f739875c31b81e6b473f8a1fb6fa5b3) fills the body from `required()` in `pre-pr-steps.ts` and keeps the call.
 */
export function unproven(commit: string, top: string, opening: boolean): string[] {
	const missing = RUNNER_STEPS.filter((rule) => !ran(commit, top, "pass", undefined, rule));
	if (!missing.length) return [];
	return [`no passing pre-PR run record of ${missing.join(", ")} for ${commit.slice(0, 7)}; run \`bun bun/pre-pr.ts\` on it`];
}

export type Opening = { title: string; body: string };

/** The lines `finish` prints for `card`, if any, the last saying the outcome, and its exit code: 0 ready or waiting, 1 otherwise. */
export async function finish(card: string | undefined, opening?: Opening): Promise<{ lines: string[]; code: number }> {
	const lines: string[] = [];
	const done = (line: string, code: number) => ({ lines: [...lines, line], code });
	const commit = git("rev-parse", "--verify", "-q", "HEAD");
	const top = git("rev-parse", "--show-toplevel");
	const refuse = (id: string, why: string) => {
		// The writer prefers CLAUDE_PROJECT_DIR, which can name another checkout; the record names the one read, as the goal check's does.
		delete process.env.CLAUDE_PROJECT_DIR;
		record("finish", "block", id, { session_id: process.env.CLAUDE_CODE_SESSION_ID || undefined, cwd: top }, commit);
		return done(`finish: refused — ${why}`, 1);
	};
	if (!commit || !top) return refuse("unread-checkout", "no commit in a git checkout here");
	// `!== ""`: a status git cannot read (undefined) is no clean tree. Untracked files are left out.
	if (git("status", "--porcelain", "--untracked-files=no") !== "") return refuse("dirty", "tracked files differ from HEAD; commit them first");
	const branch = git("symbolic-ref", "--short", "-q", "HEAD");
	if (!branch) return refuse("detached", "HEAD names no branch");
	if (branch === "main") return refuse("main", "HEAD is on main, which takes no pull request");

	const repo = originRepository();
	const pulls = repo && readPullRequests(branch, repo);
	if (!repo || !pulls) return refuse("unread", `cannot read the pull requests of ${branch}; check \`gh auth status\``);
	const out = readyOne(pulls);
	if (out) return refuse("ready", `#${out.number} is not a draft, so nothing goes into it; run \`gh pr ready ${out.number} --undo\` first`);
	const open = pulls.find((pr) => pr.state === "OPEN");
	const owed = unproven(commit, top, !open);
	if (owed.length) return refuse("unproven", owed.join("; "));
	if (!open && !opening) return refuse("untitled", `${branch} has no open pull request; pass --title and --body-file to open one`);
	// Before the push, or `gh pr create` would fail on it after the whole suite ran.
	if (!open && opening && !statSync(opening.body, { throwIfNoEntry: false })?.isFile())
		return refuse("unread-body", `the body file ${opening.body} is not a file`);

	const full = `${repo.owner}/${repo.repo}`;
	const failed = (what: string) => done(open ? `finish: draft #${open.number} — ${what}` : `finish: failed — ${what}`, 1);
	// Git runs the pre-push hook, and with it the whole suite, even for a push of nothing.
	if (git("ls-remote", "origin", `refs/heads/${branch}`)?.split("\t")[0] === commit) lines.push(`finish: origin holds ${commit.slice(0, 7)} on ${branch}, no push`);
	else {
		// Inherited, so the hook's test run shows; never --force, never --no-verify.
		const push = Bun.spawnSync(["git", "push", "-u", "origin", "HEAD"], { stdout: "inherit", stderr: "inherit" });
		if (push.exitCode !== 0) return failed(`the push failed, exit ${push.exitCode}`);
		lines.push(`finish: pushed ${commit.slice(0, 7)} to ${branch}`);
	}

	let number = open?.number;
	if (!open && opening) {
		const args = ["--draft", "-R", full, "--base", "main", "--head", branch, "--title", opening.title, "--body-file", opening.body];
		const create = Bun.spawnSync(["gh", "pr", "create", ...args], { timeout: limit(), killSignal: "SIGKILL" });
		const said = create.stderr.toString().trim().split("\n")[0];
		if (create.exitCode !== 0) return failed(`gh pr create exited ${create.exitCode}${said ? `: ${said}` : ""}`);
		const made = readPullRequests(branch, repo)?.filter((pr) => pr.state === "OPEN");
		if (made?.length !== 1) return failed(`the pull request opened for ${branch} could not be read back`);
		number = made[0].number;
		lines.push(`finish: opened draft #${number}`);
	}

	// No card, no question to read: a pin bump or a hotfix has none (`openspec/changes/finish-without-card/`).
	if (card) {
		// Last, after the push and its test run, so it sees a question posted meanwhile.
		const found = integration();
		if (typeof found === "string") return done(`finish: draft #${number} — ${found}, so whether a question waits is unread`, 1);
		try {
			if (await waiting(found.call, card, found.settings.user)) return done(`finish: draft #${number} — a question waits on ${card}`, 0);
		} catch (error) {
			return done(`finish: draft #${number} — the card's comments could not be read: ${(error as Error).message}`, 1);
		}
	}
	if (!ready(full, Number(number))) return done(`finish: draft #${number} — gh pr ready ${number} failed`, 1);
	return done(`finish: ready #${number}`, 0);
}
