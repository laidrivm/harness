#!/usr/bin/env bun
/**
 * One pass of the board loop: the user's own script, started from a terminal
 * of their own at the root of a clone used for nothing else. A short pick
 * session reads `Board view` and names the first takeable card in the board's
 * order. The pass carries that change's next apply step in a fresh, unattended
 * `claude -p` session under `stage-goal`'s launch form, then takes the
 * outcome from the goal check it runs itself, never from the session's exit
 * status.
 *
 *   bun bun/board-loop.ts                        (the harness)
 *   bun node_modules/harness/bun/board-loop.ts   (a consumer)
 *
 * It refuses inside a Claude Code session: an agent's `bun` call names no
 * `claude -p` for the classifier to refuse. It never discards work to
 * reach the default branch's tip, and it installs before any session, since
 * `bun install` is an `ask` nobody would answer. Each pass ends on one line
 * and one `loop` record: `met`, `open`, `timeout`, `idle` or `refused`, with
 * exit 0 for `met` and `idle` alone, so a shell loop stops where a person is
 * needed.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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

/**
 * Whether Claude Code's config trusts `dir`, keyed by its real path. The path
 * itself only: crediting a trusted parent could pass where Claude Code does not.
 */
function trusted(dir: string): boolean {
	try {
		const config = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
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

/** The pick session's prompt: no goal, and nothing for it to write. */
function pickPrompt(board: string, slugs: string[]): string {
	return [
		`Read the saved view named \`Board view\` of the Notion board ${board}, and change nothing anywhere.`,
		"This session runs unattended.",
		`These changes are takeable: ${slugs.join(", ")}. A card's \`Pointer\` names its change as \`openspec/changes/<slug>/\`.`,
		"Take the `applying` column before `proposed`, and each column in the order the view returns it. Find the first card whose pointer names one of those changes.",
		"End with one line, `PICK: <slug>` for its change or `PICK: none` when no card names one, and write no other line starting `PICK:`.",
	].join("\n");
}

/** One `claude -p` session, ended at `limit`; `capture` keeps its output rather than showing it. */
async function session(text: string, limit: number, capture = false) {
	// Auto mode with nothing to answer prompts; never a bypass of permissions.
	const flags = ["--permission-mode", "auto", "--permission-prompts", "none"];
	// A file, not a pipe: a child the session leaves running could hold a pipe open and stall the pass.
	const dir = capture ? mkdtempSync(join(tmpdir(), "board-loop-")) : "";
	const run = Bun.spawn(["claude", "-p", text, ...flags], {
		stdio: ["ignore", capture ? Bun.file(join(dir, "out")) : "inherit", "inherit"],
	});
	let late = false;
	const timer = setTimeout(() => {
		late = true;
		// shortcut: SIGTERM to `claude` alone; send SIGKILL to its group if one is seen to outlive it.
		run.kill();
	}, limit);
	await run.exited;
	clearTimeout(timer);
	if (!capture) return { late, out: "" };
	const out = readFileSync(join(dir, "out"), "utf8");
	rmSync(dir, { recursive: true });
	return { late, out };
}

/** One pass. `limit` is lowered only by a test, through an entry module. */
export async function pass(args: string[], limit = LIMIT): Promise<number> {
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
	// A local main ahead of origin fast-forwards as "up to date", unpushed work and all.
	if (sh("git", "rev-parse", "HEAD").out !== sh("git", "rev-parse", `origin/${DEFAULT}`).out)
		return end("refused", `${DEFAULT} holds commits origin/${DEFAULT} lacks; nothing was merged or reset`);
	const install = sh("bun", "install", "--frozen-lockfile");
	if (!install.ok) {
		console.error([install.out, install.err].filter(Boolean).join("\n"));
		return end("refused", "bun install --frozen-lockfile failed, as printed above");
	}

	// Imported here: `root.ts`, under it, runs git as it loads, and a pass
	// started from a session must have run nothing.
	const { board, boardState } = await import("./board-state.ts");
	let named: string;
	try {
		named = board(top.out);
	} catch (error) {
		// Names the key, never the value.
		return end("refused", (error as Error).message);
	}
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

	const minutes = `${limit / 60_000} minutes`;
	let picked: Awaited<ReturnType<typeof session>>;
	try {
		picked = await session(pickPrompt(named, [...takeable.keys()]), limit, true);
	} catch {
		return end("refused", "claude could not be started");
	}
	if (picked.late) return end("timeout", `the pick session ran past ${minutes}`);
	if (picked.out.trim()) console.log(picked.out.trim());
	// Untrusted text: one exact line, naming a change this pass computed as takeable.
	const lines = picked.out.split("\n").filter((line) => line.startsWith("PICK:"));
	const slug = lines.length === 1 ? /^PICK: (\w[\w.-]*)$/.exec(lines[0].trimEnd())?.[1] : undefined;
	if (!slug) return end("refused", "the pick session returned not one exact PICK: line");
	if (slug === "none") return end("idle", "the pick session found no takeable card on the board");
	const chosen = takeable.get(slug);
	if (!chosen)
		return end("refused", `the pick session named ${slug}: ${reasons.get(slug) ?? "no change of that name is takeable"}`);

	const target = `apply ${slug} step ${chosen.step}`;
	const check = join(import.meta.dir, "goal-check.ts");
	console.log(`carrying ${target} on ${chosen.branch}`);
	let late: boolean;
	try {
		({ late } = await session(prompt(slug, chosen.step, relative(top.out, check)), limit));
	} catch {
		return end("refused", "claude could not be started");
	}
	if (late) return end("timeout", `${target} ran past ${minutes}`);

	// The check's own verdict at the commit the session left, never the exit status.
	const verdict = sh("bun", check, "apply", slug, String(chosen.step));
	const last = verdict.out.split("\n").at(-1) ?? "";
	if (last.startsWith("goal met")) return end("met", target);
	return end("open", `${target}: ${last || verdict.err || "the goal check printed nothing"}`);
}

if (import.meta.main) process.exit(await pass(process.argv.slice(2)));
