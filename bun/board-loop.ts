#!/usr/bin/env bun
/**
 * One pass of the board loop: the user's own script, started from a terminal
 * of their own at the root of a clone used for nothing else. It carries the
 * next apply step of the change the user names in a fresh, unattended
 * `claude -p` session under `stage-goal`'s launch form, then takes the
 * outcome from the goal check it runs itself, never from the session's exit
 * status.
 *
 *   bun bun/board-loop.ts <change>                        (the harness)
 *   bun node_modules/harness/bun/board-loop.ts <change>   (a consumer)
 *
 * It refuses inside a Claude Code session: an agent's `bun` call names no
 * `claude -p` for the classifier to refuse. It never discards work to
 * reach the default branch's tip, and it installs before any session, since
 * `bun install` is an `ask` nobody would answer. Each pass ends on one line
 * and one `loop` record: `met`, `open`, `timeout`, `idle` or `refused`, with
 * exit 0 for `met` and `idle` alone, so a shell loop stops where a person is
 * needed.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { record } from "./gate-ledger.ts";
import { groups } from "./turn-gate.ts";

/** A stage session's limit, fixed by the spec: a longer step is split, never given more. */
export const LIMIT = 60 * 60 * 1000;

/** The default branch, as `branch-state.ts`'s `BASE` names it. */
const DEFAULT = "main";

type Outcome = "met" | "open" | "timeout" | "idle" | "refused";
type Step = { step: number; branch: string };

/** A command's result; one that cannot start reads as failed, never thrown. */
function sh(...args: string[]) {
	try {
		const run = Bun.spawnSync(args);
		const text = (b: Buffer) => b.toString().trim();
		return { ok: run.exitCode === 0, out: text(run.stdout), err: text(run.stderr) };
	} catch {
		return { ok: false, out: "", err: `${args[0]}: not found` };
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

/** The step a `proposed` change would carry next, or why it cannot be taken. */
function consider(slug: string, status: string, blocking: string[]): Step | string {
	if (status !== "proposed") return `it is ${status}, not proposed`;
	if (blocking.length) return `after: ${blocking.join(", ")} is still open`;
	const found = [...groups(readFileSync(`openspec/changes/${slug}/tasks.md`, "utf8"))];
	const step = found.findIndex(([, boxes]) => boxes.open > 0) + 1;
	if (step === 0) return "every group is ticked";
	// `git-and-prs.md`: a single group ships whole on `feat/<slug>`.
	const branch = found.length === 1 ? `feat/${slug}` : `feat/${slug}-${step}`;
	const query = sh("gh", "pr", "list", "--head", branch, "--state", "all", "--json", "number,state");
	let prs: { number?: unknown; state?: unknown }[];
	try {
		prs = query.ok ? JSON.parse(query.out) : undefined;
		if (!Array.isArray(prs)) throw new Error();
	} catch {
		// Never "no pull request": a missed open one would start a second
		// session on a branch under review.
		return "the pull request query failed";
	}
	const open = prs.find((pr) => pr.state === "OPEN");
	if (open) return `pull request #${open.number} is open on ${branch}`;
	// A squash-merged branch is never freed, and nor is a closed one.
	if (prs.length) return `pull request #${prs[0].number} already used ${branch}`;
	return { step, branch };
}

/** The launch form `core/feature-workflow.md` fixes for an apply step. */
function prompt(slug: string, step: number, check: string): string {
	return [
		`/goal Carry step ${step} of the OpenSpec change ${slug}: /opsx:apply ${slug} for its group ${step}, the pre-PR sequence, the push and the pull request.`,
		"This session runs unattended.",
		`The goal is met when the last line of \`bun ${check} apply ${slug} ${step}\`, run after the last push, opens with \`goal met\` — or when the final message opens with \`BLOCKED —\` and names what only the user can settle.`,
	].join("\n");
}

/** One pass. `limit` is lowered only by a test, through an entry module. */
export async function pass(args: string[], limit = LIMIT): Promise<number> {
	// Its presence, whatever its value, before any command runs.
	if ("CLAUDECODE" in process.env)
		return end("refused", "a Claude Code session started it — start the runner from a terminal of your own");
	const [slug, ...rest] = args;
	// A path segment, so it can neither climb out of `openspec/changes/` nor name another tree.
	if (!/^\w[\w.-]*$/.test(slug ?? "") || rest.length)
		return end("refused", "usage: board-loop.ts <change>");

	const top = sh("git", "rev-parse", "--show-toplevel");
	if (!top.ok) return end("refused", "not inside a git repository");
	process.chdir(top.out);
	if (sh("git", "status", "--porcelain", "--untracked-files=no").out)
		return end("refused", "tracked files differ from HEAD — work the last session left");
	if (!sh("git", "for-each-ref", "--contains", "HEAD", "refs/remotes").out)
		return end("refused", "HEAD is on no remote-tracking branch — unpushed work");
	for (const step of [
		["fetch", "-q", "origin"],
		["switch", "-q", DEFAULT],
		["merge", "--ff-only", "-q", `origin/${DEFAULT}`],
	]) {
		const run = sh("git", ...step);
		if (run.ok) continue;
		console.error(run.err);
		const why = step[0] === "merge" ? `${DEFAULT} cannot fast-forward to origin/${DEFAULT}` : `git ${step[0]} failed`;
		return end("refused", `${why}; nothing was merged or reset`);
	}
	const install = sh("bun", "install", "--frozen-lockfile");
	if (!install.ok) {
		console.error([install.out, install.err].filter(Boolean).join("\n"));
		return end("refused", "bun install --frozen-lockfile failed, as printed above");
	}

	// Imported here: `root.ts`, under it, runs git as it loads, and a pass
	// started from a session must have run nothing.
	const { boardState } = await import("./board-state.ts");
	let state: ReturnType<typeof boardState>;
	try {
		state = boardState(top.out);
	} catch (error) {
		console.error((error as Error).message);
		return end("refused", "the tree does not derive a board state, as printed above");
	}
	const takeable = new Map<string, Step>();
	const reasons = new Map<string, string>();
	for (const [name, status] of Object.entries(state.status)) {
		if (status === "done") continue;
		const seen = consider(name, status, state.edges[name]?.blocking ?? []);
		if (typeof seen === "string") {
			reasons.set(name, seen);
			console.log(`passed over ${name}: ${seen}`);
		} else takeable.set(name, seen);
	}
	if (takeable.size === 0) return end("idle", "no change is takeable");
	const chosen = takeable.get(slug);
	if (!chosen)
		return end("refused", `${slug}: ${reasons.get(slug) ?? "no change of that name is proposed"}`);

	const target = `apply ${slug} step ${chosen.step}`;
	const check = join(import.meta.dir, "goal-check.ts");
	console.log(`carrying ${target} on ${chosen.branch}`);
	let late = false;
	try {
		const launch = prompt(slug, chosen.step, relative(top.out, check));
		// Auto mode with nothing to answer prompts; never a bypass of permissions.
		const flags = ["--permission-mode", "auto", "--permission-prompts", "none"];
		const session = Bun.spawn(["claude", "-p", launch, ...flags], {
			stdio: ["ignore", "inherit", "inherit"],
		});
		const timer = setTimeout(() => {
			late = true;
			// shortcut: SIGTERM to `claude` alone; send SIGKILL to its group if one is seen to outlive it.
			session.kill();
		}, limit);
		await session.exited;
		clearTimeout(timer);
	} catch {
		return end("refused", "claude could not be started");
	}
	if (late) return end("timeout", `${target} ran past ${limit / 60_000} minutes`);

	// The check's own verdict at the commit the session left, never the exit status.
	const verdict = sh("bun", check, "apply", slug, String(chosen.step));
	const last = verdict.out.split("\n").at(-1) ?? "";
	if (last.startsWith("goal met")) return end("met", target);
	return end("open", `${target}: ${last || verdict.err || "the goal check printed nothing"}`);
}

if (import.meta.main) process.exit(await pass(process.argv.slice(2)));
