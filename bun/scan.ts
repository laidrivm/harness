/**
 * The one left-to-right scan of a source file. `blank` returns it with
 * everything that is not code replaced by spaces, so a pattern found in the
 * result is one the language reads as code rather than as text; `comments`
 * returns what that same walk passed over.
 *
 * Its own module rather than a helper inside a caller, so a caller erasing
 * comments and a caller reading them decide a regex literal or a template
 * expression once instead of being kept in step by hand. The `scan-lift`
 * card on `Harness` records the copy still outstanding.
 */

/**
 * A `/` opens a regex literal only where a value may begin; after one it is
 * division. The token before it is what tells them apart — a character for
 * punctuation, a word for the keywords a value may follow.
 */
const OPENS_VALUE = "(,=:[!&|?{};+-*%~^<>";
const OPENS_VALUE_WORDS = new Set([
	"return",
	"typeof",
	"instanceof",
	"in",
	"of",
	"case",
	"do",
	"else",
	"yield",
	"await",
	"new",
	"delete",
	"void",
	"throw",
]);

/** Where one comment's own text sits, the marker that opened it excluded. */
type Span = { from: number; to: number; block: boolean };

/** One comment: its text, the line it opens on, and which kind it is. */
export type Comment = { text: string; line: number; block: boolean };

/**
 * What each language encloses text in, and therefore what this scan erases.
 * Stated here rather than left to a default, because the two mistakes worth
 * making are both silent: CSS has no `//` comment, so reading one would blank
 * a rule from `url(//cdn/x.png)` to the end of the line, and it has no regex
 * literal, so a `/` inside a path would erase to the next one.
 */
const SYNTAX = {
	css: { lineComments: false, regex: false, templates: false },
	ts: { lineComments: true, regex: true, templates: true },
} as const;

/**
 * Whether a word that may open a value is doing so here.
 *
 * Only `of` is in doubt: every other word in the list is reserved, where `of`
 * is a keyword in `for (x of …)` and a name anywhere else — and this
 * repository declares parameters called `of`. As a keyword it follows the
 * binding, so the token before it is an identifier or the `]` or `}` closing a
 * destructuring pattern; as a name it follows an operator, and `of / 2` is a
 * division the scan would otherwise read as a regex literal, swallowing
 * whatever `/` came next along with it.
 */
const contextual = (word: string, before: string) =>
	word !== "of" || /^[A-Za-z_$\]}]/.test(before);

/**
 * `source` with its comments, strings and — where the language has them —
 * template text and regex literals replaced by spaces, so what is left at a
 * given offset is code and nothing else. Lengths and newlines are preserved,
 * so a token found in the result can be read back out of the original at the
 * same place.
 *
 * A left-to-right scan carrying state, because deciding what a character means
 * without knowing what it sits inside is one mistake, and the shapes it takes
 * — an escaped quote ending a string early, a `/*` inside a line comment, a
 * quote inside a regex literal swallowing the rest of the file — are one bug.
 * A template literal is two things at once, so its text is blanked and its
 * `${…}` is not: the expression is code, and a read inside one is a read.
 *
 * Not a parser: the only question asked of each character is what encloses it.
 */
function walk(source: string, language: keyof typeof SYNTAX) {
	const { lineComments, regex, templates } = SYNTAX[language];
	/** Where each comment's own text begins and ends, in source offsets. */
	const found: Span[] = [];
	// Indexed by UTF-16 unit, as `source[i]` is, so an astral character does not
	// shift every offset after it.
	const out = source.split("");
	const erase = (from: number, to: number) => {
		for (let k = from; k < to && k < out.length; k++) {
			if (out[k] !== "\n") out[k] = " ";
		}
	};

	// One entry per template literal currently open, holding the `{` nesting
	// inside its interpolation, or `null` while its text rather than an
	// expression is being read. An empty stack is ordinary code.
	const open: (number | null)[] = [];
	let span = 0; // where the template text being blanked started
	// The last two tokens, not one: `of` is a keyword in `for (x of …)` and an
	// ordinary identifier everywhere else, and only the token before it tells
	// the two apart. `note` is what keeps the pair in step.
	let previous = "";
	let before = "";
	const note = (token: string) => {
		before = previous;
		previous = token;
	};
	let i = 0;

	const word = (at: number) => {
		let end = at;
		while (end < source.length && /[A-Za-z_$]/.test(source[end] as string))
			end++;
		return source.slice(at, end);
	};

	while (i < source.length) {
		const c = source[i] as string;
		const next = source[i + 1];
		const inText = open.length > 0 && open.at(-1) === null;

		if (inText) {
			if (c === "\\") {
				i += 2;
			} else if (c === "`") {
				erase(span, i);
				open.pop();
				i++;
				note("`");
			} else if (c === "$" && next === "{") {
				erase(span, i);
				open[open.length - 1] = 0;
				i += 2;
				note("{");
			} else {
				i++;
			}
			continue;
		}

		if (c === "'" || c === '"') {
			const start = i;
			i++;
			while (i < source.length && source[i] !== c) {
				if (source[i] === "\\") {
					i += 2;
					continue;
				}
				// A raw newline cannot sit inside a '' or "" literal, so a quote
				// that opened no string stops here instead of swallowing the rest
				// of the file and taking the scan silent with it.
				if (source[i] === "\n") break;
				i++;
			}
			if (source[i] === c) i++;
			erase(start, i);
			note(c);
		} else if (c === "`" && templates) {
			open.push(null);
			span = i + 1;
			i++;
		} else if (c === "}" && open.length > 0 && open.at(-1) === 0) {
			// The brace that closes the interpolation, so its template's text
			// resumes here.
			open[open.length - 1] = null;
			span = i + 1;
			i++;
		} else if (c === "{" && open.length > 0 && open.at(-1) !== null) {
			open[open.length - 1] = (open.at(-1) as number) + 1;
			note(c);
			i++;
		} else if (c === "}" && open.length > 0 && open.at(-1) !== null) {
			open[open.length - 1] = (open.at(-1) as number) - 1;
			note(c);
			i++;
		} else if (lineComments && c === "/" && next === "/") {
			const start = i;
			while (i < source.length && source[i] !== "\n") i++;
			// From after the marker, which is where a directive's own text
			// starts, and clamped because an unterminated block runs past the end.
			found.push({ from: start + 2, to: i, block: false });
			erase(start, i);
		} else if (c === "/" && next === "*") {
			const start = i;
			i += 2;
			while (i < source.length && !(source[i] === "*" && source[i + 1] === "/"))
				i++;
			found.push({
				from: start + 2,
				to: Math.min(i, source.length),
				block: true,
			});
			i += 2;
			erase(start, i);
		} else if (
			c === "/" &&
			regex &&
			(previous === "" ||
				OPENS_VALUE.includes(previous) ||
				(OPENS_VALUE_WORDS.has(previous) && contextual(previous, before)))
		) {
			const start = i;
			i++;
			let inClass = false;
			while (i < source.length) {
				if (source[i] === "\\") {
					i += 2;
					continue;
				}
				if (source[i] === "[") inClass = true;
				else if (source[i] === "]") inClass = false;
				// An unterminated literal is a syntax error, not something to scan
				// past: stop at the newline rather than run to end of input.
				else if (source[i] === "\n") break;
				else if (source[i] === "/" && !inClass) break;
				i++;
			}
			if (source[i] === "/") i++;
			erase(start, i);
			note("/");
		} else if (/[A-Za-z_$]/.test(c)) {
			const found = word(i);
			note(found);
			i += found.length;
		} else {
			if (c.trim() !== "") note(c);
			i++;
		}
	}

	return { out, found };
}

/**
 * `source` with everything the scan erases replaced by spaces. The signature
 * every caller had before the scan also reported what it erased.
 */
export const blank = (source: string, language: keyof typeof SYNTAX): string =>
	walk(source, language).out.join("");

/**
 * Every comment in `source`, its own text and the line it opens on.
 *
 * Read out of the source at the offsets the scan reached rather than out of
 * the blanked copy, which no longer carries either. One walk answers this and
 * `blank` both, so a comment inside a regex literal or a template expression
 * is decided once — which is the hole the line-based scanner this replaces
 * left, and the reason two of them were being kept in step by hand.
 */
export function comments(
	source: string,
	language: keyof typeof SYNTAX,
): Comment[] {
	// Counted forward from the previous span rather than over the whole prefix
	// each time: the spans arrive in ascending order, so one pass covers them.
	let at = 0;
	let line = 1;
	return walk(source, language).found.map(({ from, to, block }) => {
		for (; at < from; at++) if (source[at] === "\n") line++;
		return { text: source.slice(from, to), line, block };
	});
}
