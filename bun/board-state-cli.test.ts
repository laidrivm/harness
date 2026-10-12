/**
 * `board-state.ts` run as the command a session runs: the board it names from
 * the repository's `harness.board`, and the values it refuses to name one by.
 * What the tree derives is the other board-state files'; here is what the
 * command carries beside it, and what it never lets out of the process.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { cleanup, complete, fabricate } from "./board-state.fixture.ts";

afterAll(cleanup);

const script = join(import.meta.dir, "board-state.ts");

/**
 * A repository whose `package.json` holds `manifest` as written, beside one
 * complete change, run from inside. The environment carries only `PATH`, and
 * the fabricated directory holds no `.env` for bun to fill the rest from.
 */
function run(manifest: string, tree = complete("candidacy-gate")) {
	const dir = fabricate({ ...tree, "package.json": manifest });
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	const call = Bun.spawnSync(["bun", script], {
		cwd: dir,
		env: { PATH: process.env.PATH },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		out: call.stdout.toString(),
		err: call.stderr.toString(),
		// What git reports as the root, which is where the command reads from:
		// on macOS the temporary directory is a symlink into `/private`.
		file: join(realpathSync(dir), "package.json"),
	};
}

const naming = (board: unknown) => JSON.stringify({ harness: { board } });

// spec: task-board/the-key-is-absent
describe("a repository that names no board", () => {
	test("the key absent fails naming it and the file, and prints no statuses [1, 2]", () => {
		const { code, out, err, file } = run(JSON.stringify({ harness: {} }));
		expect(code).not.toBe(0);
		expect(err).toContain("harness.board");
		expect(err).toContain(file);
		expect(out).toBe("");
	});

	test("null fails the same way [3]", () => {
		const { code, out, err } = run(naming(null));
		expect(code).not.toBe(0);
		expect(err).toContain("harness.board");
		expect(out).toBe("");
	});

	test("a repository with no package.json fails naming the file", () => {
		const dir = fabricate(complete("candidacy-gate"));
		Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
		const call = Bun.spawnSync(["bun", script], {
			cwd: dir,
			env: { PATH: process.env.PATH },
		});
		expect(call.exitCode).not.toBe(0);
		expect(call.stderr.toString()).toContain(
			join(realpathSync(dir), "package.json"),
		);
		expect(call.stdout.toString()).toBe("");
	});

	test("a package.json that is not JSON fails naming the file [20]", () => {
		const { code, out, err, file } = run("{ harness: ");
		expect(code).not.toBe(0);
		expect(err).toContain(file);
		expect(out).toBe("");
	});
});

// spec: task-board/the-key-holds-no-name-at-all
describe("a key holding no name at all", () => {
	test.each([
		["an empty string [4]", ""],
		["whitespace only [5]", " \t "],
		["a number [19]", 7],
		["an array [19]", ["Harness"]],
		["an object [19]", { name: "Harness" }],
	])("%s fails naming the key", (_, board) => {
		const { code, out, err } = run(naming(board));
		expect(code).not.toBe(0);
		expect(err).toContain("harness.board");
		expect(out).toBe("");
	});
});

// spec: task-board/the-key-holds-an-identifier-rather-than-a-name
describe("a key holding an address rather than a name", () => {
	test.each([
		["a web URL [9]", "https://x"],
		["a collection URL [9]", "collection://x"],
		["a view URL [9]", "view://x"],
		["an upper-case hyphenated UUID [10]", "0123ABCD-4567-89EF-0123-456789ABCDEF"],
		["a UUID without hyphens [11]", "0123456789abcdef0123456789abcdef"],
		["a UUID inside a longer name [12]", "Harness-0123456789abcdef0123456789abcdef"],
	])("%s fails naming the key and echoes the value nowhere [18]", (_, board) => {
		const { code, out, err } = run(naming(board));
		expect(code).not.toBe(0);
		expect(err).toContain("harness.board");
		expect(err).not.toContain(board);
		expect(out).not.toContain(board);
	});
});

describe("a repository that names its board", () => {
	test("`Harness` is printed beside the change it derives [6]", () => {
		const { code, out } = run(naming("Harness"));
		expect(code).toBe(0);
		expect(JSON.parse(out)).toMatchObject({
			board: "Harness",
			status: { "candidacy-gate": "proposed" },
		});
	});

	test("the output names its own board once and neither of the other two [8]", () => {
		const { out } = run(naming("Harness"));
		expect(out.split("Harness").length - 1).toBe(1);
		expect(out).not.toContain("D2ASS");
		expect(out).not.toContain("mellon");
	});

	test("the output's keys are exactly board, status and edges [14]", () => {
		const { out } = run(naming("Harness"));
		expect(Object.keys(JSON.parse(out))).toEqual(["board", "status", "edges"]);
	});

	test("`D2ASS` is accepted [13]", () => {
		const { code, out } = run(naming("D2ASS"));
		expect(code).toBe(0);
		expect(JSON.parse(out).board).toBe("D2ASS");
	});

	test("an after: typo still fails with today's message, and no board is printed [21]", () => {
		const { code, out, err } = run(
			naming("Harness"),
			complete("candidacy-gate", "schema: spec-driven\nafter: [candidacy-gat]\n"),
		);
		expect(code).not.toBe(0);
		expect(err).toContain("after: names candidacy-gat");
		expect(out).toBe("");
	});
});
