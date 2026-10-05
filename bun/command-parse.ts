/**
 * The shell-line reader `scripts/command-guard.ts` decides on: it turns one
 * `tool_input.command` into the invocations a shell would actually run, so the
 * guard's prohibitions read command names rather than spellings.
 *
 * It parses nothing beyond what deciding those prohibitions needs — no
 * redirections, no expansions, no operator precedence. Every uncertainty is
 * resolved towards seeing more commands rather than fewer, because a fragment
 * the reader misses is a fragment the guard never checks.
 */

/** Characters that end one command and start the next, outside quotes. */
const SEPARATORS = new Set([";", "\n", "|", "&", "(", ")"]);

/**
 * Splits a command line into commands, each a list of words with its quoting
 * removed. Quote-aware in both directions, and that matters twice over:
 *
 * - A separator inside quotes does not start a command, so
 *   `git push origin "a;b" --force` stays one and `git log --grep="x; git
 *   commit"` does not become two.
 * - A space inside quotes does not end a word, so `GIT_AUTHOR_NAME="Jane Doe"
 *   git commit` still resolves to `git`, and `git -C "some path" commit` still
 *   finds `commit`. Splitting on whitespace alone lost both.
 *
 * Command substitution starts a command even inside double quotes, in both of
 * the POSIX spellings — `$(…)` and backticks — because the shell substitutes
 * there and a guard that honoured only one would be walked around with the
 * other. A substitution suspends the quote enclosing it and its close restores
 * it, so the quote the shell sees closing is the one this reader sees closing
 * too: read as an opening quote instead, `echo "$(true)"; git push` swallowed
 * the separator and the push after it into a single quoted word.
 */
export function commands(line: string): string[][] {
	const all: string[][] = [];
	let words: string[] = [];
	let word = "";
	let quote = "";
	/**
	 * What an open substitution or subshell suspended, innermost last. Both
	 * the enclosing quote and the enclosing `case` depth, because the text
	 * inside one is a fresh command context: an outer `case` left standing
	 * would stop its `)` closing, so `case x in a) echo "$(true)"; git commit`
	 * came through as one quoted word.
	 */
	const suspended: { quote: string; cases: number; pattern: boolean }[] = [];
	/** Backticks do not nest, so one flag tells the opening one from the close. */
	let backtick = false;
	/**
	 * How many `case` statements are open here. Inside one, a `)` terminates a
	 * pattern and closes nothing this scan opened.
	 *
	 * Counted only where the word opens a command, because `case` is a keyword
	 * there and an argument anywhere else. Counting it as an argument too is
	 * not the safe direction it looks: leaving the stack unpopped means the
	 * real closing quote is read as an opening one, which is the bug this
	 * whole mechanism exists to stop — `echo case; echo "$(true)"; git commit`
	 * reached the guard as one quoted word.
	 */
	let cases = 0;
	/**
	 * Whether the scan stands in a `case` pattern — between `in` (or a `;;`)
	 * and the `)` that ends the pattern. There `(`, `|` and every word are
	 * pattern syntax rather than shell syntax, and reading them as shell syntax
	 * is what let `echo "$(case x in (foo|case) true ;; esac)"; git commit`
	 * through: the leading `(` suspended a frame nothing would restore, `|`
	 * opened a command for the literal `case` to be counted as a keyword in,
	 * and the substitution's own `)` went to that stray frame instead of the
	 * substitution — leaving the commit inside a quote.
	 */
	let pattern = false;

	const suspend = () => {
		suspended.push({ quote, cases, pattern });
		quote = "";
		cases = 0;
		pattern = false;
	};
	const resume = () => {
		const was = suspended.pop();
		quote = was?.quote ?? "";
		cases = was?.cases ?? 0;
		pattern = was?.pattern ?? false;
	};

	const endWord = () => {
		if (word) {
			if (words.length === 0) {
				// `esac` closes the statement from a pattern position too, because
				// that is where the last `;;` leaves the scan standing.
				if (word === "esac") {
					cases = Math.max(0, cases - 1);
					pattern = false;
				} else if (!pattern && word === "case") cases++;
			} else if (word === "in" && words[0] === "case") pattern = true;
			words.push(word);
		}
		word = "";
	};
	const endCommand = () => {
		endWord();
		if (words.length) all.push(words);
		words = [];
	};

	for (let at = 0; at < line.length; at++) {
		const char = line.charAt(at);
		if (char === "\\" && quote !== "'") {
			word += line.charAt(++at);
		} else if (quote === "'") {
			if (char === "'") quote = "";
			else word += char;
		} else if (char === "$" && line[at + 1] === "(") {
			endCommand();
			suspend(); // inside the substitution neither is in force
			at++;
		} else if (char === "`") {
			endCommand();
			if (backtick) resume();
			else suspend();
			backtick = !backtick;
		} else if (quote === '"') {
			if (char === '"') quote = "";
			else word += char;
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (pattern && (char === "(" || char === "|")) {
			// Pattern syntax: the optional `(` opening a pattern is not a subshell,
			// and `|` between alternatives is not a pipe.
			endWord();
		} else if (SEPARATORS.has(char)) {
			// `;;` ends the command list and puts the scan back in a pattern, so
			// the `(` and `|` of every pattern after the first are read as such.
			if (char === ";" && line[at + 1] === ";" && cases > 0) pattern = true;
			endCommand();
			// A subshell suspends as a substitution does. That is what keeps the
			// `)` closing a group inside `$( … )` from restoring the quote the
			// substitution suspended and putting the rest of it back in quotes.
			if (char === "(") suspend();
			// A `)` ending a pattern closes nothing this scan opened. Resuming
			// there would restore the quote of a substitution that is still open —
			// which put `echo "$(case x in a) git commit ;; esac)"` back inside
			// quotes and hid the commit. The `cases` test stands behind the
			// pattern flag for a pattern the flag did not see begin.
			if (char === ")") {
				if (pattern) pattern = false;
				else if (cases === 0) resume();
			}
		} else if (/\s/.test(char)) {
			endWord();
		} else {
			word += char;
		}
	}
	endCommand();
	return all;
}

/**
 * Words that run the command after them, so the guarded name is further along:
 * `command git`, `env GIT_TRACE=1 git`. What options each takes is not modelled
 * — see `invocations` for what stands in for that — so adding one here costs
 * nothing but the candidates it produces.
 */
const WRAPPERS = new Set(["command", "builtin", "exec", "env"]);

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

/** A redirection whose target is the next word rather than part of this one. */
const OPEN_REDIRECTION = /^[0-9]*[<>]{1,2}&?$/;

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
		if (WRAPPERS.has(name)) {
			wrapped = true;
			continue;
		}
		found.push([name, words.slice(at + 1)]);
		if (!wrapped) break;
	}
	return found;
}
