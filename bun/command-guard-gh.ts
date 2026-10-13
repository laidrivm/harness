/**
 * What `command-guard.ts` refuses of a `gh` invocation: the subcommands that
 * publish text under the user's name, and a `gh api` call reaching the same
 * endpoints that cannot be shown to read. Each check returns the reason rather than
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

/** `gh api`'s one-letter flags by their long names, from gh 2.97's `--help`. */
const SHORT: Record<string, string> = {
	F: "field",
	H: "header",
	X: "method",
	f: "raw-field",
	h: "help",
	i: "include",
	p: "preview",
	q: "jq",
	t: "template",
};

/** The `gh api` flags that take a value, from gh 2.97's `--help`. */
const TAKES_VALUE = new Set([
	"cache",
	"field",
	"header",
	"hostname",
	"input",
	"jq",
	"method",
	"preview",
	"raw-field",
	"template",
]);

/** A flag as written, by its long name, with the value it was given. */
type Flag = { name: string; written: string; value: string };

/**
 * `words` as pflag reads them, probed against gh 2.97. A value is attached
 * (`-XPOST`, `-X=POST`, `--jq=.`) or, for a flag that takes one written bare,
 * is the next word whatever it reads like, so `-XPOST` after `--template` is
 * a template. A short bundle runs the booleans `-i` and `-h` up to a letter
 * that takes a value, which takes the rest of the word. Every word after `--`
 * is an operand.
 */
function parse(words: string[]): { flags: Flag[]; operands: string[] } {
	const flags: Flag[] = [];
	const operands: string[] = [];
	for (let at = 0; at < words.length; at++) {
		const word = words[at] ?? "";
		if (word === "--") {
			operands.push(...words.slice(at + 1));
			break;
		}
		if (!word.startsWith("-") || word === "-") {
			operands.push(word);
			continue;
		}
		let name: string;
		let attached: string | undefined;
		if (word.startsWith("--")) {
			const eq = word.indexOf("=");
			name = word.slice(2, eq === -1 ? undefined : eq);
			attached = eq === -1 ? undefined : word.slice(eq + 1);
		} else {
			const letters = word.slice(1);
			const first = letters.search(/[^ih]/);
			for (const letter of letters.slice(0, first === -1 ? undefined : first))
				flags.push({ name: SHORT[letter] ?? letter, written: word, value: "" });
			if (first === -1) continue;
			const letter = letters[first] ?? "";
			name = SHORT[letter] ?? letter;
			const rest = letters.slice(first + 1);
			attached = rest ? rest.replace(/^=/, "") : undefined;
		}
		const bare = TAKES_VALUE.has(name) && attached === undefined;
		const value = bare ? (words[++at] ?? "") : (attached ?? "");
		flags.push({ name, written: bare ? `${word} ${value}` : word, value });
	}
	return { flags, operands };
}

/**
 * The flags that neither name a method nor carry a parameter: all a call with
 * no method may hold and still read. Any other — a field, `--input`, a flag
 * gh 2.97 does not list — makes it a write, so the test is scoped by the reads
 * it exempts.
 */
const READ_FLAGS = new Set([
	"allow-escape-sequences",
	"cache",
	"header",
	"help",
	"hostname",
	"include",
	"jq",
	"paginate",
	"preview",
	"silent",
	"slurp",
	"template",
	"verbose",
]);

/**
 * A flag that owns the word after it while gh looks for a subcommand: a long
 * one without `=`, or a lone short letter. `-Ro/r` carries its value, and gh
 * 2.97 resolves `gh pr -Ro/r comment` and `gh pr -R o/r comment` alike to
 * `pr comment`; a flag `pr` does not know fails before anything runs.
 */
const OWNS_NEXT = /^(--[^=]+|-[^-])$/;

/** Where the word gh resolves as the subcommand of `words[at]` stands, or -1. */
function subcommandAt(words: string[], at: number): number {
	for (let next = at + 1; next < words.length; next++) {
		const word = words[next] ?? "";
		if (!word.startsWith("-")) return next;
		if (OWNS_NEXT.test(word)) next++;
	}
	return -1;
}

const subcommandOf = (words: string[], at: number) =>
	words[subcommandAt(words, at)];

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
	const api = subcommandAt(rest, -1);
	if (rest[api] !== "api") return undefined;
	// Every word but `api` itself: a flag written before it reaches it too.
	const { flags, operands } = parse(rest.filter((_, at) => at !== api));
	const methods = flags.filter(({ name }) => name === "method");
	// Any flag naming a write, not the last: gh honours the last, and blocking
	// on any one errs the way the guard resolves every uncertainty.
	const sent = methods.find(({ value }) => !READS.has(value.toUpperCase()));
	if (sent) return refusal(`with \`${sent.written}\` sends a write`);
	if (operands[0] === "graphql" && !graphqlRead(flags)) {
		return "command-guard: `gh api graphql` can carry a mutation, and only an inline `-f query='query…'` holding no `mutation` reads as a read. Report what you would have sent and let them send it.";
	}
	if (methods.length > 0 || operands[0] === "graphql") return undefined;
	// `gh api --help`: "The default HTTP request method is `GET` normally and
	// `POST` if any parameters were added." Nothing in the command says POST.
	const body = flags.find(({ name }) => !READ_FLAGS.has(name));
	if (body) return refusal(`with \`${body.written}\` and no method sends POST`);
	return undefined;
}

const isField = (name: string) => name === "field" || name === "raw-field";

/**
 * Whether a `graphql` call reads: its document is inline as a `query` field,
 * opens with the `query` keyword and holds no `mutation` token, and every
 * other flag is a read flag, a read method, or a variable. The `coderabbit`
 * skill reads review-thread state this way, which no REST endpoint carries.
 * A token search refuses a query that merely names the word, the direction
 * the guard errs in; a document from a file (`@`, `--input`) blocks unread.
 */
function graphqlRead(flags: Flag[]): boolean {
	const query = ({ name, value }: Flag) =>
		isField(name) && value.startsWith("query");
	const documents = flags.filter(query);
	return (
		documents.length > 0 &&
		documents.every(
			({ value }) =>
				/^query=\s*query\b/.test(value) && !/mutation/i.test(value),
		) &&
		flags.every(
			({ name }) => READ_FLAGS.has(name) || name === "method" || isField(name),
		)
	);
}

const refusal = (what: string) =>
	`command-guard: \`gh api\` ${what} under the user's name — only GET and HEAD read. To read, name \`-X GET\`; to write, report what you would have sent and let them send it.`;
