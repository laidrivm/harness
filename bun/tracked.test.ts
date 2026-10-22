import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { uncomment } from "./scan.ts";
import { tracked } from "./tracked.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/**
 * A throwaway repository at `name` under a fresh temporary directory, holding
 * `files`, all tracked. Resolved through `realpathSync` because git reports the
 * root with the temporary directory's symlinks resolved.
 */
function fabricate(files: Record<string, string>, name = "repo"): string {
	const parent = mkdtempSync(join(tmpdir(), "tracked-"));
	made.push(parent);
	const dir = join(realpathSync(parent), name);
	mkdirSync(dir);
	git(dir, "init", "-b", "main");
	for (const [path, text] of Object.entries(files)) {
		const full = join(dir, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
	git(dir, "add", "-A");
	return dir;
}

function git(dir: string, ...args: string[]): void {
	const run = Bun.spawnSync(["git", ...args], { cwd: dir });
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
}

describe("the tracked-file sweep", () => {
	// spec: tracked-file-sweep/a-check-run-from-a-subdirectory
	test("run from a subdirectory it lists the whole repository from the root", () => {
		const dir = fabricate({ "a.ts": "", "src/b.ts": "", "src/deep/c.ts": "" });
		const { root, paths, files } = tracked(join(dir, "src"));
		expect(root).toBe(dir);
		expect(paths).toEqual(["a.ts", "src/b.ts", "src/deep/c.ts"]);
		expect(files).toEqual(paths);
	});

	// spec: tracked-file-sweep/a-tracked-file-absent-from-the-work-tree
	test("a deleted path, a symlink and a gitlink are paths but not files", () => {
		const dir = fabricate({ "kept.ts": "", "gone.ts": "" });
		rmSync(join(dir, "gone.ts"));
		symlinkSync(join(dir, "kept.ts"), join(dir, "link.ts"));
		git(dir, "add", "link.ts");
		// A gitlink needs no real submodule: the index entry is what git lists,
		// and the directory beside it is what a check would fail to read.
		mkdirSync(join(dir, "sub"));
		git(
			dir,
			"update-index",
			"--add",
			"--cacheinfo",
			`160000,${"1".repeat(40)},sub`,
		);
		const { paths, files } = tracked(dir);
		expect(paths).toEqual(["gone.ts", "kept.ts", "link.ts", "sub"]);
		expect(files).toEqual(["kept.ts"]);
	});

	// spec: tracked-file-sweep/a-repository-path-ending-in-a-space
	test("a root ending in a space keeps the space, and joins against it resolve", () => {
		const dir = fabricate({ "a.ts": "" }, "repo ");
		const { root, files } = tracked(dir);
		expect(root).toBe(dir);
		expect(root.endsWith(" ")).toBe(true);
		expect(files).toEqual(["a.ts"]);
		expect(existsSync(join(root, "a.ts"))).toBe(true);
	});

	test("a repository tracking nothing lists nothing and still names its root", () => {
		const dir = fabricate({});
		expect(tracked(dir)).toEqual({ root: dir, paths: [], files: [] });
	});

	test("a path with a newline in its name is one entry, unquoted", () => {
		const dir = fabricate({ "a\nb.ts": "" });
		expect(tracked(dir).files).toEqual(["a\nb.ts"]);
	});

	test("outside any repository it throws rather than listing nothing", () => {
		const parent = mkdtempSync(join(tmpdir(), "tracked-"));
		made.push(parent);
		expect(() => tracked(parent)).toThrow();
	});
});

/**
 * The tracked source files allowed a listing of git's index of their own, each
 * with why. Every other tracked source file is scanned. A query naming literal
 * paths enumerates nothing, but it trips this scan too: add it here, saying so.
 */
const OWN_LISTING: Record<string, string> = {
	"bun/tracked.ts": "the sweep itself",
	"bun/tracked.test.ts": "fabricates repositories, and holds the pattern below",
	"bun/check.ts":
		"lists one directory with `-s`, for the mode the sweep does not return",
	"bun/flake-watch.ts":
		"lists untracked files to fingerprint the tree, and the sweep reads tracked files only",
	"bun/repo-layout.test.ts":
		"enumerates a fabricated repository to build its expectation",
	"bun/spec-coverage-sweep.test.ts":
		"asks whether a fabricated repository tracks a directory",
};

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

// `ls-files` inside a quoted string on one line — a spawn argument or a
// `sh -c` command — or run through Bun's shell. Only `ls-files` lists the tree:
// `rev-parse --show-toplevel` alone yields the root, which a dozen files take
// without listing anything. Matched against the source with its comments
// blanked, so prose quoting the command is not a listing.
const LISTING = /["'][^"'\n]*\bls-files\b[^"'\n]*["']|\$`[^`]*\bls-files\b/;

/** Tracked source files outside `OWN_LISTING` that derive a listing. */
function ownListings(cwd: string): string[] {
	const { root, files } = tracked(cwd);
	return files.filter(
		(path) =>
			SOURCE.test(path) &&
			!(path in OWN_LISTING) &&
			LISTING.test(uncomment(readFileSync(join(root, path), "utf8"), "ts")),
	);
}

describe("one listing", () => {
	// spec: tracked-file-sweep/a-second-listing-is-introduced
	test("no tracked source file outside the exemptions lists the tree itself", () => {
		expect(ownListings(import.meta.dir)).toEqual([]);
	});

	test("a reintroduced listing fails, naming its file", () => {
		const dir = fabricate({
			"bun/tracked.ts": 'spawn(["git", "ls-files", "-z"]);',
			"bun/gate.ts": 'Bun.spawnSync(["git", "ls-files", "-z"]);',
			"bun/shell.ts": "await Bun.$`git ls-files -z`;",
			"bun/sh.ts": 'Bun.spawnSync(["sh", "-c", "git ls-files -z"]);',
			"bun/prose.ts": "// `git ls-files` run in a subdirectory lists less",
			"bun/quoted.ts": '// "git ls-files" is documented here\n/* \'ls-files -z\' */',
			"bun/root.ts": 'spawn(["git", "rev-parse", "--show-toplevel"]);',
		});
		expect(ownListings(dir)).toEqual([
			"bun/gate.ts",
			"bun/sh.ts",
			"bun/shell.ts",
		]);
	});

	test("every exemption still names a tracked file", () => {
		const { files } = tracked(import.meta.dir);
		for (const path of Object.keys(OWN_LISTING)) expect(files).toContain(path);
	});
});
