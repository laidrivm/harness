/**
 * Where a file of each kind belongs: every tracked file at the repository root
 * has to be named here, with why it is at the root rather than under a
 * directory.
 *
 * Scoped by what it exempts rather than by the extensions it covers, which is
 * the opposite of `scripts/file-size.ts` and the direction `CLAUDE.md` asks
 * for. The two differ because a line cap and a placement decision fail
 * differently: a file type nobody has capped is merely unmeasured, where a file
 * type nobody has placed is already in the wrong directory. A scan admitting by
 * extension would pass in silence on the first `.mjs`, `.sql` or `.sh` nobody
 * thought of — which is how thirty-three files reached the root the first time.
 *
 * Adding a root file means adding its name and its reason here. That is the
 * friction, and it is the point: the line is the decision being taken rather
 * than defaulted.
 */
import { lstatSync } from "node:fs";
import { join } from "node:path";

/**
 * The other half of the same contract, and in the same module because the
 * capability is one: `stray` refuses a file placed outside the documented
 * directories, and what follows refuses a documented directory holding no
 * file. Neither is a statement about this repository — both answer for a tree
 * that does not exist yet, which is why their cases fabricate one.
 */
/** The heading the section is found under, and the only place it is written. */
export const HEADING = "## Where each kind of file lives";

/**
 * Every directory the layout section names, paired with whether its row marks
 * it reserved. The first backticked span of a row is the directory, the idiom
 * `readme-map.test.ts` already reads the ownership map with; the header and
 * separator rows carry none and drop out here.
 */
export function rows(
	markdown: string,
): { path: string | undefined; reserved: boolean }[] | undefined {
	// `undefined` where the heading is absent, distinct from a section that is
	// present and holds no row: the two fail for different reasons and the
	// heading is matched in one place rather than tested again by the caller.
	const section = markdown.match(
		new RegExp(`^${HEADING}$([\\s\\S]*?)(?=\\n#{1,2} |$(?![\\s\\S]))`, "m"),
	)?.[1];
	if (section === undefined) return undefined;
	return section
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.slice(2)
		.map((line) => ({
			// `undefined` rather than dropped: a row that stops naming a
			// directory is the table half-reshaped, and dropping it would leave
			// the check reading the rows that still parse and reporting nothing.
			path: line.split("|")[1]?.match(/`([^`]+)`/)?.[1],
			// The marker is read from the "Holds" cell alone, and only where the
			// cell opens with it: a directory whose path carries the word, or a
			// description using it for something else, would otherwise exempt its
			// own row from the tracking requirement with nobody deciding to.
			reserved: /^\s*reserved\b/i.test(line.split("|")[2] ?? ""),
		}));
}

/**
 * What the section gets wrong, read against a listing of tracked paths.
 *
 * Tracked rather than present on disk: git carries no empty directory, so a
 * directory that exists only in a working tree is absent from every clone —
 * the same reason the ownership map is checked this way.
 */
export function unbacked(markdown: string, tracked: string[]): string[] {
	const named = rows(markdown);
	if (named === undefined)
		return [`the README carries no "${HEADING}" section`];

	// A reshaped table satisfies every assertion made over its rows by having
	// none, which is the same vacuous pass as an absent heading by another
	// route.
	if (named.length === 0)
		return [`the "${HEADING}" section names no directory`];

	return named.flatMap(({ path, reserved }) => {
		if (path === undefined)
			return [`the "${HEADING}" section has a row naming no directory`];
		if (reserved) return [];
		const prefix = path.endsWith("/") ? path : `${path}/`;
		return tracked.some((file) => file.startsWith(prefix))
			? []
			: [`${path}: named in the layout section, tracking nothing`];
	});
}

/** Every tracked root file, and why it is at the root. */
export const EXEMPT: Record<string, string> = {
	"CLAUDE.md": "always-on agent rules, read at the start of every session",
	"README.md": "the front door, where a reader arrives before any directory",
	"index.html": "the bundler entry point `bun build ./index.html` expects here",
	"package.json": "the manifest bun resolves from the root and nowhere else",
	"bun.lock": "the lockfile bun writes beside the manifest",
	"bunfig.toml": "bun's own configuration, read from the root",
	"tsconfig.json": "the compiler reads it from the root of the project",
	"biome.json": "biome resolves its configuration from the root",
	"stryker.config.json": "stryker resolves its configuration from the root",
	"playwright.config.ts": "playwright resolves its configuration from the root",
	".coderabbit.yaml": "the review bot reads it from the repository root",
	".gitignore": "git reads it from the root, and it governs the whole tree",
	".env.example": "copied to `.env`, which tooling reads from the root",
	Dockerfile: "the build context's root is the directory holding it",
	".dockerignore": "read from the build context's root, beside the Dockerfile",
	"docker-compose.yml": "the deployment's project file, resolved from the root",
};

/**
 * Every tracked root file the list does not name, and every entry of the list
 * that names nothing real, in the repository containing `cwd`.
 *
 * The listing is taken at the repository root, never at `cwd`, the shape
 * `scripts/file-size.ts` uses: `git ls-files` run in a subdirectory reports
 * only what is under it and names it relative to it, so a check run from
 * `scripts/` would read that directory as though it were the root.
 */
export function stray(cwd?: string, exempt = EXEMPT): string[] {
	const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd });
	// git's own stderr: this knows only that the command failed, and a check
	// reporting that much sends its reader back to the command anyway.
	if (top.exitCode !== 0) throw new Error(top.stderr.toString());
	// Only the terminator git adds, not `trim()`: a repository whose path ends
	// in a space is unusual and not this check's to corrupt.
	const root = top.stdout.toString().replace(/\n$/, "");

	const ls = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
	if (ls.exitCode !== 0) throw new Error(ls.stderr.toString());

	const found: string[] = [];
	const seen = new Set<string>();
	// `-z` terminates rather than separates, so the last field is empty and
	// would otherwise resolve to the root itself and be read as a directory.
	for (const path of ls.stdout.toString().split("\0").filter(Boolean)) {
		if (path.includes("/")) continue;
		// Regular files only: the entry may be tracked but deleted from the work
		// tree, a symlink, or a submodule's gitlink, which reads as a directory.
		// git lists all three, and none of them is a file placed in the wrong
		// directory.
		if (!lstatSync(join(root, path), { throwIfNoEntry: false })?.isFile())
			continue;
		seen.add(path);
		// `hasOwn`, not `in`: every object inherits `toString`, `constructor`
		// and `valueOf`, so `in` would exempt a root file of any of those names
		// on a list that never mentioned it.
		if (Object.hasOwn(exempt, path)) continue;
		found.push(
			`${path}: at the repository root, and the exemption list does not name it`,
		);
	}

	// A sweep that matched nothing satisfies every assertion made over its
	// result, so it is an error rather than a clean root.
	if (seen.size === 0)
		throw new Error(`no tracked file at the root of ${root}`);

	for (const [path, reason] of Object.entries(exempt)) {
		if (!seen.has(path))
			// "tracks no such file" rather than "no longer tracks it": the entry
			// may also name something git lists but this skipped — a symlink, or
			// a path deleted from the work tree — and the two read the same here.
			found.push(`${path}: exempted, and the repository tracks no such file`);
		else if (reason.trim() === "")
			found.push(`${path}: exempted, and the entry carries no reason`);
	}

	return found;
}
