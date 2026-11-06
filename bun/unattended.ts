/**
 * Whether a session declared itself unattended (agent-autonomy). The question
 * gate reads it, and so will the turn gate's context-window check
 * (`wrapup-before-window-ends`), so it lives in a module of its own.
 */
import { readFileSync } from "node:fs";

/**
 * agent-autonomy's declared line, on a line of its own in the first prompt,
 * whitespace around it ignored.
 */
const UNATTENDED = "This session runs unattended.";

/**
 * Whether the session's first prompt, the first user line holding text rather
 * than a tool result, holds the declared line on a line of its own, whitespace
 * around it ignored. A transcript it cannot read, or one with no prompt, reads
 * as attended.
 */
export function unattended(path: unknown): boolean {
	if (typeof path !== "string") return false;
	let lines: string[];
	try {
		lines = readFileSync(path, "utf8").split("\n");
	} catch {
		return false;
	}
	for (const line of lines) {
		let message: { role?: unknown; content?: unknown } | undefined;
		try {
			message = JSON.parse(line)?.message;
		} catch {
			continue;
		}
		if (message?.role !== "user") continue;
		const { content } = message;
		const parts = Array.isArray(content)
			? content.filter((part) => part?.type === "text" && typeof part.text === "string")
			: [];
		if (typeof content !== "string" && parts.length === 0) continue;
		const text = typeof content === "string" ? content : parts.map((part) => part.text).join("\n");
		// Trimmed: a terminal copy indents each line, and a CRLF prompt ends each in `\r`.
		return text.split("\n").some((line) => line.trim() === UNATTENDED);
	}
	return false;
}
