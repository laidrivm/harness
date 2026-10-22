/**
 * What `command-guard.ts` refuses once the line is read: an interpreter given
 * program text the guard does not read — inline code, standard input, or a
 * file the tree does not hold as committed (interpreter-prompt). Stated by
 * what it exempts: a version or help query, a shell's `-c` text (read by the
 * guard itself), a file tracked unchanged from `HEAD` or installed under the
 * repository's top-level `node_modules/harness/`, and the bun subcommands
 * that run no code handed to them. Uncertainty refuses. Each check returns the
 * reason rather than deciding, because the exit and the ledger id are the
 * guard's.
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { shellWords } from "./command-guard-exec.ts";
import { OPEN_REDIRECTION, place, SHELLS } from "./command-words.ts";

export type Refusal = { id: "inline-code" | "stdin-code" | "untracked-script"; reason: string };

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

const refuse = (name: string, id: Refusal["id"], what: string): Refusal => ({
	id,
	reason: `command-guard: \`${name}\` is given ${what}, so the guard cannot read the program it runs and refuses it — a local \`allow\` rule would silence a prompt. To run it, commit the script and run it by its path.`,
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
		// a tracked directory passes both git checks while it holds an untracked entry point
		if (!statSync(real).isFile()) return false;
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

/** The scripts of `file`, read as the JSONC bun accepts, or `null` when unreadable. */
function scripts(file: string): Record<string, unknown> | null {
	try {
		return (Bun.JSONC.parse(readFileSync(file, "utf8")) as { scripts?: Record<string, unknown> })?.scripts ?? {};
	} catch {
		return null;
	}
}

/** The scripts being read, so a script that runs itself is read once. */
const reading = new Set<string>();

/**
 * `bun run <operand>` from each directory the line may run in: bun runs a
 * script of the nearest `package.json` before a same-name file, so a script
 * is read first — its `package.json` must be committed, and `read` checks its
 * command line as the guard checks a typed line. Otherwise the operand must
 * be a regular file the file rule passes.
 */
function bunRun(operand: string, dirs: Set<string | null>, read: (line: string) => void): Refusal | undefined {
	const none = refuse("bun run", "untracked-script", `\`${operand}\`, which no committed package.json names as a script`);
	for (const from of dirs) {
		if (from === null) return none;
		const file = manifest(from);
		const found = file === null ? {} : scripts(file);
		if (found === null) return none;
		const script = found[operand];
		if (typeof script === "string") {
			if (!committed(file as string, new Set([from]))) return none;
			const key = `${file}\0${operand}`;
			if (reading.has(key)) continue;
			reading.add(key);
			try {
				// bun runs `pre<name>` and `post<name>` around the script itself
				for (const line of [found[`pre${operand}`], script, found[`post${operand}`]])
					if (typeof line === "string") read(line);
			} finally {
				reading.delete(key);
			}
			continue;
		}
		const at = place(from, operand);
		if (at === null || !existsSync(at) || !statSync(at).isFile()) return none;
		if (!committed(operand, new Set([from])))
			return refuse("bun run", "untracked-script", "a file the repository does not hold as committed");
	}
	return undefined;
}

/**
 * Why `name` with `rest` is refused, or nothing. `first` says `name` is
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
): Refusal | undefined {
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
		return refuse(name, "stdin-code", "its program on standard input");
	else if (file.startsWith("-"))
		return refuse(name, "inline-code", `the option \`${file}\` before any file, which may carry code inline`);
	else if (name === "bun" && BUN_SUBCOMMANDS.has(file)) {
		if (RUNS_CODE.has(file))
			return refuse(`bun ${file}`, "inline-code", "code to run that no file in the tree holds");
		if (file !== "run") return undefined;
		// an option may take the next word as its value or pick another package
		const at = words.findIndex((word, index) => index > 0 && !word.startsWith("-"));
		if (at > 1)
			return refuse("bun run", "untracked-script", `the option \`${words[1]}\` before its script, which may change what runs`);
		return at === 1 ? bunRun(words[1], dirs, read) : undefined;
	}
	return committed(file, dirs)
		? undefined
		: refuse(name, "untracked-script", `\`${file}\`, which the repository does not hold as committed`);
}
