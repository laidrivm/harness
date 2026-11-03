import { afterAll, describe, expect, test } from "bun:test";
import { realpathSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, fabricate, holding, manifest } from "./no-suppressions.fixture.ts";
import { allowlist, type Finding, scan } from "./no-suppressions.ts";

const script = `${import.meta.dir}/no-suppressions.ts`;

afterAll(cleanup);

const at = (found: Finding[]) => found.map(({ path, line, marker }) => `${path}:${line}: ${marker}`);

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
		expect(at(scan(dir)).sort()).toEqual(["src/app/session.tsx:2: @ts-expect-error", "src/model.ts:1: @ts-ignore"]);
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
		const dir = fabricate({ "src/model.ts": "const a = 1;\n" }, { "src/scratch.ts": `// @ts-ignore\n` });
		expect(scan(dir)).toEqual([]);
	});

	test("the check's own script and test pass", () => {
		// Read where they actually sit, which is the only place the exemption
		// names: both spell every marker out, so a miss here reports both. A
		// repository of our own whose work tree is the one above them, tracking
		// those two alone: in Stryker's sandbox, a plain directory inside the
		// real checkout, git would resolve past them to the real copies.
		// `realpathSync` because git prints the resolved path.
		const tree = realpathSync(join(import.meta.dir, ".."));
		const env = { ...process.env, GIT_DIR: join(emptyDir("no-suppressions-self-"), ".git"), GIT_WORK_TREE: tree };
		for (const args of [
			["init", "-q"],
			["add", "bun/no-suppressions.ts", "bun/no-suppressions.test.ts"],
		])
			expect(Bun.spawnSync(["git", ...args], { cwd: tree, env }).exitCode).toBe(0);
		const run = Bun.spawnSync(["bun", script], { cwd: tree, env, stderr: "pipe" });
		expect(run.stderr.toString()).toBe("");
		expect(run.exitCode).toBe(0);
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
		expect(at(scan(dir, approved))).toEqual(["src/model.ts:1: biome-ignore", "src/model.ts:3: biome-ignore"]);
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

// spec: commit-gates/an-allowlist-entry-the-check-cannot-read
describe("an allowlist entry the check cannot read", () => {
	const key = "src/model.ts biome-ignore";
	const field = (name: string) => `harness.suppressions["${key}"].${name}`;
	// Two occurrences, so a count read as NaN — which no length exceeds —
	// would approve them both rather than fail.
	const entry = (value: unknown) =>
		fabricate(
			{ "src/model.ts": "// biome-ignore a\n// biome-ignore b\n" },
			{ "package.json": holding({ [key]: value }) },
		);

	test.each([
		[{ count: "two", why: "x" }, "count"],
		[{ count: -1, why: "x" }, "count"],
		[{ count: 1.5, why: "x" }, "count"],
		[{ count: 2 }, "why"],
		[{ count: 2, why: " " }, "why"],
		[null, "count"],
	])("%j is named by its %s and approves nothing", (value, name) => {
		const dir = entry(value);
		expect(allowlist(dir).problems).toContainEqual(expect.stringContaining(field(name)));
		expect(at(scan(dir))).toEqual(["src/model.ts:1: biome-ignore", "src/model.ts:2: biome-ignore"]);
	});

	test("only the unreadable entry is named, and the readable one still approves", () => {
		const dir = fabricate(
			{
				"src/model.ts": "// biome-ignore a\n",
				"src/types.ts": "// biome-ignore b\n",
			},
			{
				"package.json": holding({
					[key]: { count: "two", why: "x" },
					"src/types.ts biome-ignore": { count: 1, why: "x" },
				}),
			},
		);
		expect(allowlist(dir).problems).toEqual([`${field("count")} is not a whole number`]);
		expect(at(scan(dir))).toEqual(["src/model.ts:1: biome-ignore"]);
	});

	test("an allowlist that is not an object is named as such", () => {
		const dir = fabricate({}, { "package.json": holding([]) });
		expect(allowlist(dir).problems).toEqual(["harness.suppressions is not an object of approvals"]);
	});

	test("the script fails on an unreadable entry with nothing else to report", () => {
		const manifest = holding({ [key]: { count: 0 } });
		const dir = fabricate({}, { "package.json": manifest });
		const run = Bun.spawnSync(["bun", script], { cwd: dir, stderr: "pipe" });
		expect(run.stderr.toString()).toContain(field("why"));
		expect(run.exitCode).toBe(1);
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
		expect(at(scan(join(dir, "scripts")))).toEqual(["src/model.ts:1: @ts-ignore"]);
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
		const dir = emptyDir("no-suppressions-bare-");
		expect(() => scan(dir)).toThrow();
	});
});
