/**
 * What `command-guard.ts` asks about rather than blocks: an interpreter given
 * program text the guard does not read — inline code, standard input, or a
 * file the tree does not hold as committed (interpreter-prompt). Stated by
 * what it exempts: a version or help query, a shell's `-c` text (read by the
 * guard itself), a file tracked unchanged from `HEAD` or installed under the
 * repository's top-level `node_modules/harness/`, and the bun subcommands
 * that run no code handed to them. Uncertainty asks. Each check returns the
 * reason rather than deciding, because the exit, the stdout object and the
 * ledger id are the guard's.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { shellWords } from "./command-guard-exec.ts";
import { OPEN_REDIRECTION, place, SHELLS } from "./command-words.ts";

export type Ask = { id: string; reason: string };

/**
 * `bun`'s subcommands and the aliases its help names, read from bun 1.4.2's
 * `--help`; a test compares them with the installed `bun --help` both ways.
 */
export const BUN_SUBCOMMANDS = new Set([
	..."add audit build create dedupe exec info init install link outdated".split(" "),
	..."patch pm prune publish remove repl run test unlink update upgrade why x".split(" "),
	..."a c i rm".split(" "),
]);

/** The subcommands that run code handed to them; `x` is the `bunx` check's. */
const RUNS_CODE = new Set(["exec", "repl", "create", "c"]);

const INTERPRETER = /^(python(\d[\d.]*t?)?|node|bun|deno|perl|ruby|php)$/;

/** The words after the redirections, which name no program. */
const args = (rest: string[]) =>
	rest.filter(
		(word, at) =>
			!/^[0-9]*[<>]/.test(word) && !OPEN_REDIRECTION.test(rest[at - 1] ?? ""),
	);

const ask = (name: string, id: string, what: string): Ask => ({
	id,
	reason: `command-guard: \`${name}\` is given ${what}, so the guard cannot read the program it runs and asks you instead. To run without asking, commit the script and run it by its path.`,
});

/** git's answer in `cwd`, or `null` when the call fails. */
function git(cwd: string, ...words: string[]): string | null {
	const call = Bun.spawnSync(["git", ...words], { cwd, stderr: "ignore" });
	return call.exitCode === 0 ? call.stdout.toString().trim() : null;
}

/**
 * Whether `path`, read from every directory the line may run in and with its
 * symlinks resolved, is committed: tracked with no staged or uncommitted edit
 * against `HEAD`, or under its repository's top-level `node_modules/harness/`.
 * Anything this cannot establish is not.
 */
function committed(path: string, dirs: Set<string | null>): boolean {
	for (const from of dirs) {
		const at = place(from, path);
		if (at === null || !existsSync(at)) return false;
		const real = realpathSync(at);
		const top = git(dirname(real), "rev-parse", "--show-toplevel");
		if (top === null) return false;
		const inside = relative(realpathSync(top), real);
		if (inside.startsWith("node_modules/harness/")) continue;
		if (inside.startsWith("node_modules/")) return false;
		if (git(top, "ls-files", "--error-unmatch", "--", inside) === null) return false;
		if (git(top, "diff", "--quiet", "HEAD", "--", inside) === null) return false;
	}
	return true;
}

/** The nearest `package.json` above `from`, or `null`. */
function manifest(from: string): string | null {
	for (let dir = from; ; dir = dirname(dir)) {
		if (existsSync(join(dir, "package.json"))) return join(dir, "package.json");
		if (dir === dirname(dir)) return null;
	}
}

/**
 * `bun run <operand>`: a file the file rule decides, else a script of the
 * `package.json` it is read from, which must itself be committed and whose
 * command line `read` checks as the guard checks a typed line.
 */
function bunRun(operand: string, dirs: Set<string | null>, read: (line: string) => void): Ask | undefined {
	const files = [...dirs].map((from) => place(from, operand));
	if (files.some((file) => file !== null && existsSync(file)))
		return committed(operand, dirs)
			? undefined
			: ask("bun run", "untracked-script", "a file the repository does not hold as committed");
	for (const from of dirs) {
		const file = from === null ? null : manifest(from);
		const script = file && committed(file, new Set([from]))
			? JSON.parse(readFileSync(file, "utf8"))?.scripts?.[operand]
			: undefined;
		if (typeof script !== "string")
			return ask("bun run", "untracked-script", `\`${operand}\`, which no committed package.json names as a script`);
		read(script);
	}
	return undefined;
}

/**
 * Why `name` with `rest` is asked about, or nothing. `first` says `name` is
 * the line's first candidate, the only place a wrapper can run the builtins
 * `source` and `.`. A shell given no script file is the shell-stdin check's,
 * and `bun x` the `bunx` check's.
 */
export function interpreter(
	name: string,
	rest: string[],
	dirs: Set<string | null>,
	first: boolean,
	read: (line: string) => void,
): Ask | undefined {
	const words = args(rest);
	if (words.length === 1 && (words[0] === "--version" || words[0] === "--help"))
		return undefined;
	let file = words[0];
	if (SHELLS.has(name)) {
		const shell = shellWords(rest);
		file = rest[shell.operand];
		if (shell.command || shell.stdin || shell.info || file === undefined || file === "-" || /^\/(dev|proc)\//.test(file))
			return undefined;
	} else if (name === "source" || name === ".") {
		if (!first || file === undefined) return undefined;
	} else if (!INTERPRETER.test(name)) return undefined;
	else if (file === undefined || file === "-")
		return ask(name, "stdin-code", "its program on standard input");
	else if (file.startsWith("-"))
		return ask(name, "inline-code", `the option \`${file}\` before any file, which may carry code inline`);
	else if (name === "bun" && BUN_SUBCOMMANDS.has(file)) {
		if (RUNS_CODE.has(file))
			return ask(`bun ${file}`, "inline-code", "code to run that no file in the tree holds");
		const operand = words.slice(1).find((word) => !word.startsWith("-"));
		return file === "run" && operand ? bunRun(operand, dirs, read) : undefined;
	}
	return committed(file, dirs)
		? undefined
		: ask(name, "untracked-script", `\`${file}\`, which the repository does not hold as committed`);
}
