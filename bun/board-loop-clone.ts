/**
 * The clone a board-loop pass starts from, readied before any session, and
 * the one line and record every pass ends on: who started the pass, the
 * launcher on the host, a trusted workspace, no tracked edit, an unpushed tip
 * noted for its step or refused, the default branch at `origin`'s tip, the
 * install, and the pinned goal check copied where no session reaches it.
 * Split from `board-loop.ts`, whose header says why each refusal stands; its
 * cases run through the pass in the `board-loop*.test.ts` files, the start,
 * the clone and the record in `board-loop-start`, `-clone` and `-record`.
 */
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { leftover } from "./board-loop-leftover.ts";
import { sh } from "./board-loop-push.ts";
import { trusted } from "./board-loop-session.ts";
import { recordCheckout } from "./gate-ledger.ts";
import { network, TEMPFAIL } from "./transient.ts";

/** The default branch, as `branch-state.ts`'s `BASE` names it. */
export const DEFAULT = "main";

type Outcome = "met" | "open" | "waiting" | "timeout" | "idle" | "refused" | "retry";

/** Prints the pass's one line and records it. Recording never changes it. */
export function end(outcome: Outcome, detail: string): number {
	console.log(`board-loop: ${outcome} — ${detail}`);
	recordCheckout("loop", outcome, "apply", { cwd: process.cwd() });
	return outcome === "retry" ? TEMPFAIL : outcome === "met" || outcome === "idle" || outcome === "waiting" ? 0 : 1;
}

/**
 * Readies the clone a pass given `args` runs in, returning what the rest of
 * the pass works with, or ends the pass and returns its exit code.
 */
export function prepare(args: string[]) {
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
	if (unpushed && !noted)
		return end("refused", "HEAD names no branch and is on no remote-tracking branch — unpushed work");
	/** A refusal goes back to the noted branch first, so the next pass sees its tip again. */
	const refuse = (detail: string, outcome: "refused" | "retry" = "refused") =>
		end(
			outcome,
			!noted || at("git", "switch", "-q", noted).ok ? detail : `${detail}; switching back to ${noted} failed`,
		);
	for (const step of [
		["fetch", "-q", "origin"],
		["switch", "-q", DEFAULT],
		["merge", "--ff-only", "-q", `origin/${DEFAULT}`],
	]) {
		const run = at("git", ...step);
		// The fetch may bring the tip itself: the host's runner pushes a step's branch from a clone of its own.
		const off =
			run.ok &&
			noted &&
			step[0] === "fetch" &&
			(leftover(at, DEFAULT) ? `origin/${DEFAULT} holds its every commit by patch` : held() && "origin holds its tip");
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
	// `noted` is final here, and `refuse` reads the same value: nothing writes it after this return.
	return { top, bun, under, at, real, edited, noted, refuse, check, judge };
}
