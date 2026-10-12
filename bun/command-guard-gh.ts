/**
 * What `command-guard.ts` refuses of a `gh` invocation: the subcommands that
 * publish text under the user's name, and `gh api` reaching the same endpoints
 * with a method that writes. Each check returns the reason rather than
 * blocking, because the exit code and the ledger id are the guard's, written
 * at its call site.
 */

/** The `gh` subcommand pairs that publish text on the user's behalf. */
const GH_WRITES = [
	["pr", "comment"],
	["issue", "comment"],
	["pr", "review"],
];

/** The methods `gh api` reads with; any other one it is given writes. */
const READS = new Set(["GET", "HEAD"]);

/**
 * A method flag in every spelling `gh api` honours, probed against gh 2.97:
 * `--method V`, `--method=V`, `-X V`, `-X=V`, `-XV`, and `-iX V`, since `-i`
 * is its one boolean shorthand and so the one that can bundle in front.
 */
const METHOD = /^(--method(?==|$)|-i*X)=?(.*)$/;

/**
 * The other flags that take a value, as `gh api --help` lists them on gh
 * 2.97, where each owns the next word: written bare, without `=`, or as the
 * last letter of a bundle behind the booleans `-i` and `-h`. A value attached
 * in the same word, as in `-tX` or `--jq=.`, takes no word after it.
 */
const OWNS_NEXT_VALUE =
	/^(--(cache|field|header|hostname|input|jq|preview|raw-field|template)|-[ih]*[FHfpqt])$/;

/** Each method flag in `words`, as written, with the method it names. */
function methods(words: string[]): { flag: string; method: string }[] {
	const found = [];
	for (let at = 0; at < words.length; at++) {
		const word = words[at] ?? "";
		// Every word after `--` is an operand, so `-XPOST` there is a path.
		if (word === "--") break;
		if (OWNS_NEXT_VALUE.test(word)) {
			at++;
			continue;
		}
		const attached = METHOD.exec(word)?.[2];
		if (attached === undefined) continue;
		// `-X=` names an empty method, which blocks; only a bare flag takes the
		// next word.
		const separate = !attached && !word.includes("=");
		const method = separate ? (words[++at] ?? "") : attached;
		found.push({ flag: separate ? `${word} ${method}` : word, method });
	}
	return found;
}

/**
 * A flag that owns the word after it while gh looks for a subcommand: a long
 * one without `=`, or a lone short letter. `-Ro/r` carries its value, and gh
 * 2.97 resolves `gh pr -Ro/r comment` and `gh pr -R o/r comment` alike to
 * `pr comment`; a flag `pr` does not know fails before anything runs.
 */
const OWNS_NEXT = /^(--[^=]+|-[^-])$/;

/** The word gh resolves as the subcommand of `words[at]`. */
function subcommandOf(words: string[], at: number): string | undefined {
	for (let next = at + 1; next < words.length; next++) {
		const word = words[next] ?? "";
		if (!word.startsWith("-")) return word;
		if (OWNS_NEXT.test(word)) next++;
	}
	return undefined;
}

/** Why `gh` with these words after it publishes text, or `undefined`. */
export function ghPublish(rest: string[]): string | undefined {
	// Anywhere, not the first two words: a global flag's value sits in front of
	// them in `gh --repo a/b pr comment`.
	const write = GH_WRITES.find(([a, b]) =>
		rest.some((word, at) => word === a && subcommandOf(rest, at) === b),
	);
	if (!write) return undefined;
	return `command-guard: \`gh ${write.join(" ")}\` publishes text under the user's name. Report what you would have written and let them send it.`;
}

/** Why these words make a `gh api` call that writes, or `undefined`. */
export function ghApiWrite(rest: string[]): string | undefined {
	// The top-level command, resolved as gh does: `api` as a flag's value in
	// `gh --repo api issue list` is no `api` call.
	if (subcommandOf(rest, -1) !== "api") return undefined;
	// Any flag naming a write, not the last: gh honours the last, and blocking
	// on any one errs the way the guard resolves every uncertainty.
	const sent = methods(rest).find(
		({ method }) => !READS.has(method.toUpperCase()),
	);
	if (!sent) return undefined;
	return `command-guard: \`gh api\` with \`${sent.flag}\` sends a write under the user's name — only GET and HEAD read. To read, name \`-X GET\`; to write, report what you would have sent and let them send it.`;
}
