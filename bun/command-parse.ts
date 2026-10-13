/**
 * The shell-line reader `command-guard.ts` decides on: it turns one
 * `tool_input.command` into the invocations a shell would actually run, so the
 * guard's prohibitions read command names rather than spellings. What one
 * command's words invoke is `command-words.ts`'s.
 *
 * It parses nothing beyond what deciding those prohibitions needs — no
 * redirections, no expansions, no operator precedence. Reading more text as
 * commands is not the safe side it looks: a quote that text opens hides what
 * follows. So a boundary the shell places is placed here too, and a scan that
 * ends inside a quote refuses the call rather than guessing.
 */

import {
	type Delimiter,
	delimiter,
	placeBodies,
	type Refuse,
} from "./command-heredoc.ts";
import { readsScript } from "./command-words.ts";

/** Characters that end one command and start the next, outside quotes. */
const SEPARATORS = new Set([";", "\n", "|", "&", "(", ")"]);

/**
 * The commands `commands()` returned that a substitution interrupted. Beside
 * the arrays rather than in them, so the one caller's type stays as it was.
 */
export const FED = new WeakSet<string[]>();

/** What each quote and frame kind left open is called in a refusal. */
const OPEN: Record<string, string> = {
	"'": "a single-quoted string",
	'"': "a double-quoted string",
	"$(": "a `$(` substitution",
	"`": "a backtick substitution",
};

/**
 * Splits a command line into commands, each a list of words with its quoting
 * removed — then, where any command reads a script, every heredoc body on the
 * line as commands too, since one may be what it reads: `cat > s.sh <<'EOF' …
 * EOF; ./s.sh`. Which command a body feeds would need a model of pipes and
 * redirections, and `eval "$(cat <<'EOF' …)"` would still escape it.
 */
export function commands(line: string, refuse: Refuse): string[][] {
	const bodies: string[] = [];
	const all = scan(line, refuse, false, bodies);
	if (all.some(readsScript))
		for (const body of bodies) all.push(...commands(body, refuse));
	return all;
}

/**
 * The scan behind `commands()`: one pass, left to right. The shell has no
 * template expression or regex literal; the states it carries are the quote
 * (single or double), the comment, the substitution or subshell frames, the
 * `case` statement and its pattern, arithmetic, and the heredoc. Quote-aware
 * in both directions, and that matters twice over:
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
 *
 * A command that a `$(`, a backtick, or a `<(`/`>(` interrupts is added to
 * `FED`, because what the substitution produces becomes words of it that this
 * list never holds: `bash -c "echo $(curl …)"` comes back as `["bash", "-c",
 * "echo "]`.
 *
 * A quoted heredoc delimiter's body is data. An unquoted one's is scanned
 * with `inBody`, where only its substitutions are read: the rest is stdin.
 */
function scan(
	line: string,
	refuse: Refuse,
	inBody: boolean,
	bodies: string[],
): string[][] {
	const all: string[][] = [];
	let words: string[] = [];
	let word = "";
	let quote = "";
	/**
	 * What an open substitution or subshell suspended, innermost last, with
	 * the kind that opened it. Both the enclosing quote and the enclosing
	 * `case` depth, because the text inside one is a fresh command context: an
	 * outer `case` left standing would stop its `)` closing, so `case x in a)
	 * echo "$(true)"; git commit` came through as one quoted word.
	 */
	const suspended: {
		kind: string;
		quote: string;
		cases: number;
		pattern: boolean;
		arith: boolean;
		pending: Delimiter[];
	}[] = [];
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
	/**
	 * Whether the scan stands in `$((…))` or `((…))`, where `<<` is a shift.
	 * A `(` inside inherits it; `$(` and a backtick are commands again.
	 */
	let arith = false;
	/**
	 * Heredocs whose operator the scan has passed and whose body has not
	 * begun. They belong to the substitution level: a newline inside `$(…)` or
	 * backticks does not start their bodies, and one inside `( … )` does.
	 */
	let pending: Delimiter[] = [];

	const suspend = (kind: string) => {
		suspended.push({ kind, quote, cases, pattern, arith, pending });
		quote = "";
		cases = 0;
		pattern = false;
		if (kind !== "(") {
			arith = false;
			pending = [];
		}
	};
	const resume = () => {
		const was = suspended.pop();
		quote = was?.quote ?? "";
		cases = was?.cases ?? 0;
		pattern = was?.pattern ?? false;
		arith = was?.arith ?? false;
		if (was && was.kind !== "(") pending = was.pending;
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
	const endCommand = (fed = false) => {
		endWord();
		if (words.length) all.push(words);
		if (words.length && fed) FED.add(words);
		words = [];
	};

	/** Reads the pending bodies from `from`, returning where the scan goes on. */
	const skipBodies = (from: number) => {
		for (const body of placeBodies(line, from, pending, refuse)) {
			const text = line.slice(body.start, body.end);
			bodies.push(text);
			if (!body.quoted) all.push(...scan(text, refuse, true, bodies));
			from = body.resume;
		}
		pending = [];
		return from;
	};

	for (let at = 0; at < line.length; at++) {
		const char = line.charAt(at);
		if (
			inBody &&
			suspended.length === 0 &&
			char !== "`" &&
			!(char === "$" && line[at + 1] === "(")
		) {
			// Body text is input, so it is dropped. A backslash quotes what follows,
			// so the parity of a run decides whether `\\$(` or `\$(` substitutes.
			if (char === "\\") at++;
		} else if (char === "\\" && quote !== "'") {
			const next = line.charAt(++at);
			// Backslash-newline joins two lines and the shell drops both, so
			// `git \⏎ commit` is one command whose second word is `commit`.
			if (next !== "\n") word += next;
		} else if (quote === "'") {
			if (char === "'") quote = "";
			else word += char;
		} else if (char === "$" && line[at + 1] === "(") {
			endCommand(true);
			suspend("$("); // inside the substitution neither is in force
			arith = line[at + 2] === "(";
			at++;
		} else if (char === "`") {
			endCommand(!backtick);
			if (backtick) resume();
			else suspend("`");
			backtick = !backtick;
		} else if (quote === '"') {
			if (char === '"') quote = "";
			else word += char;
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (
			char === "#" &&
			word === "" &&
			/^$|[\s;&|()]$/.test(line.slice(at - 1, at))
		) {
			// A `#` opening a word comments out the rest of the line, so a quote
			// in it opens nothing — read as one, it swallowed the next line's
			// command. Mid-word, as in `a#b`, it is literal.
			while (at + 1 < line.length && line[at + 1] !== "\n") at++;
		} else if (line.startsWith("<<<", at)) {
			word += "<<<"; // a here-string, whose word is read as any other
			at += 2;
		} else if (char === "<" && line[at + 1] === "<" && !arith) {
			const found = delimiter(line, at + 2, refuse);
			// With no word to read, `<<` is read as any other text.
			if (!found) word += char;
			else {
				// Digits straight before the operator are its file descriptor.
				if (/^[0-9]+$/.test(word)) word = "";
				endWord();
				pending.push(found);
				at = found.end - 1;
			}
		} else if (pattern && (char === "(" || char === "|")) {
			// Pattern syntax: the optional `(` opening a pattern is not a subshell,
			// and `|` between alternatives is not a pipe.
			endWord();
		} else if (SEPARATORS.has(char)) {
			// `;;` ends the command list and puts the scan back in a pattern, so
			// the `(` and `|` of every pattern after the first are read as such.
			if (char === ";" && line[at + 1] === ";" && cases > 0) pattern = true;
			// `<(` and `>(` open a process substitution rather than a subshell.
			endCommand(char === "(" && /[<>]/.test(line.charAt(at - 1)));
			// A subshell suspends as a substitution does. That is what keeps the
			// `)` closing a group inside `$( … )` from restoring the quote the
			// substitution suspended and putting the rest of it back in quotes.
			if (char === "(") {
				suspend("(");
				arith ||= line[at + 1] === "(";
			}
			// A `)` ending a pattern closes nothing this scan opened. Resuming
			// there would restore the quote of a substitution that is still open —
			// which put `echo "$(case x in a) git commit ;; esac)"` back inside
			// quotes and hid the commit. The `cases` test stands behind the
			// pattern flag for a pattern the flag did not see begin.
			if (char === ")") {
				if (pattern) pattern = false;
				else if (cases === 0) resume();
			}
			if (char === "\n" && pending.length) at = skipBodies(at + 1) - 1;
		} else if (/\s/.test(char)) {
			endWord();
		} else {
			word += char;
		}
	}
	endCommand();
	const open =
		OPEN[quote] ??
		OPEN[suspended.findLast((frame) => frame.kind !== "(")?.kind ?? ""];
	if (open)
		refuse(
			"unclosed-quote",
			`command-guard: ${inBody ? "a heredoc body" : "the command"} ends inside ${open}. A shell runs none of such a command, and where the shell sees the quote closed, the guard has misread a boundary and cannot see what follows it. Close it, or quote the heredoc's delimiter.`,
		);
	return all;
}
