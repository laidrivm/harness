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
	// Untracked, so the scan never reads it: the consumer's empty allowlist —
	// unless the case tracks a manifest of its own, which this must not replace.
	write(dir, {
		...("package.json" in tracked ? {} : { "package.json": manifest({}) }),
		...untracked,
	});
	return dir;
}

/** A consumer manifest approving `counts`, keyed by `<path> <marker>`. */
function manifest(counts: Record<string, number>): string {
	const suppressions = Object.fromEntries(
		Object.entries(counts).map(([key, count]) => [key, { count, why: "x" }]),
	);
	return JSON.stringify({ harness: { suppressions } }, null, 2);
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
		// Read where they actually sit, which is the only place the exemption
		// names: both spell every marker out, so a miss here reports both.
		const paths = scan(import.meta.dir, {}).map(({ path }) => path);
		expect(paths).not.toContain("bun/no-suppressions.ts");
		expect(paths).not.toContain("bun/no-suppressions.test.ts");
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

describe("the root manifest", () => {
	// spec: commit-gates/the-allowlist-names-the-markers-it-approves
	test("its approval keys are not counted as suppressions", () => {
		const dir = fabricate({
			"package.json": manifest({ "src/model.ts biome-ignore": 1 }),
			"src/model.ts": "// biome-ignore lint/style/x: approved\n",
		});
		expect(at(scan(dir))).toEqual([]);
	});

	test("nor are they in a consumer approving both markers at several paths", () => {
		const files: Record<string, string> = {};
		const counts: Record<string, number> = {};
		for (const [name, marker] of [
			["a", "biome-ignore"],
			["b", "biome-ignore"],
			["c", "biome-ignore"],
			["d", "@ts-expect-error"],
			["e", "@ts-expect-error"],
		]) {
			files[`src/${name}.ts`] = `// ${marker}\n`;
			counts[`src/${name}.ts ${marker}`] = 1;
		}
		const dir = fabricate({ ...files, "package.json": manifest(counts) });
		expect(at(scan(dir))).toEqual([]);
	});

	test("run from a subdirectory it is still the root manifest that is skipped", () => {
		const dir = fabricate({
			"package.json": manifest({ "src/model.ts biome-ignore": 1 }),
			"src/model.ts": "// biome-ignore lint/style/x: approved\n",
		});
		expect(at(scan(join(dir, "src")))).toEqual([]);
	});

	test("an entry left approving the manifest itself fails nothing", () => {
		// What a consumer carries between re-pinning and removing the entry.
		const dir = fabricate({
			"package.json": manifest({ "package.json biome-ignore": 1 }),
		});
		expect(at(scan(dir))).toEqual([]);
	});

	test("a comment in it fails the command rather than passing", () => {
		// The skip holds only because the manifest cannot carry a comment.
		const dir = fabricate({
			"package.json": `${manifest({})}\n// biome-ignore x\n`,
		});
		const run = Bun.spawnSync(["bun", script], { cwd: dir, stderr: "pipe" });
		expect(run.exitCode).not.toBe(0);
		// Refused as JSON, not reported as a finding — either would exit non-zero.
		expect(run.stderr.toString()).toContain("JSON Parse error");
		expect(run.stderr.toString()).not.toContain("package.json:");
	});

	// spec: commit-gates/a-workspace-manifest-carries-a-marker
	test("a workspace manifest below the root is still scanned", () => {
		const dir = fabricate({
			"packages/web/package.json": `{ "description": "@ts-ignore" }\n`,
		});
		expect(at(scan(dir))).toEqual(["packages/web/package.json:1: @ts-ignore"]);
	});

	test("a root file whose name only ends in package.json is still scanned", () => {
		const dir = fabricate({ "my-package.json": `{ "a": "@ts-ignore" }\n` });
		expect(at(scan(dir))).toEqual(["my-package.json:1: @ts-ignore"]);
	});

	test("a root package.jsonc, which can hold a comment, is still scanned", () => {
		const dir = fabricate({ "package.jsonc": "{}\n// biome-ignore x\n" });
		expect(at(scan(dir))).toEqual(["package.jsonc:2: biome-ignore"]);
	});
});

describe("a tree the check cannot read straight through", () => {
	test("nothing is tracked", () => {
		expect(scan(fabricate({}))).toEqual([]);
	});

	test("run from a subdirectory it still reads the whole repository", () => {
		const dir = fabricate({
			"src/model.ts": "// @ts-ignore\n",
			"scripts/tool.ts": "const a = 1;\n",
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
