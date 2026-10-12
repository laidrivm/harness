/**
 * What git's own option grammar says about the words of a `git` command line:
 * which options take the next word as their value, and which spellings git
 * reads as a forced or a ref-wide push. Facts about git that
 * `command-guard.ts` consumes, kept apart from its statement of what is
 * refused, as `command-parse.ts` keeps how a shell line is read.
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
 * form matches an `f` anywhere in the group, and `-f` is the only short option
 * of `git push` that carries one. The long form matches by prefix because git
 * accepts any unambiguous abbreviation: `--force-w` and `--force-i` are taken,
 * while `--forc` and `--fo` are rejected as ambiguous, so every spelling git
 * honours begins with `--force`. `--follow-tags` and `--fixup` do not.
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
 * Options whose value is the next word. Matched by their exact spelling, unlike
 * `REF_WIDE`: a prefix here could swallow the word after it and hide an
 * operand, while an abbreviation left unskipped is read as an operand and can
 * only refuse a push. Both lists resolve their uncertainty towards blocking.
 * The `=` forms need no entry — they are one word, and start with `-`.
 */
export const PUSH_VALUE_OPTIONS = new Set([
	"-o",
	"--push-option",
	"--receive-pack",
	"--exec",
	"--repo",
]);
