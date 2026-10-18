/**
 * The tracked-file sweep every check that reads the tree takes its listing
 * from. A caller applies its own filter to the result; the listing itself is
 * never derived a second time.
 */
import { lstatSync } from "node:fs";
import { join } from "node:path";

export type Tracked = {
	/** The repository root containing `cwd`. */
	root: string;
	/** Every tracked path, relative to `root`, in git's order. */
	paths: string[];
	/** Those of `paths` the filesystem reports as regular files. */
	files: string[];
};

/** The repository containing `cwd`, and what git tracks in it. */
export function tracked(cwd?: string): Tracked {
	const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd });
	if (top.exitCode !== 0) throw new Error(top.stderr.toString());
	// Only the terminator git adds, not `trim()`: a repository whose path ends
	// in a space is unusual and not a check's to corrupt.
	const root = top.stdout.toString().replace(/\n$/, "");

	// At the root, never at `cwd`: `git ls-files` run in a subdirectory reports
	// only what is under it and names it relative to it, so a check run from
	// there would scope itself to that directory and say nothing about it.
	const ls = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
	if (ls.exitCode !== 0) throw new Error(ls.stderr.toString());
	// `-z` terminates rather than separates, so the last field is empty and
	// would otherwise resolve to the root itself and be read as a directory.
	const paths = ls.stdout.toString().split("\0").filter(Boolean);

	// The view a caller that opens what it lists takes: a tracked path may be
	// deleted from the work tree, a symlink, or a submodule's gitlink, which
	// reads as a directory, and none of the three is a file to open. A caller
	// ruling on paths alone takes `paths`, where all three still stand.
	const files = paths.filter((path) =>
		lstatSync(join(root, path), { throwIfNoEntry: false })?.isFile(),
	);

	return { root, paths, files };
}
