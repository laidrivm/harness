/**
 * The context-window check the turn gate's `Stop` half runs (`context-window`
 * spec): a turn whose context holds `THRESHOLD` tokens or more is refused
 * once, asking for `/session-wrapup` while enough of a 1M window is left for
 * one.
 *
 * The size is the last main-thread reply's `usage` after the last compaction
 * boundary, read from the last 4 MiB of the transcript, since no hook event
 * carries it. "Once" is a mark beside
 * the turn gate's, `<mark>.wrapup`, holding the `uuid` of the tail's last
 * compaction boundary as it was when written. A stop re-arms the ask by
 * removing it when it measures under `REARM`, or when its tail's last boundary
 * is another: a compaction since. The caller runs this at every stop, and says
 * whether this one may be refused, so a stop the turn gate refuses still
 * re-arms.
 *
 * Fail-open, as the turn gate is: no transcript, no reply in the tail, a mark
 * that cannot be written — each asks nothing.
 */
import { closeSync, fstatSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from "node:fs";
import { unattended } from "./unattended.ts";

/** A 1M window less a 200k reserve; a wrap-up was measured at 18k–37k. */
export const THRESHOLD = 800_000;
/** Under this only a compaction or a cleared context reaches, so it re-arms the ask. */
export const REARM = THRESHOLD / 2;
/** Several times the longest transcript line seen, 3.7 MB. */
const TAIL = 4 * 1024 * 1024;

type Event = { transcript_path?: unknown };
type Line = { type?: unknown; subtype?: unknown; uuid?: unknown; isSidechain?: unknown; message?: Message };
type Message = { content?: unknown; usage?: Record<string, unknown> };

/** The tail of the file, its first line dropped when the tail cut it; nothing when unreadable. */
function tail(path: unknown): string | undefined {
	if (typeof path !== "string") return;
	try {
		const fd = openSync(path, "r");
		try {
			const end = fstatSync(fd).size;
			const start = Math.max(0, end - TAIL);
			const bytes = Buffer.alloc(end - start);
			readSync(fd, bytes, 0, bytes.length, start);
			const text = bytes.toString("utf8");
			if (start === 0) return text;
			const eol = text.indexOf("\n");
			return eol < 0 ? "" : text.slice(eol + 1);
		} finally {
			closeSync(fd);
		}
	} catch {
		return;
	}
}

/** The three input fields of a main-thread reply's usage, or nothing. */
function size(line: Line): number | undefined {
	if (line.type !== "assistant" || line.isSidechain === true) return;
	const usage = line.message?.usage;
	const sum = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]
		.map((key) => usage?.[key])
		.reduce<number>((total, n) => total + (typeof n === "number" ? n : 0), 0);
	return sum > 0 ? sum : undefined; // zero: a synthetic reply, an API error shown as one
}

/** A call of the wrap-up: the model's `Skill` call or the user's typed command. */
function wrapping(line: Line): boolean {
	const content = line.message?.content;
	if (line.type === "user") {
		const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
		return /<command-name>\/(?:[\w.-]+:)?session-wrapup<\/command-name>/.test(text);
	}
	return (
		line.type === "assistant" &&
		Array.isArray(content) &&
		content.some(
			(part) =>
				part?.type === "tool_use" &&
				part.name === "Skill" &&
				typeof part.input?.skill === "string" &&
				/^(?:.+:)?session-wrapup$/.test(part.input.skill),
		)
	);
}

/**
 * Walks the tail from its end back to the last compaction boundary: the last
 * reply's size, that boundary's `uuid`, and whether a wrap-up was called. A
 * reply before the boundary is the old context's — an unflushed first reply
 * would otherwise read its size — so none there counts.
 */
function read(text: string): { tokens?: number; boundary?: string; wrapped: boolean } {
	const found: { tokens?: number; boundary?: string; wrapped: boolean } = { wrapped: false };
	const lines = text.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		let line: Line;
		try {
			line = JSON.parse(lines[i] ?? "");
		} catch {
			continue;
		}
		if (line?.type === "system" && line.subtype === "compact_boundary") {
			found.boundary = typeof line.uuid === "string" ? line.uuid : "";
			break;
		}
		found.tokens ??= size(line);
		found.wrapped ||= wrapping(line);
	}
	return found;
}

/** The mark's text, or nothing when there is none. */
function held(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return;
	}
}

/**
 * The refusal for size, or nothing. `file` is the turn gate's mark path, safe
 * as a file name; `ask` is false where the turn gate refused this stop or
 * its mark, or no `mark` half ran, and then this only re-arms.
 */
export function wrapup(file: string, event: Event, ask: boolean): string | undefined {
	const text = tail(event.transcript_path);
	if (text === undefined) return;
	const { tokens, boundary, wrapped } = read(text);
	if (tokens === undefined) return;
	const mark = `${file}.wrapup`;
	let asked = held(mark);
	if (asked !== undefined && (tokens < REARM || (boundary !== undefined && boundary !== asked))) {
		rmSync(mark, { force: true });
		asked = undefined;
	}
	if (!ask || tokens < THRESHOLD || asked !== undefined) return;
	try {
		writeFileSync(mark, boundary ?? "");
	} catch {
		return; // no record, so a refusal here would repeat at every stop
	}
	// Read last: `unattended()` reads the whole file, so only for a stop it would refuse.
	if (wrapped || unattended(event.transcript_path)) return;
	// «можно /clear» is the user's own phrase for the point a session may be cleared.
	return (
		`The context holds ${tokens} tokens, at or past the ${THRESHOLD} at which the harness ` +
		"asks for a wrap-up while enough of the window is left for one. Finish the " +
		"step in hand, run /session-wrapup, then tell the user «можно /clear». If a " +
		"subagent you started is still running, end this turn saying the wrap-up " +
		"waits for its report instead, and run it once the report is in. This is " +
		"asked once in this context."
	);
}
