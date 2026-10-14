/**
 * What one command's words invoke, for `command-guard.ts`: the name a shell
 * would run once assignments, wrappers and redirections are stripped, and
 * where a path it names resolves. Splitting a line into those commands is
 * `command-parse.ts`'s.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Words that run the command after them, so the guarded name is further along:
 * `command git`, `env GIT_TRACE=1 git`. What options each takes is not modelled
 * — see `invocations` for what stands in for that — so adding one here costs
 * nothing but the candidates it produces.
 */
const WRAPPERS = new Set([
	"command",
	"builtin",
	"exec",
	"env",
	"time",
	"nohup",
	"nice",
	"timeout",
	"sudo",
	"doas",
	"xargs",
	"stdbuf",
]);

/**
 * Reserved words that may stand before a command and are never one, so
 * `if true; then git commit; fi` reaches `git` past `then`.
 */
const KEYWORDS = new Set([
	"!",
	"{",
	"if",
	"then",
	"else",
	"elif",
	"do",
	"while",
	"until",
]);

/** Shells whose `-c` argument is another command to look inside. */
export const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

/**
 * A word that cannot be a command name, so the name is further along:
 * `GIT_TRACE=1`, an option belonging to a wrapper (`env -i`), or a redirection
 * (`>out`, `2>&1`, `<in`). Scoped by what a command name cannot look like
 * rather than by a list of the forms seen so far — an unlisted option would
 * otherwise be read as the command and hide what follows it.
 */
const NOT_A_NAME = /^([A-Za-z_][A-Za-z0-9_]*=|-|[0-9]*[<>])/;

/**
 * A redirection whose target is the next word rather than part of this one —
 * the here-string `<<<` among them, whose word is a shell's standard input.
 */
export const OPEN_REDIRECTION = /^[0-9]*(<<<|[<>]{1,2}&?)$/;

/**
 * The commands a fragment may invoke, each by its base name and with its
 * arguments — leading assignments, wrapper words, their options and
 * redirections stripped. `/usr/bin/git` and `command git` both resolve to
 * `git`, which is the whole point of deciding here rather than in a permission
 * pattern.
 *
 * One entry, until a wrapper is seen: with no wrapper the command is the first
 * word that can be a name, and reading the words after it as commands too
 * would refuse `echo git commit`. Past a wrapper every word is a candidate,
 * because an option of it may take the next word as its operand — `env -u PATH
 * git` runs git — and which options do cannot be enumerated per wrapper
 * without the enumeration going stale silently. The cost is refusing a
 * contrived line such as `env -i echo git commit`, which is the safe way to be
 * wrong.
 */
export function invocations(words: string[]): [string, string[]][] {
	const found: [string, string[]][] = [];
	let wrapped = false;
	for (let at = 0; at < words.length; at++) {
		const word = words[at] ?? "";
		if (NOT_A_NAME.test(word)) {
			if (OPEN_REDIRECTION.test(word)) at++;
			continue;
		}
		const name = word.split("/").pop() ?? "";
		if (KEYWORDS.has(name)) continue;
		if (WRAPPERS.has(name)) {
			// `command -v bash` names a command and runs nothing.
			const option = words[at + 1] ?? "";
			if (name === "command" && /^-[pvV]*[vV][pvV]*$/.test(option)) break;
			wrapped = true;
			continue;
		}
		found.push([name, words.slice(at + 1)]);
		if (!wrapped) break;
	}
	return found;
}

/** Commands that read what they are fed as a script, whatever its quoting. */
const READERS = new Set([...SHELLS, "eval", "source", "."]);

/**
 * Whether `words` invoke a script reader: a shell, `eval`, `source`, `.`, or
 * a program named by a path, which runs a file the guard never read.
 */
export const readsScript = (words: string[]) =>
	invocations(words).some(
		([name, rest]) =>
			READERS.has(name) ||
			(words[words.length - rest.length - 1] ?? "").includes("/"),
	);

/** `path` as the shell resolves it from `from`, or `null` where it cannot be read statically. */
export function place(from: string | null, path: string): string | null {
	if (from === null || path === "-" || path.includes("$")) return null;
	return resolve(from, path.replace(/^~(?=\/|$)/, homedir()));
}
