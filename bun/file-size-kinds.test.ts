/**
 * What kind of file each tracked path is, and whether somebody has ruled on
 * that kind — the other half of `file-size.test.ts`, which asks how long a
 * file is rather than what it is.
 *
 * The two are apart because the caps enumerate what they cover, which
 * `CLAUDE.md` warns against, and this is what makes that safe: a type arriving
 * in the tree fails here until somebody decides whether it is capped.
 */
import { describe, expect, test } from "bun:test";

/**
 * What kind of file a path is, for the ruling below: its extension where it has
 * one, its own name where it has none. Read off the name rather than the path,
 * and answered with the whole name rather than an index — the last dot's index
 * over a path made a name carrying no dot report its final character
 * (`Dockerfile` ruling as `e`, joined in silence by every other extensionless
 * name) and a name under a dotted directory report the whole path.
 */
const extension = (path: string) => {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? name : name.slice(dot);
};

describe("what kind of file a path is", () => {
	test.each([
		["src/model.ts", ".ts"],
		[".env.example", ".example"],
		// No dot at all: the name, never its last character.
		["Dockerfile", "Dockerfile"],
		// A dot that opens the name rather than separating an extension.
		[".gitignore", ".gitignore"],
		// The only dot is in a directory: the path is not what is ruled on.
		[".github/workflows/deploy", "deploy"],
	])("%s is ruled as %s", (path, kind) => expect(extension(path)).toBe(kind));
});

describe("the extensions this repository carries", () => {
	test("a type nobody has ruled on cannot arrive unnoticed", () => {
		// The caps enumerate what they cover, which `CLAUDE.md` warns against.
		// Inverting it here would exempt eleven extensions to cap three, and
		// would newly cap `.sh`, `.py`, `.html` and `.txt` — types the proposal
		// declines to cap. The hazard the rule guards against is real all the
		// same: a new source extension would be capped by nothing and say
		// nothing about it. This is what says something. A type arriving in the
		// tree fails here until somebody decides whether it is capped.
		const root = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"])
			.stdout.toString()
			.replace(/\n$/, "");
		// Regular files only, by the mode the index records, as `oversize` reads
		// them: a symlink (`120000`) or a gitlink has no lines to cap, and the
		// skill links would otherwise each rule as a kind of its own name.
		const tracked = Bun.spawnSync(["git", "ls-files", "-s", "-z"], {
			cwd: root,
		})
			.stdout.toString()
			.split("\0")
			.filter((entry) => /^100(644|755) /.test(entry))
			.map((entry) => entry.slice(entry.indexOf("\t") + 1));
		const extensions = [...new Set(tracked.map(extension))].sort();
		// `.example` is ruled uncapped: an environment template is read by
		// variable name rather than by line, as `.json` and `.toml` are.
		// `.sql` is ruled uncapped on the same terms: a schema is read by table.
		// `Dockerfile` and `.dockerignore` are ruled uncapped for the reason
		// `.gitignore` is: one is read stage by stage and the others entry by
		// entry, and neither is a file a reader holds whole.
		expect(extensions).toEqual([
			".css",
			".dockerignore",
			".example",
			".gitignore",
			".html",
			".json",
			".lock",
			".md",
			".py",
			".sh",
			".sql",
			".toml",
			".ts",
			".tsx",
			".txt",
			".woff2",
			".yaml",
			".yml",
			"Dockerfile",
		]);
	});
});
