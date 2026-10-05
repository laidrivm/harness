/**
 * Fails when a tracked file sits at the repository root without the exemption
 * list naming it, and when the list itself names nothing real.
 *
 * The check ships as a test rather than a script, the shape `file-size.test.ts`
 * uses: CI already runs `bun test` and so does the pre-push hook, so it is
 * blocking from its first commit with no workflow edit.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { HEADING, stray, unbacked } from "./repo-layout.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway directory with no repository in it. */
function bare(): string {
	const dir = mkdtempSync(join(tmpdir(), "repo-layout-"));
	made.push(dir);
	return dir;
}

/** A throwaway repository holding `files`, all tracked. */
function fabricate(files: Record<string, string>): string {
	const dir = bare();
	const git = (...args: string[]) => {
		const run = Bun.spawnSync(["git", ...args], { cwd: dir });
		if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	};
	git("init", "-b", "main");
	for (const [path, text] of Object.entries(files)) {
		const full = join(dir, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
	git("add", "-A");
	return dir;
}

/** The tracked paths of a repository, named from its root. */
function listing(dir: string): string[] {
	const ls = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: dir });
	if (ls.exitCode !== 0) throw new Error(ls.stderr.toString());
	return ls.stdout.toString().split("\0").filter(Boolean);
}

/** One exempted root file, so no case below trips the could-not-measure guard. */
const KEEP = { "README.md": "the front door" };

// spec: repo-layout/a-source-file-added-to-the-root
describe("a file added to the repository root", () => {
	test("a root the list names entirely reports nothing [1]", () => {
		const dir = fabricate({ "README.md": "", "package.json": "{}" });
		expect(stray(dir, { ...KEEP, "package.json": "the manifest" })).toEqual([]);
	});

	test("an unexempted file is reported, naming it and the list [3]", () => {
		const dir = fabricate({ ...KEEP, "server.ts": "" });
		const found = stray(dir, KEEP);

		expect(found).toHaveLength(1);
		expect(found[0]).toContain("server.ts");
		// The reason as well as the path: "server.ts" alone reads as a file the
		// check dislikes rather than as a decision nobody has recorded.
		expect(found[0]).toMatch(/exemption list/i);
	});

	test("two unexempted files are both reported [4]", () => {
		const dir = fabricate({ ...KEEP, "a.ts": "", "b.sql": "" });
		expect(stray(dir, KEEP).join("\n")).toMatch(/a\.ts[\s\S]*b\.sql/);
	});

	// spec: repo-layout/a-file-type-the-list-has-never-seen
	test("an extension no exemption names is refused, not ignored [3]", () => {
		// The whole reason this scan is scoped by what it exempts: an admission
		// list of extensions passes silently on the first type nobody thought of.
		const dir = fabricate({ ...KEEP, "compose.yaml": "", "run.sh": "" });
		expect(stray(dir, KEEP)).toHaveLength(2);
	});

	test("a root dotfile is subject to the list like any other [7]", () => {
		// A leading dot is no implicit pass: `.env.example` is at the root by a
		// decision, and the list is where that decision is written down.
		const dir = fabricate({ ...KEEP, ".env.example": "" });
		expect(stray(dir, KEEP).join("")).toContain(".env.example");
	});

	test("a file named after an inherited property is not exempted by it", () => {
		// Every object answers to `toString`, `constructor` and `valueOf`, so a
		// membership test written with `in` would pass these three on a list
		// that never mentioned them.
		const dir = fabricate({
			...KEEP,
			toString: "",
			constructor: "",
			valueOf: "",
		});
		expect(stray(dir, KEEP)).toHaveLength(3);
	});
});

// spec: repo-layout/a-file-under-a-directory
describe("a file under a directory", () => {
	test("one directory down is not the root's business [6]", () => {
		const dir = fabricate({ ...KEEP, "src/job/db.ts": "", "checks/a.ts": "" });
		expect(stray(dir, KEEP)).toEqual([]);
	});
});

describe("the exemption list itself", () => {
	// spec: repo-layout/an-exemption-naming-a-file-that-is-gone
	test("an entry naming a path nothing tracks fails [8]", () => {
		const dir = fabricate(KEEP);
		const found = stray(dir, { ...KEEP, "server.ts": "moved to src/server/" });

		expect(found).toHaveLength(1);
		expect(found[0]).toContain("server.ts");
		expect(found[0]).toMatch(/tracks no such file/i);
	});

	// spec: repo-layout/an-exemption-carrying-no-reason
	test("an entry whose reason is empty is refused [9]", () => {
		const dir = fabricate({ ...KEEP, "package.json": "{}" });
		const found = stray(dir, { ...KEEP, "package.json": "  " });

		expect(found).toHaveLength(1);
		expect(found[0]).toContain("package.json");
		expect(found[0]).toMatch(/reason/i);
	});
});

// spec: repo-layout/a-tree-the-check-could-not-read
describe("a tree the check could not read", () => {
	test("a scan that matched no root file at all fails [2]", () => {
		// Not an empty result: every assertion made over a tree nobody read is
		// satisfied by it, so a clean root and an unread one must not agree.
		const dir = fabricate({ "src/a.ts": "" });
		expect(() => stray(dir, KEEP)).toThrow(/no tracked file/i);
	});

	test("git exiting non-zero fails with git's own stderr [13]", () => {
		// The check knows only that the command failed; the command knows why.
		expect(() => stray(bare(), KEEP)).toThrow(/not a git repository/i);
	});
});

describe("the tree the sweep reads", () => {
	// spec: repo-layout/a-root-entry-that-is-not-a-regular-file
	test("a tracked root entry absent from the work tree is skipped [11]", () => {
		const dir = fabricate({ ...KEEP, "gone.ts": "" });
		unlinkSync(join(dir, "gone.ts"));
		expect(stray(dir, KEEP)).toEqual([]);
	});

	test("a tracked root symlink is skipped, not read as a file [12]", () => {
		// `lstatSync` reads the link rather than following it, which is the
		// other thing `.isFile()` rejects besides an absent entry.
		const dir = fabricate({ ...KEEP, "src/real.ts": "" });
		symlinkSync(join(dir, "src/real.ts"), join(dir, "link.ts"));
		// Unchecked, a staging failure would leave the link untracked and this
		// case would pass on there being nothing at the root to report.
		const staged = Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
		expect(staged.exitCode).toBe(0);

		expect(stray(dir, KEEP)).toEqual([]);
	});

	// spec: repo-layout/a-check-run-from-a-subdirectory
	test("run from below the root it still reads the whole repository [10]", () => {
		const dir = fabricate({ ...KEEP, "server.ts": "", "src/a.ts": "" });
		expect(stray(join(dir, "src"), KEEP).join("")).toContain("server.ts");
	});

	// spec: repo-layout/the-repository-as-it-stands
	test("this repository's root is named entirely by the list [14]", () => {
		expect(stray()).toEqual([]);
	});
});

/** A layout section holding one row per argument. */
const section = (...cells: string[]) =>
	`# A readme\n\n${HEADING}\n\n| Directory | Holds |\n|---|---|\n${cells
		.map((cell) => `| ${cell} |\n`)
		.join("")}`;

// spec: repo-layout/the-section-is-absent
describe("a README with no layout section", () => {
	test("fails rather than passing over an absent heading [15]", () => {
		// The vacuous pass a section-scoped scan gives when its heading is
		// renamed: no section, no rows, nothing to contradict.
		expect(unbacked("# A readme\n\n## Something else\n", [])).toHaveLength(1);
	});
});

// spec: repo-layout/the-section-names-no-directory
describe("a layout section naming no directory", () => {
	test("fails rather than passing on having no rows [16]", () => {
		const empty = `# A readme\n\n${HEADING}\n\nprose, no table\n`;
		expect(unbacked(empty, ["src/app/a.ts"])).toHaveLength(1);
	});
});

// spec: repo-layout/a-directory-the-section-names
// spec: task-board/the-directory-s-row-in-the-ownership-map
describe("a directory the section names", () => {
	test("passes where the repository tracks a file under it [17]", () => {
		const dir = fabricate({ "src/app/a.ts": "" });
		expect(unbacked(section("`src/app/` | the client"), listing(dir))).toEqual(
			[],
		);
	});

	test("fails where it tracks nothing, naming the directory [19]", () => {
		const dir = fabricate({ "src/app/a.ts": "" });
		const found = unbacked(section("`src/job/` | the job"), listing(dir));

		expect(found).toHaveLength(1);
		expect(found[0]).toContain("src/job/");
	});

	test("a directory on disk but tracked by nothing does not satisfy it [20]", () => {
		// git carries no empty directory, so this is the mechanism rather than a
		// contrivance: the row is satisfied in the author's working tree and in
		// no clone.
		const dir = fabricate({ "src/app/a.ts": "" });
		mkdirSync(join(dir, "src/job"), { recursive: true });

		expect(
			unbacked(section("`src/job/` | the job"), listing(dir)),
		).toHaveLength(1);
	});

	test("a row that stops naming a directory fails rather than dropping out", () => {
		// The table half-reshaped: one row keeps its path and one loses it. A
		// scan that dropped the second would report nothing and read as though
		// the section were still whole.
		const dir = fabricate({ "src/app/a.ts": "" });
		const half = section("`src/app/` | the client", "src/job/ | the job");

		expect(unbacked(half, listing(dir))).toHaveLength(1);
	});

	test("a prefix match is on the directory, not on the name [19]", () => {
		// `src/job/` must not be satisfied by `src/jobs-notes.md`, which shares
		// its first seven characters and lives somewhere else entirely.
		const dir = fabricate({ "src/jobs-notes.md": "" });
		expect(
			unbacked(section("`src/job/` | the job"), listing(dir)),
		).toHaveLength(1);
	});
});

// spec: repo-layout/a-directory-reserved-for-later-work
describe("a directory reserved for later work", () => {
	test("is not required to exist [18]", () => {
		const dir = fabricate({ "src/app/a.ts": "" });
		const reserved = section(
			"`src/job/build/` | reserved for `snapshot-build`",
		);

		expect(unbacked(reserved, listing(dir))).toEqual([]);
	});
});
