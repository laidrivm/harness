/**
 * What `command-guard.ts` refuses of a program handed to a shell: a shell,
 * `source`, `.` or `eval` whose program the line does not spell out, and a
 * `bunx` that would install what it runs. Decided by where the program comes
 * from — standard input, a substitution, an expansion — never by what
 * produced it, so no list of downloaders stands here. Each check returns the
 * reason rather than blocking, because the exit code and the ledger id are the
 * guard's, written at its call site.
 */

import { posix } from "node:path";
import { FED, OPEN_REDIRECTION, SHELLS } from "./command-parse.ts";

/**
 * The long shell options that take the next word as their value. A short
 * group takes one per `o` or `O` it carries (`-o pipefail`, `+O extglob`,
 * `-co pipefail`). The list is an enumeration on purpose: shell option
 * grammars are short and stable, and a value missed here is read as the
 * script and lets a pipe into the shell through — so a test pins each entry.
 */
const TAKES_VALUE = new Set(["--rcfile", "--init-file"]);

/** A redirection, attached to its target (`<in`, `2>&1`) or not (`<`). */
const REDIRECTION = /^[0-9]*[<>]/;

/** The index of the first word from `at` on that is not a redirection. */
function firstWord(words: string[], at: number): number {
	while (at < words.length && REDIRECTION.test(words[at] ?? ""))
		at += OPEN_REDIRECTION.test(words[at] ?? "") ? 2 : 1;
	return at;
}

/**
 * A shell's own options, read from the words after its name up to `--` or
 * the first operand; every word after that is the script's or the `-c`
 * program's, so `bash script.sh -s` is a script and `bash -s -- --help` reads
 * standard input. `operand` is that first operand's index, or past the end
 * where there is none. For `-c` it is the program, whichever word the `c`
 * stood in: bash runs `echo $HOME` for `bash -co pipefail 'echo $HOME'`.
 *
 * `start` is where the options end, before any redirection is skipped. The
 * words arrive with their quoting removed, so a quoted `-c` program opening
 * with `>` reads as a redirection, and the word after it as the program: the
 * `-c` checks read every word from `start` on, not from `operand`.
 */
export function shellWords(rest: string[]) {
	const found = { info: false, stdin: false, command: false, start: 0 };
	for (let at = firstWord(rest, 0); at < rest.length; ) {
		const word = rest[at] ?? "";
		let next = at + 1;
		if (word === "--")
			return { ...found, start: next, operand: firstWord(rest, next) };
		if (word === "--version" || word === "--help") found.info = true;
		else if (/^[-+][^-]/.test(word)) {
			found.stdin ||= word.includes("s");
			found.command ||= word.includes("c");
			next += word.match(/[oO]/g)?.length ?? 0;
		} else if (TAKES_VALUE.has(word)) next++;
		else if (!word.startsWith("--")) return { ...found, operand: at };
		found.start = next;
		at = firstWord(rest, next);
	}
	return { ...found, operand: rest.length };
}

/**
 * A script operand that names no script: none, `-`, or a path that, once
 * normalised, lies under `/dev/` or `/proc/` — or would after climbing out of
 * the working directory, which `../../dev/stdin` reaches from two levels
 * down. Scoped by directory rather than by the spellings of standard input,
 * since no repository keeps a script in either.
 */
const noScript = (operand: string | undefined) =>
	operand === undefined ||
	operand === "-" ||
	/^(\/|(\.\.\/)+)(dev|proc)\//.test(posix.normalize(operand));

/**
 * Why `name` with `rest` is handed a program the guard cannot read, or
 * nothing. `part` is the whole command, for the substitution mark and an
 * `xargs` before the shell; `first` says `name` is the first candidate. `.`,
 * `source` and `eval` are builtins: `command` or `builtin` can run one only as
 * the word right after it, and a wrapper running a binary cannot reach one at
 * all, so a later candidate is an operand — the trailing `.` of `sudo cp a .`
 * — and only a shell is checked there.
 */
export function unreadProgram(
	part: string[],
	name: string,
	rest: string[],
	first: boolean,
): string | undefined {
	const fed = FED.has(part);
	let unread = false;
	if (SHELLS.has(name)) {
		const shell = shellWords(rest);
		const program = rest[shell.operand];
		// `xargs` writes its input into a `-c` string (`xargs -I{} sh -c '{}'`),
		// and without a replacement or a `$` the shell never reads what it
		// appends, so every `-c` that `xargs` runs is refused.
		const xargs = part
			.slice(0, part.length - rest.length - 1)
			.some((word) => word.split("/").pop() === "xargs");
		if (shell.stdin) unread = true;
		else if (shell.info) unread = false;
		else if (shell.command)
			unread =
				!program ||
				rest
					.slice(shell.start, shell.operand + 1)
					.some((word) => word.includes("$")) ||
				fed ||
				xargs;
		else unread = noScript(program);
	} else if (first && (name === "source" || name === ".")) {
		unread = noScript(rest[firstWord(rest, 0)]);
	} else if (first && name === "eval") {
		// The guard reads `$cmd` as text and the shell runs its value.
		unread = !rest.length || fed || rest.some((word) => word.includes("$"));
	}
	if (!unread) return undefined;
	return `command-guard: \`${name}\` would run a program this line does not spell out — from standard input, a substitution or an expansion — so the guard cannot read what it runs. For a script from the network, show the user its URL and what it does instead of running it; for a local script, run it by its path (\`bash <path>\`); for a \`-c\` string or an \`eval\`, write its commands out with no \`$\` in them.`;
}

/**
 * Why `name` with `rest` is a `bunx` that may install what it runs, or
 * nothing. `--no-install` counts only among bunx's own options, before the
 * package — a word after it is the package's argument — and for `bun x` only
 * after the `x`. `-p`/`--package` take the next word as their value.
 *
 * Which of bun's own options take a value is not enumerated, since a new one
 * would silently hide the `x` after it: any word straight after an option is
 * passed over as its possible value, and an `x` there counts too. That reads
 * `bun --cwd /tmp x cowsay` as `bun x`, and `bun run --cwd x script` as `run`.
 * The price is `bun --hot app.ts x`, refused although `x` is the script's.
 */
export function bunxInstall(name: string, rest: string[]): string | undefined {
	let words = rest;
	if (name === "bun") {
		const sub = rest.findIndex(
			(word, at) =>
				word === "x" ||
				!(word.startsWith("-") || rest[at - 1]?.startsWith("-")),
		);
		if (rest[sub] !== "x") return undefined;
		words = rest.slice(sub + 1);
	} else if (name !== "bunx") return undefined;
	for (let at = 0; words[at]?.startsWith("-"); at++) {
		if (words[at] === "--no-install") return undefined;
		if (words[at] === "-p" || words[at] === "--package") at++;
	}
	return `command-guard: \`${name === "bun" ? "bun x" : "bunx"}\` without --no-install installs a package the project does not have and runs it, past the dependency check and the release-age gate. Run an installed tool with \`bunx --no-install <tool>\`; a package not yet installed is the user's to add.`;
}
