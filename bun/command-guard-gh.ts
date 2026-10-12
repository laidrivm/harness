/**
 * What `command-guard.ts` refuses of a `gh` invocation: the subcommands that
 * publish text under the user's name, and `gh api` reaching the same endpoints
 * with a method that writes. It returns the reason rather than blocking,
 * because the exit code is the guard's.
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

/** Each method flag in `words`, as written, with the method it names. */
function methods(words: string[]): { flag: string; method: string }[] {
	const found = [];
	for (let at = 0; at < words.length; at++) {
		const word = words[at] ?? "";
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

/** Why `gh` with these words after it must not run, or `undefined` when it may. */
export function ghRefusal(rest: string[]): string | undefined {
	// Adjacent anywhere, not the first two words: a global flag's value sits in
	// front of them in `gh --repo a/b pr comment`.
	const plain = rest.filter((word) => !word.startsWith("-"));
	const write = GH_WRITES.find(([a, b]) =>
		plain.some((word, at) => word === a && plain[at + 1] === b),
	);
	if (write) {
		return `command-guard: \`gh ${write.join(" ")}\` publishes text under the user's name. Report what you would have written and let them send it.`;
	}
	if (!plain.includes("api")) return undefined;

	// Any flag naming a write, not the last: gh honours the last, and blocking
	// on any one errs the way the guard resolves every uncertainty.
	const sent = methods(rest).find(
		({ method }) => !READS.has(method.toUpperCase()),
	);
	if (sent) {
		return `command-guard: \`gh api\` with \`${sent.flag}\` sends a write under the user's name — only GET and HEAD read. Drop the flag to read, or report what you would have sent and let them send it.`;
	}
	return undefined;
}
