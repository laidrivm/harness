/**
 * Transcript lines as Claude Code writes them, for the context-window
 * check's two test files: the check's own cases and the turn gate's around it.
 */
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A main-thread reply whose three input fields sum to `size`; 0 is all zeros. */
export const reply = (size: number, extra: object = {}) => ({
	type: "assistant",
	isSidechain: false,
	message: {
		role: "assistant",
		content: [{ type: "text", text: "ok" }],
		usage: size
			? { input_tokens: 1000, cache_creation_input_tokens: 1000, cache_read_input_tokens: size - 2000 }
			: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
	},
	...extra,
});

export const said = (content: string) => ({ type: "user", isSidechain: false, message: { role: "user", content } });

/** The model's `Skill` call of the wrap-up. */
export const skill = (name = "session-wrapup") => ({
	type: "assistant",
	isSidechain: false,
	message: {
		role: "assistant",
		content: [{ type: "tool_use", id: "t", name: "Skill", input: { skill: name } }],
	},
});

/** The user's typed `/session-wrapup`, as the transcript holds it. */
export const typed = said(
	"<command-message>session-wrapup</command-message>\n<command-name>/session-wrapup</command-name>",
);

export const boundary = (uuid = "b1") => ({ type: "system", subtype: "compact_boundary", uuid });

const made: string[] = [];

/** Removes every transcript directory made so far; each test file registers it. */
export function cleanupTranscripts(): void {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/** A transcript in a new directory: its path, and `add` appending lines to it. */
export function transcript(...lines: object[]) {
	const dir = mkdtempSync(join(tmpdir(), "context-window-"));
	made.push(dir);
	const path = join(dir, "t.jsonl");
	writeFileSync(path, "");
	const add = (...more: object[]) => appendFileSync(path, more.map((line) => `${JSON.stringify(line)}\n`).join(""));
	add(...lines);
	return { dir, path, add };
}
