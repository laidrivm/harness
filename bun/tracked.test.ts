import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
});
