/**
 * `work.ts finish [--card <id>] [--title <text> --body-file <path>]`: ends an
 * agent's work on a branch in the order the draft rule sets — the refusals,
 * then the push while the pull request is a draft, the draft opened when none
 * is, and the ready switch unless a question waits on the card, when one is given
 * (`openspec/changes/archive/2026-10-28-work-finish/design.md`, *The
 * sequence and where each refusal sits*). Where the checkout tracks
 * `.coderabbit.yaml`, it waits for CodeRabbit's run on `HEAD` before the
 * question read and names CodeRabbit's state of `HEAD` after the ready switch
 * (`finish-review-arrives`'s design). Every refusal comes before the
 * push, changes nothing but the ledger, and is one `finish` record of
 * `HEAD`; a failure after the push leaves the draft and records nothing.
 */
import { statSync } from "node:fs";
import { ready } from "./ci-run-draft.ts";
import { arrived, interval, objects, own, type Run, read, type State, state } from "./coderabbit-run.ts";
import { ran, recordCheckout, RUNNER_STEPS } from "./gate-ledger.ts";
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
		recordCheckout("finish", "block", id, { session_id: process.env.CLAUDE_CODE_SESSION_ID || undefined, cwd: top }, commit);
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

	const short = commit.slice(0, 7);
	// Tracked at the top, not present: a gitignored copy is in the author's checkout and absent in a clone.
	const watched = git("-C", top, "ls-files", "--error-unmatch", "--", ".coderabbit.yaml") !== undefined;
	// Before the question read and the ready switch, so the push's event is handled before the ready one; it gates nothing.
	if (watched && !(await reads(12, () => runsOf(full, commit).some((run) => run.status === "completed"))))
		lines.push(`finish: no completed CodeRabbit run on ${short} after 12 reads`);

	// No card, no question to read: a pin bump or a hotfix has none (`work-finish` spec, *No card: no question check*).
	if (!card) lines.push("finish: no --card, so no card's question was read");
	else {
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
	if (!watched) return done(`finish: ready #${number}`, 0);
	// The last read that answered decides, so one failure at the end does not hide the skips before it.
	let last: State = { name: "unread", why: "no read answered" };
	let seen: Run[] = [];
	await reads(18, () => {
		const got = read(full, commit);
		if (Array.isArray(got)) [seen, last] = [got, state(got)];
		else if (last.name === "unread") last = got;
		return !["skipped", "no run", "unread"].includes(last.name);
	});
	// Exit 0 whatever the state: the ready switch went through, and the line is the signal.
	const outcome = last.name === "skipped" ? request(full, Number(number), commit, seen) : said(last, short);
	return done(`finish: ready #${number} — ${outcome}`, 0);
}

const REQUEST = "@coderabbitai review";

/**
 * Posts `@coderabbitai review` on #`n` as whoever `gh` holds, once per head:
 * not when such a comment came at or after `HEAD`'s first CodeRabbit run in
 * `runs`, and only when one more read of `sha`, right before the post, still
 * gives `skipped` (`core/git-and-prs.md` names the one comment as the user's
 * standing permission, answer 4 b). What the last line says of it.
 */
function request(repo: string, n: number, sha: string, runs: Run[]) {
	const skipped = `CodeRabbit skipped ${sha.slice(0, 7)}`;
	const comments = objects(`repos/${repo}/issues/${n}/comments?per_page=100`, ".[] | {created_at, body}");
	if (!Array.isArray(comments)) return `${skipped}; comments unread, nothing asked: ${comments.why}`;
	const since = arrived(runs);
	if (comments.some((c) => String(c.body).trim() === REQUEST && Date.parse(String(c.created_at)) >= since)) return `${skipped}; a review was already asked for`;
	const fresh = read(repo, sha);
	const now = Array.isArray(fresh) ? state(fresh) : fresh;
	if (now.name !== "skipped") return said(now, sha.slice(0, 7));
	const post = Bun.spawnSync(["gh", "pr", "comment", String(n), "-R", repo, "--body", REQUEST], { timeout: limit(), killSignal: "SIGKILL" });
	return post.exitCode === 0 ? `${skipped}; asked for a review` : `${skipped}; the request failed, gh exited ${post.exitCode ?? "killed at its limit"}`;
}

/** CodeRabbit's runs on `sha`, none when the read fails. */
const runsOf = (repo: string, sha: string) => {
	const got = read(repo, sha);
	return Array.isArray(got) ? own(got) : [];
};

/** Calls `enough` up to `times` times, an interval apart, until it answers true; whether it did. */
async function reads(times: number, enough: () => boolean) {
	for (let i = 0; i < times; i++) {
		if (i) await Bun.sleep(interval());
		if (enough()) return true;
	}
	return false;
}

/** What `finish`'s last line says of the state `got` on the commit `short`. */
function said(got: State, short: string) {
	if (got.name === "rate limited") return `CodeRabbit rate limited on ${short}; no review asked for`;
	if (got.name === "other") return `CodeRabbit ${got.conclusion} "${got.title}" on ${short}`;
	if (got.name === "no run") return `no CodeRabbit run on ${short} after 18 reads`;
	if (got.name === "unread") return `CodeRabbit's runs on ${short} unread: ${got.why}`;
	return `CodeRabbit ${got.name} ${short}`;
}
