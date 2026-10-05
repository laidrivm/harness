/**
 * Fails when a tracked source file is longer than a reader can hold at once:
 * 300 lines of `.ts` or `.tsx`, 200 of `.css`.
 *
 * The check ships as a test rather than a script, the shape
 * `spec-coverage.test.ts` uses: CI already runs `bun test` and so does the
 * pre-push hook, so it is blocking from its first commit with no workflow edit.
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
import { count, oversize } from "./file-size.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const write = (dir: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		const full = join(dir, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
};

/** A repository holding `tracked`, and `untracked` left out of the index. */
function fabricate(
	tracked: Record<string, string>,
	untracked: Record<string, string> = {},
): string {
	const dir = mkdtempSync(join(tmpdir(), "file-size-"));
	made.push(dir);
	const git = (...args: string[]) => {
		const run = Bun.spawnSync(["git", ...args], { cwd: dir });
		if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	};
	git("init", "-b", "main");
	write(dir, tracked);
	git("add", "-A");
	write(dir, untracked);
	return dir;
}

/** `n` lines, newline-terminated. */
const long = (n: number) =>
	`${Array.from({ length: n }, () => "x").join("\n")}\n`;

const paths = (dir: string) => oversize(dir).map((f) => f.path);

// spec: change-slicing/a-file-over-the-cap
describe("a file over the cap", () => {
	test("301 lines of TypeScript fails, naming the file, the count and the cap", () => {
		const dir = fabricate({ "src/a.ts": long(301) });
		expect(oversize(dir)).toEqual([{ path: "src/a.ts", count: 301, cap: 300 }]);
	});

	test("300 lines passes, the bound being inclusive", () => {
		expect(paths(fabricate({ "src/a.ts": long(300) }))).toEqual([]);
	});
});

// spec: change-slicing/a-stylesheet-over-the-cap
describe("a stylesheet over the cap", () => {
	test("201 lines fails", () => {
		const dir = fabricate({ "src/a.css": long(201) });
		expect(oversize(dir)).toEqual([
			{ path: "src/a.css", count: 201, cap: 200 },
		]);
	});

	test("200 lines passes", () => {
		expect(paths(fabricate({ "src/a.css": long(200) }))).toEqual([]);
	});
});

// spec: change-slicing/a-test-file-is-not-exempt
describe("what the cap covers", () => {
	test("a test file is not exempt", () => {
		expect(paths(fabricate({ "src/a.test.ts": long(301) }))).toEqual([
			"src/a.test.ts",
		]);
	});

	test("a .tsx file is capped like a .ts one", () => {
		expect(paths(fabricate({ "src/a.tsx": long(301) }))).toEqual(["src/a.tsx"]);
	});

	test("a .module.css file is capped at 200 like any stylesheet", () => {
		expect(paths(fabricate({ "src/a.module.css": long(201) }))).toEqual([
			"src/a.module.css",
		]);
	});

	test("the cap is chosen by extension, not one number for everything", () => {
		// 250 is over for a stylesheet and under for source, so a single
		// threshold cannot produce this pair.
		const dir = fabricate({ "src/a.css": long(250), "src/b.ts": long(250) });
		expect(paths(dir)).toEqual(["src/a.css"]);
	});

	test.each(["notes.md", "data.json", "config.yml"])(
		"%s is not capped at all, however long",
		(path) => {
			// A capped file beside it, under its cap: without one the sweep reads
			// nothing and refuses, which would prove the guard rather than this.
			expect(
				paths(fabricate({ [path]: long(400), "src/a.ts": long(10) })),
			).toEqual([]);
		},
	);

	test("an extension in capitals is capped all the same", () => {
		// `endsWith` is case-sensitive, so this was capped by nothing.
		expect(paths(fabricate({ "src/A.TS": long(301) }))).toEqual(["src/A.TS"]);
	});

	// spec: change-slicing/an-untracked-file-over-the-cap
	test("an untracked file is out of scope", () => {
		// It is present for its author and absent from a clone, so failing on
		// it would fail one machine and no other.
		const dir = fabricate(
			{ "src/a.ts": long(10) },
			{ "src/big.ts": long(400) },
		);
		expect(paths(dir)).toEqual([]);
	});
});

describe("counting a line", () => {
	test("a final line with no terminating newline still counts", () => {
		// `wc -l` counts newlines, so it reads this file as 300 and passes it.
		const dir = fabricate({ "src/a.ts": `${long(300).slice(0, -1)}\nx` });
		expect(oversize(dir)).toEqual([{ path: "src/a.ts", count: 301, cap: 300 }]);
	});

	test("a lone carriage return ends a line too", () => {
		// An editor shows a CR-terminated file as separate lines, so a count
		// that saw one line here would pass a file no reader could hold.
		const dir = fabricate({ "src/a.ts": long(301).replaceAll("\n", "\r") });
		expect(oversize(dir)).toEqual([{ path: "src/a.ts", count: 301, cap: 300 }]);
	});

	test("a CRLF ending is one line, not two", () => {
		const dir = fabricate({ "src/a.ts": long(301).replaceAll("\n", "\r\n") });
		expect(oversize(dir)).toEqual([{ path: "src/a.ts", count: 301, cap: 300 }]);
	});

	test.each([
		["", 0],
		["x", 1],
		["x\n", 1],
		["x\ny", 2],
		["x\ny\n", 2],
		["x\r\ny", 2],
		["x\ry\r", 2],
		["\n", 1],
	])("%o counts as %i", (text, n) => expect(count(text as string)).toBe(n));
});

describe("the sweep", () => {
	test("every file over the cap is reported, not only the first", () => {
		// A check stopping at the first turns a backlog into as many rounds as
		// it has files.
		const dir = fabricate({
			"src/a.ts": long(301),
			"src/b.ts": long(302),
			"src/c.css": long(201),
		});
		expect(paths(dir).sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.css"]);
	});

	test("a run that read no files at all fails rather than passing", () => {
		// Every assertion above is over a list, and an empty list satisfies all
		// of them.
		expect(() => oversize(fabricate({ "notes.md": "x\n" }))).toThrow(
			/no capped files/i,
		);
	});

	// spec: change-slicing/the-tree-as-it-stands
	test("this repository passes with nothing exempted", () => {
		expect(oversize()).toEqual([]);
	});
});

describe("the tree the sweep reads", () => {
	test("a tracked file absent from the work tree is skipped", () => {
		const dir = fabricate({ "src/a.ts": long(10), "src/gone.ts": long(400) });
		unlinkSync(join(dir, "src/gone.ts"));
		expect(paths(dir)).toEqual([]);
	});

	test("a tracked symlink is skipped, however long its target", () => {
		// `lstatSync` reads the link rather than following it, which is the
		// other thing `.isFile()` rejects besides an absent entry.
		const dir = fabricate({ "src/a.ts": long(10), "src/big.txt": long(400) });
		symlinkSync(join(dir, "src/big.txt"), join(dir, "src/link.ts"));
		// Unchecked, a staging failure would leave the link untracked and this
		// case would pass on the tracked file beside it having nothing wrong.
		const staged = Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
		expect(staged.exitCode).toBe(0);
		expect(paths(dir)).toEqual([]);
	});

	test("an empty tracked file counts zero rather than failing to be read", () => {
		expect(paths(fabricate({ "src/a.ts": "", "src/b.ts": long(10) }))).toEqual(
			[],
		);
	});

	test("run from a subdirectory it still reads the whole repository", () => {
		// `git ls-files` in a subdirectory lists only what is under it and
		// names it relative to it, so a check taking its listing at `cwd`
		// would miss everything above and resolve the rest to nothing.
		const dir = fabricate({ "src/a.ts": long(301), "scripts/b.ts": long(10) });
		expect(paths(join(dir, "scripts"))).toEqual(["src/a.ts"]);
	});
});
