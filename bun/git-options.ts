/**
 * What git's own option grammar says about the words of a `git` command line:
 * which options take the next word as their value, how a push's words divide
 * into switches and operands, and which spellings git reads as a forced or a
 * ref-wide push. Facts about git that `command-guard.ts` consumes, kept apart
 * from its statement of what is refused, as `command-parse.ts` keeps how a
 * shell line is read.
 */

/**
 * Global options that swallow the token after them, so the subcommand of
 * `git -C some/dir commit` resolves to `commit` and not to the path.
 * `--exec-path` is absent on purpose: bare, it prints the path and runs
 * nothing, so treating the next token as its value would be wrong.
 */
export const VALUE_OPTIONS = new Set([
	"-C",
	"-c",
	"--git-dir",
	"--work-tree",
	"--namespace",
	"--config-env",
]);

/**
 * Short flags bundle — git reads `push -uf` as `-u -f` — so the single-dash
 * form matches an `f` anywhere in the group `pushWords` leaves once it has cut
 * off a value, and `-f` is the only short option of `git push` that carries
 * one. The long form matches by prefix because git accepts any unambiguous
 * abbreviation: `--force-w` and `--force-i` are taken, while `--forc` and
 * `--fo` are rejected as ambiguous, so every spelling git honours begins with
 * `--force`. `--follow-tags` and `--fixup` do not.
 */
export const FORCE = /^(-[a-z0-9]*f[a-z0-9]*$|--force)/;

/**
 * Options of `git push` that act on refs the command never names, so no
 * destination check can clear them: the first three push every ref under
 * `refs/heads/` or `refs/`, `main` among them, and `--prune` deletes a remote
 * branch that has no local counterpart — `main` itself in any tree that does
 * not carry it.
 */
export const REF_WIDE = ["--all", "--branches", "--mirror", "--prune"];

/**
 * Options of `git push` whose value is required, so the next word is that value
 * whatever it looks like — as `git push -h` lists them in git 2.47.0. Matched by
 * their exact spelling, unlike `REF_WIDE`: a prefix here could swallow the word
 * after it and hide a switch or an operand, while an abbreviation left unskipped
 * has its value read as one and can only refuse a push. Both lists resolve
 * their uncertainty towards blocking. The `=` forms need no entry — they are
 * one word.
 */
export const PUSH_VALUE_OPTIONS = new Set([
	"-o",
	"--push-option",
	"--receive-pack",
	"--exec",
	"--repo",
	"--recurse-submodules",
]);

/** The letters of the short options above, such as `o` in `-uo x`. */
const SHORT_VALUES = [...PUSH_VALUE_OPTIONS]
	.filter((option) => /^-[a-z]$/.test(option))
	.map((option) => option.slice(1));

/**
 * The words after `git push`, split the way git's option parser splits them:
 * the switches it acts on, each long one cut at its `=`, and the operands. A
 * value-taking option's value is neither — git sends `-o --force` on to the
 * server as a string and forces nothing. A short group is switches up to its
 * first value letter, whose value is the rest of the word or, with none left,
 * the next word.
 */
export function pushWords(args: string[]): {
	switches: string[];
	operands: string[];
} {
	const switches: string[] = [];
	const operands: string[] = [];
	for (let at = 0; at < args.length; at++) {
		const arg = args[at] ?? "";
		if (!arg.startsWith("-")) {
			operands.push(arg);
		} else if (arg.startsWith("--")) {
			const name = arg.split("=")[0] ?? arg;
			switches.push(name);
			if (name === arg && PUSH_VALUE_OPTIONS.has(name)) at++;
		} else {
			const value = [...arg].findIndex(
				(letter, i) => i > 0 && SHORT_VALUES.includes(letter),
			);
			if (value === -1) switches.push(arg);
			else {
				if (value > 1) switches.push(arg.slice(0, value));
				if (value === arg.length - 1) at++;
			}
		}
	}
	return { switches, operands };
}
