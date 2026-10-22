/**
 * The per-file line cap: what a reader has to hold at once to understand one
 * file, as against the diff budget's question of what one change asks them to
 * read.
 *
 * The caps are an enumeration of the extensions they cover rather than of what
 * they exempt, which is the direction `CLAUDE.md` warns against — deliberately,
 * because the numbers differ per extension and a file type nobody has capped is
 * one nobody has measured. Markdown is bounded by the always-on context budget
 * where it matters, and JSON and YAML are read by key rather than by line.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tracked } from "./tracked.ts";

/** Longest a file of each extension may be, inclusive. */
const CAPS: Record<string, number> = {
	".ts": 300,
	".tsx": 300,
	".css": 200,
};

/**
 * The cap a path is subject to, or `undefined` when it is subject to none.
 * Matched case-insensitively: `endsWith` is not, so `src/A.TS` would be capped
 * by nothing at all — and a cap that silently does not apply is the direction
 * that passes wrongly.
 */
const capOf = (path: string) => {
	const lower = path.toLowerCase();
	return Object.entries(CAPS).find(([ext]) => lower.endsWith(ext))?.[1];
};

/**
 * What ends a line: a CRLF pair, a bare newline, or a bare carriage return.
 * Written once and read two ways, so the alternation cannot drift between the
 * splitting form and the anchored one. A lone `\r` counts because an editor
 * showing a CR-terminated file shows separate lines, and a cap on what a
 * reader holds at once has to agree with what the reader sees.
 */
const ENDING = String.raw`\r\n|\n|\r`;
const ENDINGS = new RegExp(ENDING, "g");
const LAST_ENDING = new RegExp(`(?:${ENDING})$`);

/**
 * Physical lines, blank ones included. A final line carrying no terminating
 * ending counts: `wc -l` counts newline characters and so reads a 301-line
 * file whose last line is unterminated as 300, which is the arithmetic that
 * would let a file over the cap through. A CRLF pair is one ending rather than
 * two, because the alternation tries the pair first.
 */
export function count(text: string): number {
	if (text === "") return 0;
	const endings = text.split(ENDINGS).length - 1;
	return LAST_ENDING.test(text) ? endings : endings + 1;
}

export type Oversize = { path: string; count: number; cap: number };

/**
 * Every tracked file over its cap in the repository containing `cwd`.
 *
 * Tracked only, so a file present for its author and absent from a clone
 * cannot fail one machine and no other.
 */
export function oversize(cwd?: string): Oversize[] {
	const { root, files } = tracked(cwd);

	const found: Oversize[] = [];
	let read = 0;
	for (const path of files) {
		const cap = capOf(path);
		if (cap === undefined) continue;
		read++;
		const lines = count(readFileSync(join(root, path), "utf8"));
		if (lines > cap) found.push({ path, count: lines, cap });
	}

	// A sweep that matched nothing satisfies every assertion made over its
	// result, so it is an error rather than a pass.
	if (read === 0) throw new Error(`no capped files under ${root}`);

	return found;
}
