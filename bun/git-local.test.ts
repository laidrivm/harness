import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlocal } from "./git-local.ts";

test("drops every variable git names as local, keeps the rest, and leaves its argument whole", () => {
	const env = { GIT_DIR: "/r/.git", GIT_WORK_TREE: "/r", GIT_INDEX_FILE: "/r/i", GIT_EDITOR: "true", HOME: "/h" };
	expect(unlocal(env)).toEqual({ GIT_EDITOR: "true", HOME: "/h" });
	expect(Object.keys(env)).toHaveLength(5);
});

test("asks the git on the PATH it is given, though this process has one", () => {
	// The test-tmpdir preload removes the directory with the run's others.
	const PATH = mkdtempSync(join(tmpdir(), "git-local-path-"));
	expect(() => unlocal({ GIT_DIR: "/r/.git", PATH })).toThrow();
});
