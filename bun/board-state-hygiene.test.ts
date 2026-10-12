/**
 * What `board-state.ts` must not do: reach a network, name a board other than
 * the one its repository names, or let an identifier for private content into
 * its output. This repository is public and the boards are not.
 *
 * Beside `board-state.test.ts` rather than in it — the two together are over
 * the file cap — and the seam is the question each half answers: that one asks
 * what the tree derives, this one what the derivation may not carry out of it.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	archived,
	cleanup,
	complete,
	fabricate,
} from "./board-state.fixture.ts";
import { boardState } from "./board-state.ts";
import { root } from "./root.ts";

afterAll(cleanup);

/** What the command prints, run from inside `cwd` with nothing but `PATH`. */
const command = (cwd: string) =>
	Bun.spawnSync(["bun", join(import.meta.dir, "board-state.ts")], {
		cwd,
		env: { PATH: process.env.PATH },
	}).stdout.toString();

// spec: task-board/a-card-on-a-board-whose-tree-is-elsewhere
describe("the output names no board", () => {
	test("neither the board a slug sits on nor the two whose trees are elsewhere", () => {
		const state = boardState(fabricate(complete("candidacy-gate")));
		for (const board of ["D2ASS", "Harness", "mellon"])
			expect(JSON.stringify(state)).not.toContain(board);
	});

	test("the command names the board its package.json names, and no other [15]", () => {
		const tree = fabricate(complete("candidacy-gate"));
		writeFileSync(
			join(tree, "package.json"),
			JSON.stringify({ harness: { board: "Harness" } }),
		);
		Bun.spawnSync(["git", "init", "-q"], { cwd: tree });
		const out = command(tree);
		expect(out).toContain('"Harness"');
		for (const board of ["D2ASS", "mellon"]) expect(out).not.toContain(board);
	});
});

// spec: task-board/the-harness-reads-its-own-board
test("the command run in this repository names `Harness` [7]", () => {
	expect(JSON.parse(command(import.meta.dir)).board).toBe("Harness");
});

// spec: task-board/the-derivation-reaches-no-network
describe("the derivation reaches no network", () => {
	// Read inside each case rather than here: a throw while this block is
	// collected takes its cases out of the run entirely, and bun reports the
	// smaller number as a pass — so renaming the module would silence the
	// cases that guard it instead of failing them.
	const source = () =>
		readFileSync(join(import.meta.dir, "board-state.ts"), "utf8");

	// Bun's own transpiler rather than a pattern over the source: it reports a
	// bare `import "node:net";`, a wrapped import list and a dynamic
	// `import()` alike, and every one of those is a module a pattern anchored
	// to one line would read as no import at all — which is the one direction
	// this case must not miss.
	const imports = (text: string) =>
		new Bun.Transpiler({ loader: "ts" }).scan(text).imports.map((i) => i.path);

	test("the module imports the filesystem, the path join, the root, the config and nothing else", () => {
		const imported = imports(source());
		expect(imported.length).toBeGreaterThan(0);
		expect(
			imported.filter(
				(from) =>
					!["node:fs", "node:path", "./root.ts", "./config.ts"].includes(from),
			),
		).toEqual([]);
	});

	// Allowing a module above allows whatever it allows, and the case above
	// would pass a version of either that had grown a fetch.
	test.each([
		// Nothing at all: it asks git for the root, a local process.
		["root.ts", []],
		// The manifest it reads the key from, and nothing else [16].
		["config.ts", ["node:fs", "node:path"]],
	])("the module it imports, %s, reaches nothing either", (name, allowed) => {
		const from = readFileSync(join(import.meta.dir, name), "utf8");
		expect(imports(from).filter((i) => !allowed.includes(i))).toEqual([]);
	});

	test("it calls nothing that opens a socket", () => {
		// Token by token rather than by parse: a mention in prose would fail this
		// case wrongly, and the repair is to reword the comment. The direction
		// that passes wrongly is the one a parser would be bought to prevent.
		for (const reach of [
			/\bfetch\s*\(/,
			/XMLHttpRequest/,
			/Bun\s*\.\s*connect/,
			/notion/i,
		])
			expect(source()).not.toMatch(reach);
	});

	test("a full run produces both halves of the output from the tree alone", () => {
		const tree = fabricate({
			...complete(
				"score-calibration",
				"schema: spec-driven\nafter: [outcome-calibration]\n",
			),
			...archived("2026-08-25", "outcome-calibration"),
		});
		expect(boardState(tree)).toEqual({
			status: {
				"score-calibration": "proposed",
				"outcome-calibration": "done",
			},
			edges: {
				"score-calibration": { after: ["outcome-calibration"], blocking: [] },
			},
		});
	});
});

describe("what may not reach the output, this repository being public", () => {
	test("no option identifier, board URL, view URL or bare UUID", () => {
		const emitted = JSON.stringify(boardState(root));
		for (const secret of [
			"collectionPropertyOption://",
			"collection://",
			"view://",
			"notion.so",
			"notion.com",
		])
			expect(emitted).not.toContain(secret);
		expect(emitted).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i);
	});
});
