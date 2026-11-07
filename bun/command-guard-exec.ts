/**
 * What `command-guard.ts` refuses of a program handed to a shell: a shell,
 * `source`, `.` or `eval` whose program the line does not spell out, a
 * `bunx` that would install what it runs, a `bun test` or `bun run` that
 * carries `--retry`, a `bun run deps` given words after the script's name
 * (`depsArgs`), and a signal the session may not own: `pkill` and its kin
 * anywhere (`killByName`), a `kill` aimed past the line's own jobs
 * (`killSignal`). Decided by where the program comes
 * from — standard input, a substitution, an expansion — never by what
 * produced it, so no list of downloaders stands here. Each check returns the
 * reason rather than blocking, because the exit code and the ledger id are the
 * guard's, written at its call site.
 */

import { posix } from "node:path";
import { FED } from "./command-parse.ts";
import { args, named, OPEN_REDIRECTION, SHELLS } from "./command-words.ts";

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
	while (at < words.length && REDIRECTION.test(words[at] ?? "")) at += OPEN_REDIRECTION.test(words[at] ?? "") ? 2 : 1;
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
		if (word === "--") return { ...found, start: next, operand: firstWord(rest, next) };
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
	operand === undefined || operand === "-" || /^(\/|(\.\.\/)+)(dev|proc)\//.test(posix.normalize(operand));

/**
 * Why `name` with `rest` is handed a program the guard cannot read, or
 * nothing. `part` is the whole command, for the substitution mark and an
 * `xargs` before the shell; `first` says `name` is the first candidate. `.`,
 * `source` and `eval` are builtins: `command` or `builtin` can run one only as
 * the word right after it, and a wrapper running a binary cannot reach one at
 * all, so a later candidate is an operand — the trailing `.` of `sudo cp a .`
 * — and only a shell is checked there.
 */
export function unreadProgram(part: string[], name: string, rest: string[], first: boolean): string | undefined {
	const fed = FED.has(part);
	let unread = false;
	if (SHELLS.has(name)) {
		const shell = shellWords(rest);
		const program = rest[shell.operand];
		// `xargs` writes its input into a `-c` string (`xargs -I{} sh -c '{}'`),
		// and without a replacement or a `$` the shell never reads what it
		// appends, so every `-c` that `xargs` runs is refused.
		const xargs = part.slice(0, part.length - rest.length - 1).some((word) => word.split("/").pop() === "xargs");
		if (shell.stdin) unread = true;
		else if (shell.info) unread = false;
		else if (shell.command)
			unread =
				!program || rest.slice(shell.start, shell.operand + 1).some((word) => word.includes("$")) || fed || xargs;
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
		const sub = rest.findIndex((word, at) => word === "x" || !(word.startsWith("-") || rest[at - 1]?.startsWith("-")));
		if (rest[sub] !== "x") return undefined;
		words = rest.slice(sub + 1);
	} else if (name !== "bunx") return undefined;
	for (let at = 0; words[at]?.startsWith("-"); at++) {
		if (words[at] === "--no-install") return undefined;
		if (words[at] === "-p" || words[at] === "--package") at++;
	}
	return `command-guard: \`${name === "bun" ? "bun x" : "bunx"}\` without --no-install installs a package the project does not have and runs it, past the dependency check and the release-age gate. Run an installed tool with \`bunx --no-install <tool>\`; a package not yet installed is the user's to add.`;
}

/**
 * The index in `words` — redirections already dropped by `args` — of bun's
 * subcommand among `verbs`, found as `bunxInstall` finds `x`: a word straight
 * after an option is passed over as its possible value. Shared by `depsArgs`
 * and `bunTestRetry`.
 */
const subcommand = (words: string[], verbs: string[]) =>
	words.findIndex((word, at) => verbs.includes(word) || !(word.startsWith("-") || words[at - 1]?.startsWith("-")));

/**
 * Why `name` with `rest` is a `bun run` a substitution feeds, or a `bun run
 * deps` whose command is anything but those three words, or nothing. bun
 * forwards every word after the script's name to the install (`--no-verify`
 * skips its integrity checks), and a word before `bun` — an `xargs` that
 * appends its input, an assignment bun reads — reaches it too, so the whole
 * command is compared, its redirections included. The parse drops a
 * substitution's output, the script's name among it, from the words, so a fed
 * `bun run` refuses whatever its script (frozen-install-unprompted D2).
 */
export function depsArgs(part: string[], name: string, rest: string[]): string | undefined {
	if (name !== "bun") return undefined;
	const words = args(rest);
	const sub = subcommand(words, ["run"]);
	if (words[sub] !== "run") return undefined;
	const bare = "Install with `bun run deps` with nothing before or after it.";
	if (FED.has(part))
		return `command-guard: a substitution feeds this \`bun run\`, and the guard cannot see the words it supplies — the script's name among them — so it may be \`bun run deps\` with words bun forwards to the install. Write the words out. ${bare}`;
	if (words.slice(sub + 1).find((word) => !word.startsWith("-")) !== "deps" || part.join(" ") === "bun run deps")
		return undefined;
	return `command-guard: bun forwards every word after \`bun run deps\` to \`bun install --frozen-lockfile\`, where a flag such as \`--no-verify\` changes what it installs, and a word before \`bun\` — an \`xargs\`, an assignment bun reads — reaches it as well. ${bare}`;
}

/**
 * Why `name` with `rest` is a `bun test` carrying `--retry`, or a `bun run`
 * carrying it before or after the script's name, or nothing. The subcommand
 * is found as `bunxInstall` finds `x`. After `run` the guard cannot read what
 * the script runs, so the flag refuses whatever the script is; a `--retry`
 * that is only another flag's value (`bun test -t --retry`) refuses too, the
 * side the guard errs on (flaky-test-findings D9).
 */
export function bunTestRetry(name: string, rest: string[]): string | undefined {
	if (name !== "bun") return undefined;
	const words = args(rest);
	const sub = subcommand(words, ["test", "run"]);
	const verb = words[sub];
	if (verb !== "test" && verb !== "run") return undefined;
	const retry = (word: string) => word === "--retry" || word.startsWith("--retry=");
	if (!words.slice(sub + 1).some(retry)) return undefined;
	return `command-guard: \`bun ${verb}\` with \`--retry\` reruns a failing test until it passes, which hides a flaky test instead of naming it. Run the suite once; a test that fails and then passes unchanged is named as flaky and filed as a card (\`core/testing.md\`). \`--rerun-each\` stays allowed for finding one.`;
}

/** One reason for both signal checks (kill-guard D4). */
const SIGNAL =
	"command-guard: this command may signal a process the session did not start. `pkill`, `killall`, `killall5` and `skill` pick theirs by name across the machine, and `kill` passes only as the command's own name, with literal job specs (`%1`) or, after `-0`, plain numeric pids. Stop a background task you started with TaskStop; a job this same line started with `&` is `kill %N`; any other process is not the session's to signal — ask the user. The bare word is matched anywhere, so search for it with a quoted pattern such as `'[k]ill'`.";

const base = (word: string) => word.split("/").pop();

/**
 * Why `part` holds a word naming `pkill`, `killall`, `killall5` or `skill`,
 * or nothing. A word anywhere, not a command name: a prefix the guard does
 * not know (`noglob`, `setsid`, `find -exec`) would otherwise hide it, and a
 * list of prefixes is the enumeration kill-guard D2 rejects.
 */
export function killByName(part: string[]): string | undefined {
	return part.some((word) => ["pkill", "killall", "killall5", "skill"].includes(base(word) ?? "")) ? SIGNAL : undefined;
}

/**
 * Why `part` holds the word `kill` aimed past a job of the line's own shell,
 * or nothing (kill-guard D2, D3). `kill` must be the command's name with no
 * prefix — `xargs`, `watch` and the like append or rewrite its words — and no
 * substitution may feed the command. Its words are read raw, redirections
 * included: an open one is refused, since quoted it is a word `kill` gets and
 * the next word reaches `kill` as a pid (`kill '<' 95034`).
 */
export function killSignal(part: string[]): string | undefined {
	const at = part.findIndex((word) => base(word) === "kill");
	if (at === -1) return undefined;
	if (FED.has(part) || part.findIndex((_, index) => named(part, index)) !== at) return SIGNAL;
	const words: string[] = [];
	for (const word of part.slice(at + 1)) {
		if (OPEN_REDIRECTION.test(word)) return SIGNAL;
		if (!REDIRECTION.test(word)) words.push(word);
	}
	let next = 0;
	const first = words[0] ?? "";
	if (first === "-s" || first === "-n") {
		if (!/^[A-Za-z0-9]+$/.test(words[1] ?? "")) return SIGNAL;
		next = 2;
	} else if (/^-[A-Za-z0-9]+$/.test(first)) next = 1;
	if (words[next] === "--") next++;
	// After `-0` a pid is only probed; a `-9` there would be a process group.
	const operand = first === "-0" ? /^[0-9]+$/ : /^%[A-Za-z0-9_+%-]*$/;
	return words.slice(next).every((word) => operand.test(word)) ? undefined : SIGNAL;
}
