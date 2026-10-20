#!/usr/bin/env bun
/**
 * One pass of the board loop: the user's own script, started from a terminal
 * of their own or a host timer they set up (`orchestrator/pass.sh`), at the
 * root of a clone used for nothing else. Two passes at once need two clones,
 * never two worktrees of one. A short pick
 * session reads `Board view`, names the first takeable card in the board's
 * order, a card whose question the user answered first, and claims it. The
 * pass carries that change's next apply step, or the answer as step N+1, in a
 * fresh, unattended `claude -p` session under `stage-goal`'s launch form, which
 * pushes nothing. The runner then pushes the step's branch and opens its pull
 * request when the session left it ready, and takes the outcome from the goal
 * check it runs itself, never from the session's exit status.
 *
 *   bun bun/board-loop.ts                        (the harness)
 *   bun node_modules/harness/bun/board-loop.ts   (a consumer)
 *
 * It refuses inside a Claude Code session: an agent's `bun` call names no
 * `claude -p` for the classifier to refuse. It never discards work to
 * reach the default branch's tip: it refuses a tracked edit, and an unpushed
 * tip unless that is a step's branch, left for the session that carries the
 * step. It installs before any session, since
 * `bun install` is an `ask` nobody would answer. Each pass ends on one line
 * and one `loop` record: `met`, `open`, `timeout`, `idle` or `refused`, with
 * exit 0 for `met` and `idle` alone, so a shell loop stops where a person is
 * needed.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { publish, sh } from "./board-loop-push.ts";
import { type Kill, session } from "./board-loop-session.ts";
import { record } from "./gate-ledger.ts";
import { configured, identity } from "./github-app.ts";
import { readPullRequests } from "./pull-requests.ts";
import { MARK } from "./question-gate.ts";
import { groups } from "./turn-gate.ts";

/** A stage session's limit, fixed by the spec: a longer step is split, never given more. */
export const LIMIT = 60 * 60 * 1000;

/** The default branch, as `branch-state.ts`'s `BASE` names it. */
const DEFAULT = "main";

type Outcome = "met" | "open" | "timeout" | "idle" | "refused";
/** `answer`: every group is ticked, so the step is N+1 and carries the answer on the card. */
type Step = { step: number; branch: string; answer: boolean };

/**
 * Whether Claude Code's config trusts `dir`, keyed by its real path. The path
 * itself only: crediting a trusted parent could pass where Claude Code does not.
 */
function trusted(dir: string): boolean {
	try {
		// Where Claude Code keeps it: `CLAUDE_CONFIG_DIR` when set, the home otherwise.
		const home = process.env.CLAUDE_CONFIG_DIR || homedir();
		const config = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
		return config?.projects?.[dir]?.hasTrustDialogAccepted === true;
	} catch {
		return false;
	}
}

/** Prints the pass's one line and records it. Recording never changes it. */
function end(outcome: Outcome, detail: string): number {
	console.log(`board-loop: ${outcome} — ${detail}`);
	// The writer prefers CLAUDE_PROJECT_DIR, which can name another checkout.
	delete process.env.CLAUDE_PROJECT_DIR;
	record("loop", outcome, "apply", { cwd: process.cwd() });
	return outcome === "met" || outcome === "idle" ? 0 : 1;
}

/**
 * The step a `proposed` change would carry next, or why it cannot be taken. A
 * change with every group ticked is an answer candidate for step N+1, which
 * only the pick session can tell from one with no answer on its card.
 */
function consider(slug: string, status: string, blocking: string[]): Step | string {
	if (status !== "proposed") return `it is ${status}, not proposed`;
	if (blocking.length) return `after: ${blocking.join(", ")} is still open`;
	const found = [...groups(readFileSync(`openspec/changes/${slug}/tasks.md`, "utf8"))];
	const answer = found.every(([, boxes]) => boxes.open === 0);
	const step = answer ? found.length + 1 : found.findIndex(([, boxes]) => boxes.open > 0) + 1;
	// `git-and-prs.md`: a single group ships whole on `feat/<slug>`; an answer makes it two.
	const branch = found.length === 1 && !answer ? `feat/${slug}` : `feat/${slug}-${step}`;
	const prs = readPullRequests(branch);
	// Never "no pull request": a missed open one would start a second
	// session on a branch under review.
	if (!prs) return "the pull request query failed";
	const open = prs.find((pr) => pr.state === "OPEN");
	if (open) return `pull request #${open.number} is open on ${branch}`;
	// A squash-merged branch is never freed, and nor is a closed one.
	if (prs.length) return `pull request #${prs[0].number} already used ${branch}`;
	return { step, branch, answer };
}

/**
 * Whether the step's branch exists, in the clone or on `origin` as the pass's
 * fetch left it: a session that ended before its pull request left it.
 */
const left = (branch: string) =>
	[`refs/heads/${branch}`, `refs/remotes/origin/${branch}`].some((ref) => sh("git", "rev-parse", "--verify", "-q", ref).ok);

/**
 * The launch form `core/feature-workflow.md` fixes for an apply step, or its
 * answer variant, the first line naming a branch a session left.
 */
function prompt(slug: string, { step, branch, answer }: Step, check: string, resumed: boolean): string {
	const work = answer
		? `write the answer on its card into its tasks.md as group ${step}, then /opsx:apply ${slug} for that group`
		: `/opsx:apply ${slug} for its group ${step}`;
	// task-board, *The answer asks for a change of its own*: the check then reads `open`, by design.
	const instead = answer
		? " — or, when the answer asks for a change of its own or its work would not fit one step, file an `idea` card for it, clear the card's `Assign`, add no group and end with `BLOCKED — <that card>`"
		: "";
	// Never `git switch -c`: a local branch makes it fail, and one on `origin` alone a second branch from main.
	const resume = resumed
		? ` A session left the branch ${branch}: switch to it with \`git switch ${branch}\` rather than create it, and carry on from what its commits hold.`
		: "";
	return [
		`/goal Carry step ${step} of the OpenSpec change ${slug}: ${work} and the pre-PR sequence, up to a committed HEAD on the branch of the step — the runner, not this session, pushes that branch and opens the pull request${instead}.${resume}`,
		"This session runs unattended.",
		`The goal is met when the last line of \`bun ${check} apply ${slug} ${step} --before-push\`, run after the last commit, opens with \`goal met\` — or when the final message opens with \`BLOCKED —\` and names what only the user can settle.`,
		// No apostrophe: the doc's form wraps the prompt in the shell's single quotes.
		`A question only the user can settle goes on the card of the change as one page-level comment — \`page_id\` and \`markdown\` only, after reading that card and its comments — whose markdown opens with ${MARK}, its two backticks included.`,
		// `board-loop-push.ts` reads these two, as the pass reads `PICK:`.
		"When the pull request is to open, end the final message with a line `PR-TITLE: <title>`, then a line `PR-BODY:` with the body below it to the end; when a gate line holds the pull request back, write neither.",
	].join("\n");
}

/**
 * The pick session's prompt: no goal, and one write, the claim. The runner
 * neither reads nor waits on that move, since it has no access to the board,
 * and a pass that fails after it leaves the card at `applying` for the next.
 */
function pickPrompt(board: string, slugs: string[], answers: string[]): string {
	return [
		`Read the saved view named \`Board view\` of the Notion board ${board}, and change nothing but the \`Status\` of the card you pick.`,
		"This session runs unattended.",
		`These changes are takeable: ${slugs.join(", ") || "none"}. A card's \`Pointer\` names its change as \`openspec/changes/<slug>/\`.`,
		`These changes are answer candidates: ${answers.join(", ") || "none"}. Take one only when its card's \`Assign\` holds the user and its page-level discussion, read with \`notion-get-comments\` with \`include_resolved: true\` (the default leaves resolved ones out) and never a comment on a block, holds a comment opening with \`harness-question\` and, after the last such comment, one by the user \`Assign\` names that does not open with it. That last question counts whichever account posted it, a Notion integration included. A card with no such question is no answer.`,
		"Take an answered candidate's card first, from `applied` or `applying`, then the `applying` column, then `proposed`, and each in the order the view returns it. Find the first card whose pointer names a takeable change or an answered candidate.",
		"Before you answer, set the `Status` of the card your `PICK:` line names to `applying` when it reads `proposed`, or when it reads `applied` and names an answer candidate, then fetch that card again, and write no other card or property. Write nothing when that line names no change listed above. Leave a card already at `applying` unwritten. A write that fails changes nothing about your answer.",
		"End with one line, `PICK: <slug>` for its change or `PICK: none` when no card names one, and write no other line starting `PICK:`.",
	].join("\n");
}

/** One pass. `limit` and `kill` are replaced only by a test, through an entry module. */
export async function pass(args: string[], limit = LIMIT, kill: Kill = process.kill): Promise<number> {
	// Its presence, whatever its value, before any command runs.
	if ("CLAUDECODE" in process.env)
		return end("refused", "a Claude Code session started it — start the runner from a terminal of your own");
	if (args.length) return end("refused", "usage: board-loop.ts — it takes no argument and follows Board view");

	const top = sh("git", "rev-parse", "--show-toplevel");
	if (!top.ok) return end("refused", "not inside a git repository");
	process.chdir(top.out);
	// In a folder nobody trusted Claude Code ignores the tracked `permissions.allow`,
	// so under `--permission-prompts none` the session's every unlisted call is refused.
	const real = realpathSync(top.out);
	if (!trusted(real))
		return end("refused", `not a trusted workspace — run claude once in ${real}, accept the trust dialog and /exit`);
	if (sh("git", "status", "--porcelain", "--untracked-files=no").out)
		return end("refused", "tracked files differ from HEAD — work the last session left");
	// An unpushed tip may be a dead session's step branch: noted, and judged once the steps are known.
	const unpushed = !sh("git", "for-each-ref", "--contains", "HEAD", "refs/remotes").out;
	const noted = unpushed ? sh("git", "branch", "--show-current").out : "";
	// No branch name keeps a detached HEAD's commits once the pass switches off it.
	if (unpushed && !noted) return end("refused", "HEAD names no branch and is on no remote-tracking branch — unpushed work");
	/** A refusal goes back to the noted branch first, so the next pass sees its tip again. */
	const refuse = (detail: string) =>
		end("refused", !noted || sh("git", "switch", "-q", noted).ok ? detail : `${detail}; switching back to ${noted} failed`);
	for (const step of [
		["fetch", "-q", "origin"],
		["switch", "-q", DEFAULT],
		["merge", "--ff-only", "-q", `origin/${DEFAULT}`],
	]) {
		const run = sh("git", ...step);
		if (run.ok) continue;
		console.error(run.err);
		const why = step[0] === "merge" ? `${DEFAULT} cannot fast-forward to origin/${DEFAULT}` : `git ${step[0]} failed`;
		return refuse(`${why}; nothing was merged or reset`);
	}
	// A local main ahead of origin fast-forwards as "up to date", unpushed work and all.
	if (sh("git", "rev-parse", "HEAD").out !== sh("git", "rev-parse", `origin/${DEFAULT}`).out)
		return refuse(`${DEFAULT} holds commits origin/${DEFAULT} lacks; nothing was merged or reset`);
	const install = sh("bun", "install", "--frozen-lockfile");
	if (!install.ok) {
		console.error([install.out, install.err].filter(Boolean).join("\n"));
		return refuse("bun install --frozen-lockfile failed, as printed above");
	}
	// The pinned copy, in the harness too: a session that edits the tree's check must not judge itself.
	const check = join(real, "node_modules/harness/bun/goal-check.ts");
	if (!existsSync(check))
		return refuse("node_modules/harness/bun/goal-check.ts is missing — run bun install");
	// The verdict runs a copy taken before any session, outside the clone, which an
	// edit under `node_modules/harness/` cannot reach. Its imports all sit beside it.
	const judge = mkdtempSync(join(tmpdir(), "board-loop-judge-"));
	process.on("exit", () => rmSync(judge, { recursive: true, force: true }));
	cpSync(dirname(check), judge, { recursive: true });

	// Imported here: `root.ts`, under it, runs git as it loads, and a pass
	// started from a session must have run nothing.
	const { board, boardState } = await import("./board-state.ts");
	let named: string;
	try {
		named = board(top.out);
	} catch (error) {
		// Names the key, never the value.
		return refuse((error as Error).message);
	}
	let state: ReturnType<typeof boardState>;
	try {
		state = boardState(top.out);
	} catch (error) {
		console.error((error as Error).message);
		return refuse("the tree does not derive a board state, as printed above");
	}
	// Takeable changes and answer candidates alike; `answer` tells them apart.
	const steps = new Map<string, Step>();
	const reasons = new Map<string, string>();
	for (const [name, status] of Object.entries(state.status)) {
		if (status === "done") continue;
		const seen = consider(name, status, state.edges[name]?.blocking ?? []);
		if (typeof seen === "string") {
			reasons.set(name, seen);
			console.log(`passed over ${name}: ${seen}`);
		} else steps.set(name, seen);
	}
	if (noted && ![...steps.values()].some((s) => s.branch === noted))
		return refuse(`unpushed work on ${noted}, which is no step's branch`);
	if (noted) console.log(`leaving ${noted}, unpushed, for the pass that carries its step`);
	if (steps.size === 0) return end("idle", "no change is takeable");
	const listed = (answer: boolean) => [...steps].filter(([, s]) => s.answer === answer).map(([name]) => name);

	const minutes = `${limit / 60_000} minutes`;
	/** A session ends clean, or the pass names what outlived it and records no planned outcome. */
	const unclean = (what: string, { late, left }: { late: boolean; left?: number }) => {
		const outlived = left ? `process group ${left} outlived ${what} — see pgrep -g ${left}` : "";
		if (late) return end("timeout", [`${what} ran past ${minutes}`, outlived].filter(Boolean).join("; "));
		// Never `refuse()`: a switch back would move the tree under a process still running in it.
		if (left) return end("refused", `${outlived}; the clone is left as the session left it`);
	};
	// The App, when one is configured, and its bot's identity for both sessions' commits, before either.
	let app: ReturnType<typeof configured>;
	let as: Record<string, string> = {};
	try {
		app = configured(process.env, sh("git", "config", "--get", "remote.origin.url").out);
		if (app) as = await identity(app);
	} catch (error) {
		return refuse((error as Error).message);
	}
	let picked: Awaited<ReturnType<typeof session>>;
	try {
		picked = await session(pickPrompt(named, listed(false), listed(true)), limit, kill, true, as);
	} catch {
		return refuse("claude could not be started");
	}
	const pickEnd = unclean("the pick session", picked);
	if (pickEnd !== undefined) return pickEnd;
	if (picked.out.trim()) console.log(picked.out.trim());
	// Untrusted text: one exact line, naming a change this pass computed as takeable or a candidate.
	const lines = picked.out.split("\n").filter((line) => line.startsWith("PICK:"));
	const slug = lines.length === 1 ? /^PICK: (\w[\w.-]*)$/.exec(lines[0].trimEnd())?.[1] : undefined;
	if (!slug) return refuse("the pick session returned not one exact PICK: line");
	if (slug === "none") return end("idle", "the pick session found no takeable card on the board");
	const chosen = steps.get(slug);
	if (!chosen)
		return refuse(`the pick session named ${slug}: ${reasons.get(slug) ?? "no change of that name is takeable"}`);

	const target = `apply ${slug} step ${chosen.step}`;
	// The runner names the branch, never deletes or resets it, and pushes it only once the step is ready.
	const resumed = left(chosen.branch);
	if (resumed) console.log(`continuing ${chosen.branch}, which a session left`);
	console.log(`carrying ${target} on ${chosen.branch}`);
	let staged: Awaited<ReturnType<typeof session>>;
	try {
		// Captured, for its title and body: in text mode it prints nothing before its final message.
		staged = await session(prompt(slug, chosen, relative(real, check), resumed), limit, kill, true, as);
	} catch {
		return refuse("claude could not be started");
	}
	const stageEnd = unclean(target, staged);
	if (stageEnd !== undefined) return stageEnd;
	if (staged.out.trim()) console.log(staged.out.trim());

	const judged = [join(judge, "goal-check.ts"), "apply", slug, String(chosen.step)];
	const unready = await publish(staged.out, judged, chosen.branch, DEFAULT, app);
	if (unready !== undefined) return end("open", `${target}: ${unready}`);
	// The check's own verdict at the commit the session left, never the exit status.
	const verdict = sh("bun", ...judged);
	const last = verdict.out.split("\n").at(-1) ?? "";
	if (last.startsWith("goal met")) return end("met", target);
	return end("open", `${target}: ${last || verdict.err || "the goal check printed nothing"}`);
}

if (import.meta.main) process.exit(await pass(process.argv.slice(2)));
