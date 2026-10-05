import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Finding, scan } from "./no-suppressions.ts";
import { root } from "./root.ts";

const script = `${import.meta.dir}/no-suppressions.ts`;
const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function write(dir: string, files: Record<string, string>): void {
	for (const [path, text] of Object.entries(files)) {
		const full = join(dir, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
}

/** A throwaway repository holding `tracked`, plus `untracked` left unadded. */
function fabricate(
	tracked: Record<string, string>,
	untracked: Record<string, string> = {},
): string {
	const dir = mkdtempSync(join(tmpdir(), "no-suppressions-"));
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

const at = (found: Finding[]) =>
	found.map(({ path, line, marker }) => `${path}:${line}: ${marker}`);

describe("a suppression is added", () => {
	test("one is reported with its file and line", () => {
		const dir = fabricate({
			"src/model.ts": `const a = 1;\n// biome-ignore lint/suspicious/noExplicitAny: x\nconst b: any = a;\n`,
		});
		expect(at(scan(dir))).toEqual(["src/model.ts:2: biome-ignore"]);
	});

	test("two files are both reported", () => {
		const dir = fabricate({
			"src/model.ts": `// @ts-ignore\n`,
			"src/app/session.tsx": `const a = 1;\n// @ts-expect-error\n`,
		});
		expect(at(scan(dir)).sort()).toEqual([
			"src/app/session.tsx:2: @ts-expect-error",
			"src/model.ts:1: @ts-ignore",
		]);
	});

	test("a .json file is read too", () => {
		const dir = fabricate({ "tsconfig.json": `{}\n// biome-ignore x\n` });
		expect(at(scan(dir))).toEqual(["tsconfig.json:2: biome-ignore"]);
	});

	test("a source type nobody listed is read too", () => {
		const dir = fabricate({ "eslint.config.mjs": "// biome-ignore x\n" });
		expect(at(scan(dir))).toEqual(["eslint.config.mjs:1: biome-ignore"]);
	});

	test("two on one line are two occurrences", () => {
		const dir = fabricate({
			"src/model.ts": "/* biome-ignore a */ /* biome-ignore b */\n",
		});
		expect(at(scan(dir, { "src/model.ts biome-ignore": 1 }))).toEqual([
			"src/model.ts:1: biome-ignore",
			"src/model.ts:1: biome-ignore",
		]);
	});

	test("the command exits 1 and names the file and line", () => {
		const dir = fabricate({ "src/model.ts": `// @ts-ignore why\n` });
		const run = Bun.spawnSync(["bun", script], { cwd: dir, stderr: "pipe" });
		expect(run.exitCode).toBe(1);
		expect(run.stderr.toString()).toContain("src/model.ts:1:");
	});
});

describe("what the check does not read", () => {
	test("a document naming a marker passes", () => {
		const dir = fabricate({
			"docs/testing.md": `Never write biome-ignore here.\n`,
		});
		expect(scan(dir)).toEqual([]);
	});

	test("an untracked file passes", () => {
		const dir = fabricate(
			{ "src/model.ts": "const a = 1;\n" },
			{ "src/scratch.ts": `// @ts-ignore\n` },
		);
		expect(scan(dir)).toEqual([]);
	});

	test("the check's own script and test pass", () => {
		const dir = fabricate({
			"scripts/no-suppressions.ts": `// @ts-ignore biome-ignore\n`,
			"scripts/no-suppressions.test.ts": `// @ts-expect-error\n`,
		});
		expect(scan(dir)).toEqual([]);
	});
});

describe("the allowlist", () => {
	const approved = { "src/model.ts biome-ignore": 1 };

	test("admits the approved occurrence", () => {
		const dir = fabricate({
			"src/model.ts": `// biome-ignore lint/style/x: approved\n`,
		});
		expect(scan(dir, approved)).toEqual([]);
	});

	test("a second occurrence at the same path still fails", () => {
		const dir = fabricate({
			"src/model.ts": `// biome-ignore a\nconst a = 1;\n// biome-ignore b\n`,
		});
		expect(at(scan(dir, approved))).toEqual([
			"src/model.ts:1: biome-ignore",
			"src/model.ts:3: biome-ignore",
		]);
	});

	test("a marker swapped for another kind fails", () => {
		const dir = fabricate({ "src/model.ts": `// @ts-ignore\n` });
		expect(at(scan(dir, approved))).toEqual(["src/model.ts:1: @ts-ignore"]);
	});

	test("an entry for another path does not admit this one", () => {
		const dir = fabricate({
			"src/types.ts": `// biome-ignore lint/style/x: y\n`,
		});
		expect(at(scan(dir, approved))).toEqual(["src/types.ts:1: biome-ignore"]);
	});
});

describe("a tree the check cannot read straight through", () => {
	test("nothing is tracked", () => {
		expect(scan(fabricate({}))).toEqual([]);
	});

	test("run from a subdirectory it still reads the whole repository", () => {
		const dir = fabricate({
			"src/model.ts": "// @ts-ignore\n",
			"scripts/no-suppressions.ts": "// biome-ignore x\n",
		});
		expect(at(scan(join(dir, "scripts")))).toEqual([
			"src/model.ts:1: @ts-ignore",
		]);
	});

	test("a tracked symlink is skipped rather than followed", () => {
		const dir = fabricate({ "src/model.ts": "const a = 1;\n" });
		symlinkSync("src", join(dir, "link"));
		Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
		expect(scan(dir)).toEqual([]);
	});

	test("a tracked file deleted from the work tree is skipped", () => {
		const dir = fabricate({ "src/model.ts": "// @ts-ignore\n" });
		rmSync(join(dir, "src/model.ts"));
		expect(scan(dir)).toEqual([]);
	});

	test("outside a repository the check throws rather than passing", () => {
		const dir = mkdtempSync(join(tmpdir(), "no-suppressions-bare-"));
		made.push(dir);
		expect(() => scan(dir)).toThrow();
	});
});

describe("the repository as it stands", () => {
	test("passes with the empty allowlist", () => {
		expect(scan(root)).toEqual([]);
	});

	test("the command exits 0", () => {
		expect(Bun.spawnSync(["bun", script], { cwd: root }).exitCode).toBe(0);
	});
});
