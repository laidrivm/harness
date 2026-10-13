/**
 * The round ceiling of a goal run, which the turn gate keeps: `resetRounds`
 * from its `mark` half, `countRound` from its `stop` half before it decides.
 *
 * A goal run is one prompt and many stops. Each stop after the first arrives
 * with `stop_hook_active` true, because the goal's own hook continued the
 * turn, so those are the rounds counted. The count lives beside the turn
 * gate's mark, in `<mark>.rounds`, which leaves the mark's format alone.
 *
 * Fail-open, as the turn gate is: a count that no prompt started, or that
 * cannot be read or written, ends nothing.
 *
 * Its own module rather than a part of `goal-check.ts`: that file is a script
 * whose top level runs the check, and it imports `turn-gate.ts` already.
 */
import { readFileSync, writeFileSync } from "node:fs";

/** Continued stops a goal run gets since its prompt; `stage-goal` fixes it. */
export const CEILING = 20;

type Event = { session_id?: unknown; stop_hook_active?: unknown };

/**
 * Starts the session's count again. `mark` is the turn gate's mark path,
 * which is already safe as a file name; the caller checks that, not this.
 */
export function resetRounds(mark: string): void {
	try {
		writeFileSync(`${mark}.rounds`, "0");
	} catch {
		// No count, so the ceiling ends nothing.
	}
}

/**
 * Counts a continued stop against the mark at `mark`, and returns the reason
 * to end the session once the count reaches the ceiling. Nothing below it,
 * for a stop the goal did not continue, or where no prompt started a count.
 */
export function countRound(event: Event, mark: string): string | undefined {
	if (event.stop_hook_active !== true) return;
	const file = `${mark}.rounds`;
	let rounds: number;
	try {
		rounds = Number(readFileSync(file, "utf8")) + 1;
		writeFileSync(file, String(rounds));
	} catch {
		return;
	}
	if (!Number.isInteger(rounds) || rounds < CEILING) return;
	return (
		`goal-ceiling: ${rounds} continued stops since the last prompt, and a ` +
		`goal run gets ${CEILING}. The goal stays set: \`claude --resume ` +
		`${event.session_id}\` with a prompt goes on and counts afresh, and ` +
		"`/goal clear` drops it."
	);
}
