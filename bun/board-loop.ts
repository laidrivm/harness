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
 * step, or one whose every commit `origin`'s main holds by patch, a merged
 * branch's leftover it switches off. It installs before any session, since
 * `bun install` is an `ask` nobody would answer. Each pass ends on one line
 * and one `loop` record: `met`, `open`, `waiting`, `timeout`, `idle`, `retry` or
 * `refused`, with exit 0 for `met`, `idle` and `waiting`, and 75 (`EX_TEMPFAIL`)
 * for `retry`, a transient failure the next tick may not meet: a `waiting`
 * pass leaves no stop file and a later pick passes over its card, while every
 * other outcome stops a shell loop where a person is needed.
 */
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { leftover } from "./board-loop-leftover.ts";
import { pickPrompt, prompt, type Step } from "./board-loop-prompt.ts";
import { publish, sh } from "./board-loop-push.ts";
import { type Kill, session, trusted } from "./board-loop-session.ts";
import { consider, left } from "./board-loop-takeable.ts";
import { record } from "./gate-ledger.ts";
import { configured, identity } from "./github-app.ts";
import { ALREADY, asked, own, POSTED, post, type Settings, settings, UNREACHED } from "./notion-bot.ts";
import { triage } from "./notion-triage.ts";
import { ASK_SETTINGS, RUNNER_ASKS, where } from "./question-gate.ts";
import { network, TEMPFAIL, Transient } from "./transient.ts";

/** A stage session's limit, fixed by the spec: a longer step is split, never given more. */
export const LIMIT = 60 * 60 * 1000;

/** The default branch, as `branch-state.ts`'s `BASE` names it. */
const DEFAULT = "main";

type Outcome = "met" | "open" | "waiting" | "timeout" | "idle" | "refused" | "retry";

/** Prints the pass's one line and records it. Recording never changes it. */
function end(outcome: Outcome, detail: string): number {
	console.log(`board-loop: ${outcome} — ${detail}`);
	// The writer prefers CLAUDE_PROJECT_DIR, which can name another checkout.
	delete process.env.CLAUDE_PROJECT_DIR;
	record("loop", outcome, "apply", { cwd: process.cwd() });
	return outcome === "retry" ? TEMPFAIL : outcome === "met" || outcome === "idle" || outcome === "waiting" ? 0 : 1;
}

/** One pass. `limit` and `kill` are replaced only by a test, through an entry module. */
export async function pass(args: string[], limit = LIMIT, kill: Kill = process.kill): Promise<number> {
	// Its presence, whatever its value, before any command runs.
	if ("CLAUDECODE" in process.env)
		return end("refused", "a Claude Code session started it — start the runner from a terminal of your own");
	if (args.length) return end("refused", "usage: board-loop.ts — it takes no argument and follows Board view");
	// On the host the pass runs in its push clone, and the session's clone is `agent`'s: every command
	// there runs as `<launcher words> <clone> <command…>`, and every bun of the runner's keeps a tree's
	// bunfig.toml and .env out. With no launcher the clone is the one the pass runs in.
	const launcher = process.env.HARNESS_AS_AGENT?.split(" ").filter(Boolean) ?? [];
	if (launcher.length && !process.env.HARNESS_CLONE)
		return end("refused", "HARNESS_AS_AGENT is set and HARNESS_CLONE names no clone");
	const bun = launcher.length ? ["--config=/dev/null", "--no-env-file"] : [];

	const top = sh("git", "rev-parse", "--show-toplevel");
	if (!top.ok) return end("refused", "not inside a git repository");
	process.chdir(top.out);
	const under = launcher.length ? [...launcher, process.env.HARNESS_CLONE as string] : [];
	const at = (...cmd: string[]) => sh(...under, ...cmd);
	// In a folder nobody trusted Claude Code ignores the tracked `permissions.allow`,
	// so under `--permission-prompts none` the session's every unlisted call is refused.
	const real = launcher.length ? at("pwd", "-P").out : realpathSync(top.out);
	const config = launcher.length ? at("sh", "-c", 'cat "${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json"').out : undefined;
	if (!trusted(real, config))
		return end("refused", `not a trusted workspace — run claude once in ${real}, accept the trust dialog and /exit`);
	const edited = () => !!at("git", "status", "--porcelain", "--untracked-files=no").out;
	if (edited()) return end("refused", "tracked files differ from HEAD — work the last session left");
	// An unpushed tip may be a dead session's step branch: noted, and judged once the steps are known.
	const held = () => !!at("git", "for-each-ref", "--contains", "HEAD", "refs/remotes").out;
	const unpushed = !held();
	let noted = unpushed ? at("git", "branch", "--show-current").out : "";
	// No branch name keeps a detached HEAD's commits once the pass switches off it.
	if (unpushed && !noted) return end("refused", "HEAD names no branch and is on no remote-tracking branch — unpushed work");
	/** A refusal goes back to the noted branch first, so the next pass sees its tip again. */
	const refuse = (detail: string, outcome: "refused" | "retry" = "refused") =>
		end(outcome, !noted || at("git", "switch", "-q", noted).ok ? detail : `${detail}; switching back to ${noted} failed`);
	for (const step of [
		["fetch", "-q", "origin"],
		["switch", "-q", DEFAULT],
		["merge", "--ff-only", "-q", `origin/${DEFAULT}`],
	]) {
		const run = at("git", ...step);
		// The fetch may bring the tip itself: the host's runner pushes a step's branch from a clone of its own.
		const off = run.ok && noted && step[0] === "fetch" && (leftover(at, DEFAULT) ? `origin/${DEFAULT} holds its every commit by patch` : held() && "origin holds its tip");
		if (off) {
			console.log(`switching off ${noted}: ${off}`);
			noted = "";
		}
		if (run.ok) continue;
		console.error(run.err);
		const why = step[0] === "merge" ? `${DEFAULT} cannot fast-forward to origin/${DEFAULT}` : `git ${step[0]} failed`;
		return refuse(`${why}; nothing was merged or reset`, step[0] === "fetch" && network(run.err) ? "retry" : "refused");
	}
	// A local main ahead of origin fast-forwards as "up to date", unpushed work and all.
	if (at("git", "rev-parse", "HEAD").out !== at("git", "rev-parse", `origin/${DEFAULT}`).out)
		return refuse(`${DEFAULT} holds commits origin/${DEFAULT} lacks; nothing was merged or reset`);
	const install = at("bun", "install", "--frozen-lockfile");
	if (!install.ok) {
		console.error([install.out, install.err].filter(Boolean).join("\n"));
		return refuse("bun install --frozen-lockfile failed, as printed above");
	}
	// The pinned copy, in the harness too: a session that edits the tree's check must not judge itself.
	const check = join(real, "node_modules/harness/bun/goal-check.ts");
	if (launcher.length ? !at("test", "-f", check).ok : !existsSync(check))
		return refuse("node_modules/harness/bun/goal-check.ts is missing — run bun install");
	// The verdict runs a copy taken before any session, outside the clone, which an
	// edit under `node_modules/harness/` cannot reach. Its imports all sit beside it.
	// On the host, the runner's own checkout at the pin, which no session writes.
	const judge = launcher.length ? import.meta.dir : mkdtempSync(join(tmpdir(), "board-loop-judge-"));
	if (!launcher.length) {
		process.on("exit", () => rmSync(judge, { recursive: true, force: true }));
		cpSync(dirname(check), judge, { recursive: true });
	}

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
	// Before `idle`, so a host left without the integration's settings shows it on every tick.
	let bot: Settings | undefined;
	try {
		bot = settings(where("notion-bot.json"));
	} catch (error) {
		return refuse((error as Error).message);
	}
	// A host session left notion-create-comment posts as whoever the host's Notion MCP is signed in as: the user.
	if (under.length && !bot)
		return refuse(`on the host the runner posts each question from the Notion integration, and ${where("notion-bot.json")} is missing`);
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
	// The integration's own id too: its token stays in this process, a header to `fetch` alone.
	let app: ReturnType<typeof configured>;
	let as: Record<string, string> = {};
	try {
		app = configured(process.env, sh("git", "config", "--get", "remote.origin.url").out);
		if (app) as = await identity(app);
		// The author whose `harness-answer` counts, named to the pick and to REST step 3.
		if (bot) bot.self = await own(bot.token);
	} catch (error) {
		return refuse((error as Error).message, error instanceof Transient ? "retry" : "refused");
	}
	// The gate refuses every comment where it sees the variable; the withheld tool, where it does not.
	if (bot) as = { ...as, [RUNNER_ASKS.name]: RUNNER_ASKS.value };
	const withheld = bot ? ["--disallowedTools", "mcp__*__notion-create-comment"] : [];
	let picked: Awaited<ReturnType<typeof session>>;
	try {
		picked = await session(pickPrompt(named, listed(false), listed(true), bot?.self, bot?.user), limit, kill, true, as, withheld, under);
	} catch {
		return refuse("claude could not be started");
	}
	const pickEnd = unclean("the pick session", picked);
	if (pickEnd !== undefined) return pickEnd;
	if (picked.transient) return refuse(`the pick session ended on a Claude API error: ${picked.out.trim()}`, "retry");
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
	const resumed = left(at, chosen.branch);
	if (resumed) console.log(`continuing ${chosen.branch}, which a session left`);
	console.log(`carrying ${target} on ${chosen.branch}`);
	let staged: Awaited<ReturnType<typeof session>>;
	const id = crypto.randomUUID();
	try {
		// Captured, for its title and body: in text mode it prints nothing before its final message.
		const asks = bot ? "runner" : existsSync(where(ASK_SETTINGS)) ? "ask" : undefined;
		const flags = ["--session-id", id, ...withheld];
		staged = await session(prompt(slug, chosen, relative(real, check), resumed, asks, bot?.self, bot?.user), limit, kill, true, as, flags, under);
	} catch {
		return refuse("claude could not be started");
	}
	const stageEnd = unclean(target, staged);
	if (stageEnd !== undefined) return stageEnd;
	if (staged.out.trim()) console.log(staged.out.trim());
	// A tracked edit left is a pause: the next pass would refuse that tree, and the runner commits nothing of a session's.
	if (staged.transient)
		return edited()
			? end("open", `${target}: the stage session ended on a Claude API error, leaving a tracked edit`)
			: end("retry", `${target}: the stage session ended on a Claude API error`);
	// Before the push, so the post never waits on it; only a Notion that did not answer changes the outcome.
	const question = asked(staged.out);
	const line =
		question === undefined
			? ""
			: !bot
				? "question: not posted — no integration is configured"
				: typeof question === "string"
					? `question: not posted — ${question}`
					: await post(bot, question, { board: named, slug }, undefined, triage(question.text, { at, under, limit, kill, base: DEFAULT, user: bot.user }));
	if (line) console.log(line);
	const ending = line.split("\n").at(-1) ?? "";
	// Before the push, so a goal met never pushes past a question Notion did not take; a tracked edit
	// left is a pause, as for the stage's API error.
	if (ending.startsWith(UNREACHED))
		return edited() ? end("open", `${target}: ${ending}, leaving a tracked edit`) : end("retry", `${target}: ${ending}`);
	// A goal open on the user's answer is no failure: the question is on the card, and a pause would wait on nothing.
	const open = (detail: string) =>
		typeof question === "object" && detail.startsWith("goal open") && (ending.startsWith(POSTED) || ending.startsWith(ALREADY))
			? end("waiting", `${target}: question on ${question.card}`)
			: end("open", `${target}: ${detail}`);

	const judged = [...bun, join(judge, "goal-check.ts"), "apply", slug, String(chosen.step)];
	const unready = await publish(staged.out, judged, chosen.branch, DEFAULT, { session: id, clone: real }, app, under);
	if (unready instanceof Transient) return end("retry", `${target}: ${unready.message}`);
	if (unready !== undefined) return open(unready);
	// The check's own verdict at the commit the session left, never the exit status.
	const verdict = sh("bun", ...judged);
	const last = verdict.out.split("\n").at(-1) ?? "";
	if (last.startsWith("goal met")) return end("met", target);
	return open(last || verdict.err || "the goal check printed nothing");
}

if (import.meta.main) process.exit(await pass(process.argv.slice(2)));
