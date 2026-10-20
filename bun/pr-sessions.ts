/**
 * The PR → session table: one JSON line per step the board-loop runner pushes,
 * naming the session that carried it, so a later flow can resume that session
 * on the step's pull request. The runner writes it; only the orchestrator reads
 * it. Keyed by branch, since the pull request's number exists only after the push.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Step = { repo: string; branch: string; session: string; clone: string };
export type Row = Step & { at: string };

const FIELDS = ["repo", "branch", "session", "clone", "at"] as const;

/** The table, in the runner's home: on the host a volume no session user can read. */
export const table = () => join(homedir(), "orchestrator", "pr-sessions.jsonl");

/**
 * Appends one record, or throws where it cannot be written. One `appendFileSync`
 * of a line well under 4 KiB lands whole, so a reader sees it all or none of it.
 */
export function append(step: Step, file = table()) {
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	appendFileSync(file, `${JSON.stringify({ ...step, at: new Date().toISOString() })}\n`, { mode: 0o600 });
}

/**
 * The last record for `repo` and `branch`, so a step a later session continued
 * resumes that session. An unreadable table, a line that does not parse and a
 * line lacking a field are all no record, never an error.
 */
export function lookup(repo: string, branch: string, file = table()): Row | undefined {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
	let found: Row | undefined;
	for (const line of text.split("\n")) {
		let row: Record<string, unknown>;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		const whole = FIELDS.every((name) => typeof row?.[name] === "string" && row[name] !== "");
		if (whole && row.repo === repo && row.branch === branch) found = row as Row;
	}
	return found;
}
