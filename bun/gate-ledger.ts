/**
 * The gate ledger: one JSON line per decision a harness gate records, so that
 * whether a gate earns its place is decided on counts. The wrap-up reads it
 * with `jq`, and the turn gate reads back only the pre-PR runner's records.
 *
 * It lives in the user's state directory, outside every working tree, so no
 * consumer has an ignore entry to add and nothing in it can be staged. A
 * record holds no command text: its counts are copied into a tracked file of a
 * public repository, and a command line can carry a token.
 *
 * ponytail: the file is never rotated. A record is about 130 bytes and a
 * refusal is rare; rotate it once it passes a few megabytes.
 */
import { appendFileSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

type Event = { session_id?: unknown; cwd?: unknown } | null;

/** The project's real path: `CLAUDE_PROJECT_DIR`, then the event's `cwd`. */
function project(event: Event): string {
	const dir =
		process.env.CLAUDE_PROJECT_DIR ||
		(typeof event?.cwd === "string" ? event.cwd : "");
	if (!dir) return "unknown";
	try {
		return realpathSync(dir);
	} catch {
		return resolve(dir);
	}
}

/** The ledger's path. The turn gate reads it back to find the runner's record. */
export function ledgerFile(): string {
	// The XDG spec ignores a relative value, which would land in the tree.
	const xdg = process.env.XDG_STATE_HOME ?? "";
	const state = isAbsolute(xdg) ? xdg : join(homedir(), ".local", "state");
	return join(state, "harness", "gates.jsonl");
}

/**
 * Appends one record. Best-effort and silent: a gate whose log is unwritable
 * must decide exactly as it would have, so every error is swallowed here.
 * `commit` is set only by a gate that read one, and left out otherwise.
 */
export function record(
	gate: string,
	decision: string,
	rule: string,
	event: unknown,
	commit?: string,
): void {
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
			project: project(seen),
			session: typeof seen?.session_id === "string" ? seen.session_id : null,
			commit,
		});
		appendFileSync(file, `${line}\n`, { mode: 0o600 });
	} catch {
		// Recording never changes a decision.
	}
}

/**
 * The command guard's refusal, bound to the event it read: writes the reason to
 * stderr, records the prohibition's id, then exits 2. The id is passed at each
 * call site and never derived from the reason, so rewording a message keeps
 * its count. Bind it to a const typed explicitly: TypeScript reads a call as
 * ending the path only through a name whose type is written out.
 */
export const blocker =
	(event: unknown) =>
	(id: string, reason: string): never => {
		process.stderr.write(`${reason}\n`);
		record("command-guard", "block", id, event);
		process.exit(2);
	};
