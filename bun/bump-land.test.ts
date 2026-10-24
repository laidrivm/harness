/**
 * The landing half of a consumer's bump, against a fixture whose `origin` is
 * a local bare repository. The install and sync are injected; the commit and
 * the push are real git.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { movePin } from "./bump-pin.ts";
import { land } from "./bump.ts";

const OLD = "eddf1fdd56642c48a3b222034ec6268c9b55971f";
const NEW = "9d321b61a74c70d4d3324d11e64fef488f2202a0";
const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const git = (dir: string, ...args: string[]) =>
	Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
		cwd: dir,
	})
		.stdout.toString()
		.trim();

const temp = () => {
	const dir = mkdtempSync(join(tmpdir(), "harness-bump-land-"));
	made.push(dir);
	return dir;
};

/** A bare `origin` holding one consumer commit, and a fresh clone of it. */
function consumer() {
	const origin = temp();
	git(origin, "init", "-q", "--bare", "-b", "main");
	const seed = temp();
	git(seed, "init", "-q", "-b", "main");
	writeFileSync(
		join(seed, "package.json"),
		`${JSON.stringify({ dependencies: { harness: `github:laidrivm/harness#${OLD}` } }, null, "\t")}\n`,
	);
	git(seed, "add", "-A");
	git(seed, "commit", "-qm", "consumer");
	git(seed, "push", "-q", origin, "main");
	const dir = temp();
	git(dir, "clone", "-q", origin, ".");
	return { origin, dir };
}

/** The tree `verify` would report for moving the pin in `dir`, left unstaged. */
function reported(dir: string): string {
	const file = join(dir, "package.json");
	const text = readFileSync(file, "utf8");
	writeFileSync(file, movePin(text, NEW));
	git(dir, "add", "package.json");
	const tree = git(dir, "write-tree");
	git(dir, "reset", "-q", "--hard");
	return tree;
}

function runner() {
	const calls: string[][] = [];
	return { calls, run: (argv: string[]) => (calls.push(argv), 0) };
}

describe("landing", () => {
	// spec: harness-updates/a-checked-bump-lands-on-main
	test("the reported tree commits once as github-actions[bot] and moves origin's main", () => {
		const { origin, dir } = consumer();
		const before = git(origin, "rev-parse", "main");
		const { run, calls } = runner();
		land(dir, NEW, reported(dir), { run });
		expect(git(origin, "rev-list", "--count", `${before}..main`)).toBe("1");
		expect(git(origin, "log", "-1", "--format=%s|%an", "main")).toBe(
			`Bump harness ${OLD.slice(0, 7)}..${NEW.slice(0, 7)}|github-actions[bot]`,
		);
		expect(calls[0]).toEqual(["bun", "install", "--ignore-scripts"]);
		expect(calls.map((argv) => argv.join(" "))).not.toContain(
			"bun node_modules/harness/bun/check.ts",
		);
	});

	test("an identity in the caller's environment does not change the bump's author", () => {
		const { origin, dir } = consumer();
		// A child process, since Bun hands a spawn the environment it started with, not a mutated process.env.
		const script = join(temp(), "land.ts");
		writeFileSync(
			script,
			`import { land } from ${JSON.stringify(join(import.meta.dir, "bump.ts"))};\nland(${JSON.stringify(dir)}, ${JSON.stringify(NEW)}, ${JSON.stringify(reported(dir))}, { run: () => 0 });\n`,
		);
		const other = "someone-else";
		const env = { ...process.env, GIT_AUTHOR_NAME: other, GIT_AUTHOR_EMAIL: other, GIT_COMMITTER_NAME: other, GIT_COMMITTER_EMAIL: other };
		expect(Bun.spawnSync(["bun", script], { env }).exitCode).toBe(0);
		expect(git(origin, "log", "-1", "--format=%an|%cn", "main")).toBe("github-actions[bot]|github-actions[bot]");
	});

	// spec: harness-updates/a-tree-that-differs-from-the-checked-one-is-not-pushed
	test("a reproduced tree that differs is refused and origin's main stays", () => {
		const { origin, dir } = consumer();
		const before = git(origin, "rev-parse", "main");
		const other = git(dir, "rev-parse", "HEAD^{tree}");
		expect(() => land(dir, NEW, other, runner())).toThrow("tree");
		expect(git(origin, "rev-parse", "main")).toBe(before);
	});

	test("an origin that moved after the checkout rejects the push", () => {
		const { origin, dir } = consumer();
		const tree = reported(dir);
		const elsewhere = temp();
		git(elsewhere, "clone", "-q", origin, ".");
		writeFileSync(join(elsewhere, "note.md"), "moved\n");
		git(elsewhere, "add", "-A");
		git(elsewhere, "commit", "-qm", "moved");
		git(elsewhere, "push", "-q", "origin", "main");
		const moved = git(origin, "rev-parse", "main");
		expect(() => land(dir, NEW, tree, runner())).toThrow("git push");
		expect(git(origin, "rev-parse", "main")).toBe(moved);
	});

	test.each(["install", "sync"])(
		"a failing %s throws naming it, with no commit and no push",
		(fail) => {
			const { origin, dir } = consumer();
			const before = git(origin, "rev-parse", "main");
			const tree = reported(dir);
			const run = (argv: string[]) =>
				(fail === "install" ? argv[1] === "install" : argv[1]?.endsWith("sync.ts"))
					? 1
					: 0;
			expect(() => land(dir, NEW, tree, { run })).toThrow(`at ${fail}`);
			expect(git(dir, "rev-parse", "HEAD")).toBe(before);
			expect(git(origin, "rev-parse", "main")).toBe(before);
		},
	);

	test("a tree that is not a full object id is refused before any call", () => {
		const { dir } = consumer();
		const { run, calls } = runner();
		expect(() => land(dir, NEW, "abc", { run })).toThrow("abc");
		expect(calls).toEqual([]);
	});
});
