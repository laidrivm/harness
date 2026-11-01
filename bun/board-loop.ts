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
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { DEFAULT, end, prepare } from "./board-loop-clone.ts";
import { pickPrompt, prompt, type Step } from "./board-loop-prompt.ts";
import { publish, sh } from "./board-loop-push.ts";
import { type Kill, session } from "./board-loop-session.ts";
import { consider, left } from "./board-loop-takeable.ts";
import { ready } from "./ci-run-draft.ts";
import { configured, identity } from "./github-app.ts";
import { ALREADY, asked, own, POSTED, post, type Settings, settings, UNREACHED } from "./notion-bot.ts";
import { triage } from "./notion-triage.ts";
import { pickedCard, UNASSIGN_FAILED, unassign } from "./notion-unassign.ts";
import { originRepository } from "./pull-requests.ts";
import { ASK_SETTINGS, RUNNER_ASKS, where } from "./question-gate.ts";
import { Transient } from "./transient.ts";

/** A stage session's limit, fixed by the spec: a longer step is split, never given more. */
export const LIMIT = 60 * 60 * 1000;

/** One pass. `limit` and `kill` are replaced only by a test, through an entry module. */
export async function pass(args: string[], limit = LIMIT, kill: Kill = process.kill): Promise<number> {
	const prepared = prepare(args);
	if (typeof prepared === "number") return prepared;
	const { top, bun, under, at, real, edited, noted, refuse, check, judge } = prepared;

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
		return refuse(
			`on the host the runner posts each question from the Notion integration, and ${where("notion-bot.json")} is missing`,
		);
	if (steps.size === 0) return end("idle", "no change is takeable");
	const listed = (answer: boolean) => [...steps].filter(([, s]) => s.answer === answer).map(([name]) => name);
	const drafts = [...steps].filter(([, s]) => s.draft !== undefined).map(([name]) => name);

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
		picked = await session(
			pickPrompt(named, listed(false), listed(true), bot?.self, bot?.user, drafts),
			limit,
			kill,
			true,
			as,
			withheld,
			under,
		);
	} catch {
		return refuse("claude could not be started");
	}
	const pickEnd = unclean("the pick session", picked);
	if (pickEnd !== undefined) return pickEnd;
	if (picked.transient) return refuse(`the pick session ended on a Claude API error: ${picked.out.trim()}`, "retry");
	if (picked.out.trim()) console.log(picked.out.trim());
	// Untrusted text: one exact line, naming a change this pass computed as takeable or a candidate.
	const [pick, ...more] = picked.out.split("\n").filter((line) => line.startsWith("PICK:"));
	const slug = pick !== undefined && !more.length ? /^PICK: (\w[\w.-]*)$/.exec(pick.trimEnd())?.[1] : undefined;
	if (!slug) return refuse("the pick session returned not one exact PICK: line");
	if (slug === "none") return end("idle", "the pick session found no takeable card on the board");
	const chosen = steps.get(slug);
	if (!chosen)
		return refuse(`the pick session named ${slug}: ${reasons.get(slug) ?? "no change of that name is takeable"}`);
	// The pass has read the draft's answer: the user leaves `Assign` before the stage session acts on it.
	if (bot && chosen.draft !== undefined) {
		const card = pickedCard(picked.out);
		const wrote =
			typeof card === "string"
				? `assign: not written — ${card}`
				: await unassign(bot, card.card, { board: named, slug });
		// Carried, the draft would go ready with the user still on `Assign`; refused, the next pass reads the answer again.
		if (wrote.startsWith(UNASSIGN_FAILED)) return refuse(wrote);
		console.log(wrote);
	}

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
		staged = await session(
			prompt(slug, chosen, relative(real, check), resumed, asks, bot?.self, bot?.user),
			limit,
			kill,
			true,
			as,
			flags,
			under,
		);
	} catch {
		return refuse("claude could not be started");
	}
	const stageEnd = unclean(target, staged);
	if (stageEnd !== undefined) return stageEnd;
	if (staged.out.trim()) console.log(staged.out.trim());
	// A tracked edit left is a pause: the next pass would refuse that tree, and the runner commits nothing of a session's.
	const retry = (why: string) =>
		edited() ? end("open", `${target}: ${why}, leaving a tracked edit`) : end("retry", `${target}: ${why}`);
	if (staged.transient) return retry("the stage session ended on a Claude API error");
	// Before the push, so the post never waits on it; only a Notion that did not answer changes the outcome.
	const question = asked(staged.out);
	const line =
		question === undefined
			? ""
			: !bot
				? `question: ${typeof question === "string" ? "not posted" : "posted by the session"} — no integration is configured`
				: typeof question === "string"
					? `question: not posted — ${question}`
					: await post(
							bot,
							question,
							{ board: named, slug },
							undefined,
							triage(question.text, { at, under, limit, kill, base: DEFAULT, user: bot.user }),
						);
	if (line) console.log(line);
	const ending = line.split("\n").at(-1) ?? "";
	// Before the push, so a goal met never pushes past a question Notion did not take.
	if (ending.startsWith(UNREACHED)) return retry(ending);
	// A goal open on the user's answer is no failure: the question is on the card, and a pause would wait on nothing.
	const posted = ending.startsWith(POSTED) || ending.startsWith(ALREADY);
	const open = (detail: string) =>
		typeof question === "object" && detail.startsWith("goal open") && posted
			? end("waiting", `${target}: question on ${question.card}`)
			: end("open", `${target}: ${detail}`);
	// A question that reached the card keeps the pull request a draft; with no integration the session posted it.
	const draft = typeof question === "object" && (posted || !bot);

	const judged = [...bun, join(judge, "goal-check.ts"), "apply", slug, String(chosen.step)];
	const unready = await publish(
		staged.out,
		judged,
		chosen.branch,
		DEFAULT,
		{ session: id, clone: real },
		app,
		under,
		draft,
	);
	if (unready instanceof Transient) return end("retry", `${target}: ${unready.message}`);
	if (unready !== undefined) return open(unready);
	// The answer carried and nothing left to ask: the draft goes ready right after its push, writing no `Assign`.
	if (chosen.draft !== undefined && !draft) {
		// In the repository the draft was read from, never `gh`'s default, which `GH_REPO` can move.
		const of = originRepository();
		const marked = of !== undefined && ready(`${of.owner}/${of.repo}`, chosen.draft);
		console.log(
			`pull request #${chosen.draft}: ${marked ? "marked ready for review" : `not marked ready — ${of ? "gh pr ready failed" : "origin names no repository"}; mark it ready by hand`}`,
		);
	}
	// The check's own verdict at the commit the session left, never the exit status.
	const verdict = sh("bun", ...judged);
	const last = verdict.out.split("\n").at(-1) ?? "";
	if (last.startsWith("goal met")) return end("met", target);
	return open(last || verdict.err || "the goal check printed nothing");
}

if (import.meta.main) process.exit(await pass(process.argv.slice(2)));
