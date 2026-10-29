/**
 * The gate ledger: one JSON line per decision a harness gate records, so that
 * whether a gate earns its place is decided on counts. The wrap-up reads it
 * with `jq`; `ran` below reads back one gate's records of a commit: the pre-PR
 * runner's, for the turn gate and the goal check, or the skill-call hook's.
 *
 * It lives in the user's state directory, outside every working tree, so no
 * consumer has an ignore entry to add and nothing in it can be staged. A
 * record holds no command text: its counts are copied into a tracked file of a
 * public repository, and a command line can carry a token.
 *
 * ponytail: the file is never rotated. A record is about 130 bytes and a
 * refusal is rare; rotate it once it passes a few megabytes.
 */
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

type Event = { session_id?: unknown; cwd?: unknown } | null;

/** The project's real path: `preferred` when set, then the event's `cwd`. */
function project(event: Event, preferred: string | undefined): string {
	const dir = preferred || (typeof event?.cwd === "string" ? event.cwd : "");
	if (!dir) return "unknown";
	try {
		return realpathSync(dir);
	} catch {
		return resolve(dir);
	}
}

/** The user's state directory, which the ledger and the transcript archive share. */
export function stateDir(): string {
	// The XDG spec ignores a relative value, which would land in the tree.
	const xdg = process.env.XDG_STATE_HOME ?? "";
	return isAbsolute(xdg) ? xdg : join(homedir(), ".local", "state");
}

/** The ledger's path. The turn gate reads it back to find the runner's record. */
export function ledgerFile(): string {
	return join(stateDir(), "harness", "gates.jsonl");
}

/**
 * The pre-PR runner's steps, in the order it runs them: each record it writes
 * carries one as its `rule`, and a passing run is a pass of every one.
 */
export const RUNNER_STEPS = ["diff-budget", "project-checks"] as const;

/**
 * Whether the ledger holds `gate`'s record of `commit` made in the checkout
 * whose top level is `top`: the pre-PR runner's by default, or `skill`, the
 * skill-call hook's, so neither writer's record ever stands in for the other's,
 * and a refusal for neither. The runner records its checkout's top
 * level wherever it runs, so the match is exact: a path under `top` can be a
 * worktree nested there, measured against its own base refs. A ledger that
 * cannot be read, or a torn line, holds none. Given `decision`, only a run
 * that ended so counts: the goal check asks for a pass, the turn gate for any.
 * `ledger` is another user's ledger as read for the caller, in place of this one's.
 * Given `rule`, only that step's record counts, so one step's pass never
 * stands in for another's; given none, any step's does.
 */
export function ran(
	commit: string,
	top: string | undefined,
	decision?: string,
	ledger?: string,
	rule?: string,
	gate = "pre-pr",
): boolean {
	if (!top) return false;
	let text = ledger ?? "";
	if (ledger === undefined)
		try {
			text = readFileSync(ledgerFile(), "utf8");
		} catch {
			return false;
		}
	return text.split("\n").some((line) => {
		try {
			const parsed = JSON.parse(line) ?? {};
			const { project, commit: read } = parsed;
			const ended = !decision || parsed.decision === decision;
			const step = !rule || parsed.rule === rule;
			return parsed.gate === gate && read === commit && project === top && ended && step;
		} catch {
			return false;
		}
	});
}

// `stateDir()`'s rule, in the session user's shell, so it reads that user's environment.
const AGENT_LEDGER = 'd=${XDG_STATE_HOME-}; case $d in /*) ;; *) d=$HOME/.local/state ;; esac; cat "$d/harness/gates.jsonl"';

/**
 * On the host, whether the session's clone holds a passing pre-PR record of
 * `commit` for every runner step: read through `under`, the launcher's words
 * and the clone, as the session user, from that user's 0600 ledger and against
 * that user's view of the clone's top level, each read once. The runner's own
 * ledger never stands in for it.
 */
export function ranUnder(under: string[], commit: string): boolean {
	const agent = (...cmd: string[]) => {
		const run = Bun.spawnSync([...under, ...cmd]);
		return run.exitCode === 0 ? run.stdout.toString() : undefined;
	};
	const top = agent("pwd", "-P")?.trim();
	const ledger = agent("sh", "-c", AGENT_LEDGER) ?? "";
	return RUNNER_STEPS.every((rule) => ran(commit, top, "pass", ledger, rule));
}

/**
 * Appends one record, naming the session's project, `CLAUDE_PROJECT_DIR`, and
 * the event's `cwd` only without it: for a hook the session runs. Best-effort
 * and silent: a gate whose log is unwritable must decide exactly as it would
 * have, so every error is swallowed here. `commit` is set only by a gate that
 * read one, and left out otherwise.
 */
export function record(gate: string, decision: string, rule: string, event: unknown, commit?: string): void {
	append(gate, decision, rule, event, commit, process.env.CLAUDE_PROJECT_DIR);
}

/**
 * `record` for a writer that can run in another checkout than the session's
 * own — a command or a git hook: the record names the checkout it read, the
 * event's `cwd`, whatever `CLAUDE_PROJECT_DIR` says.
 */
export function recordCheckout(gate: string, decision: string, rule: string, event: unknown, commit?: string): void {
	append(gate, decision, rule, event, commit, undefined);
}

function append(gate: string, decision: string, rule: string, event: unknown, commit: string | undefined, preferred: string | undefined): void {
	try {
		const seen = (typeof event === "object" ? event : null) as Event;
		const file = ledgerFile();
		// Private: a record names a project path and a session id.
		mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
		const line = JSON.stringify({
			at: new Date().toISOString(),
			gate,
			decision,
			rule,
			project: project(seen, preferred),
			session: typeof seen?.session_id === "string" ? seen.session_id : null,
			commit,
		});
		appendFileSync(file, `${line}\n`, { mode: 0o600 });
	} catch {
		// Recording never changes a decision.
	}
}

/**
 * A guard's refusal, bound to the gate's name and the event it read: writes
 * the reason to stderr, records the prohibition's id, then exits 2. The id is
 * passed at each call site and never derived from the reason, so rewording a
 * message keeps its count. Bind it to a const typed explicitly: TypeScript
 * reads a call as ending the path only through a name whose type is written
 * out.
 */
export const blocker =
	(gate: string, event: unknown) =>
	(id: string, reason: string): never => {
		process.stderr.write(`${reason}\n`);
		record(gate, "block", id, event);
		process.exit(2);
	};
