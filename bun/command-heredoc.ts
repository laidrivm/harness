/**
 * Where a heredoc's delimiter word and bodies lie in a command line, for the
 * scan in `command-parse.ts` that carries the heredoc state. Pure functions
 * over the source text, each reading from the offset the scan reached, so
 * neither sees a copy the scan has already unquoted.
 */

/** Refuses the call with a ledger id and a reason; the guard's `block`. */
export type Refuse = (id: string, reason: string) => never;

/** A heredoc operator's delimiter, as the shell matches body lines to it. */
export type Delimiter = {
	/** The word with its quoting removed, which a line must equal. */
	text: string;
	/** Whether any part of the word was quoted, which leaves the body inert. */
	quoted: boolean;
	/** Where the word ends in the source. */
	end: number;
	/** `<<-`, which strips leading tabs from each body line. */
	dash: boolean;
};

/** Characters that end a delimiter word outside quotes. */
const ENDS_WORD = /[\s;&|<>)]/;

/**
 * The delimiter word of a heredoc operator, read from `at`, just past its
 * `<<`. `null` where there is no word before the line ends, or a quote in it
 * never closes: the scan then reads the operator as it would any other text,
 * and the shell runs none of what follows.
 *
 * A `$` is kept literally, since the shell does not expand a delimiter: `<<$X`
 * ends at a `$X` line. A backtick or `(` refuses the call, since the shell
 * reads `$(…)` as part of the word and where that ends is not read here.
 */
export function delimiter(
	line: string,
	at: number,
	refuse: Refuse,
): Delimiter | null {
	const dash = line[at] === "-";
	if (dash) at++;
	while (line[at] === " " || line[at] === "\t") at++;
	const found = { text: "", quoted: false, end: at, dash };
	for (; at < line.length; at++) {
		const char = line.charAt(at);
		if (char === "\\" && line[at + 1] === "\n") at++;
		else if (char === "\\") {
			found.quoted = true;
			found.text += line.charAt(++at);
		} else if (char === "'" || char === '"') {
			const close = line.indexOf(char, at + 1);
			if (close === -1) return null;
			found.quoted = true;
			found.text += line.slice(at + 1, close);
			at = close;
		} else if (char === "`" || char === "(") {
			refuse(
				"unplaced-heredoc",
				"command-guard: this heredoc's delimiter word holds a backtick or `(`, so where its body ends cannot be read. Spell the delimiter as a plain word, such as 'EOF'.",
			);
		} else if (ENDS_WORD.test(char)) break;
		else found.text += char;
	}
	found.end = at;
	return found.text ? found : null;
}

/** A placed body: where it starts and ends, and the offset after its delimiter line. */
export type Body = { start: number; end: number; resume: number };

/**
 * The bodies of `pending`, placed one after another from `from`, the offset
 * after the newline that starts the first. Placing stops at the first body
 * whose delimiter line never comes, which the scan then reads as commands.
 *
 * An unquoted delimiter whose body ends at a different line once
 * backslash-newlines join its lines refuses the call: bash, zsh and sh join
 * them there and dash does not, so which lines run as commands cannot be
 * told. A quoted delimiter is matched without joining, as every shell does.
 */
export function placeBodies(
	line: string,
	from: number,
	pending: Delimiter[],
	refuse: Refuse,
): (Body & { quoted: boolean })[] {
	const placed: (Body & { quoted: boolean })[] = [];
	for (const word of pending) {
		const plain = matchLine(line, from, word, false);
		if (!word.quoted && plain?.end !== matchLine(line, from, word, true)?.end)
			refuse(
				"unplaced-heredoc",
				"command-guard: a line of this heredoc's body ends it only once a backslash-newline joins it to the line before, which bash, zsh and sh do and dash does not, so which lines run as commands cannot be told. Quote the delimiter (<<'EOF'), or end no body line with a backslash.",
			);
		if (!plain) break;
		placed.push({ ...plain, quoted: word.quoted });
		from = plain.resume;
	}
	return placed;
}

/** The first line from `from` equal to the delimiter, lines joined where `join` says. */
function matchLine(
	line: string,
	from: number,
	word: Delimiter,
	join: boolean,
): Body | null {
	let start = from;
	let carried = "";
	for (let at = from; at <= line.length; ) {
		const newline = line.indexOf("\n", at);
		const stop = newline === -1 ? line.length : newline;
		const text = carried + line.slice(at, stop);
		// An odd run of backslashes ends a line the shell joins to the next.
		if (join && newline !== -1 && /(^|[^\\])(\\\\)*\\$/.test(text)) {
			carried = text.slice(0, -1);
		} else {
			const bare = word.dash ? text.replace(/^\t+/, "") : text;
			const resume = newline === -1 ? stop : stop + 1;
			if (bare === word.text) return { start: from, end: start, resume };
			carried = "";
			start = stop + 1;
		}
		if (newline === -1) return null;
		at = newline + 1;
	}
	return null;
}
