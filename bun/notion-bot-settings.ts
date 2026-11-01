/**
 * The settings file the board loop's Notion integration reads, and the form
 * of a Notion id. Split from `notion-bot.ts`, which re-exports it, for its
 * length; its cases are in `notion-bot.test.ts`.
 */
import { readFileSync, statSync } from "node:fs";

/** A Notion id, as a whole value: 32 hex digits, alone or in a UUID's form. */
export const ID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * `self`: the integration's own id, read with `own()`; none reads no `harness-answer` as an answer.
 * `board`: the data source a pause's notice searches and files on; none posts no notice.
 */
export type Settings = { token: string; user: string; self?: string; board?: string };

/**
 * The settings at `path`, or `undefined` when no file is there. A file the
 * runner cannot use throws, naming the file and the key at fault, never a value.
 */
export function settings(path: string): Settings | undefined {
	let mode: number;
	try {
		const stat = statSync(path);
		if (!stat.isFile()) throw new Error(`notion-bot: ${path} is not a file`);
		mode = stat.mode & 0o777;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	// On the VPS the session user shares the runner's group, so group access is the session's.
	if (mode & 0o077)
		throw new Error(`notion-bot: ${path} has mode 0${mode.toString(8)}, which its group or others may read — chmod 600 it`);
	let value: { token?: unknown; user?: unknown; board?: unknown } | null;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`notion-bot: ${path} cannot be read as JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error(`notion-bot: ${path} holds no JSON object`);
	const { token, user, board } = value;
	if (typeof token !== "string" || !/^\S+$/.test(token))
		throw new Error(`notion-bot: ${path}: \`token\` is not a non-empty string without whitespace`);
	if (typeof user !== "string" || !ID.test(user))
		throw new Error(`notion-bot: ${path}: \`user\` is not 32 hex digits, alone or as a UUID`);
	if (board === undefined) return { token, user };
	if (typeof board !== "string" || !ID.test(board))
		throw new Error(`notion-bot: ${path}: \`board\` is not 32 hex digits, alone or as a UUID`);
	return { token, user, board };
}
