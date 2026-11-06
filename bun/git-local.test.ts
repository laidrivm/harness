import { expect, test } from "bun:test";
import { unlocal } from "./git-local.ts";

test("drops every variable git names as local, keeps the rest, and leaves its argument whole", () => {
	const env = { GIT_DIR: "/r/.git", GIT_WORK_TREE: "/r", GIT_INDEX_FILE: "/r/i", GIT_EDITOR: "true", HOME: "/h" };
	expect(unlocal(env)).toEqual({ GIT_EDITOR: "true", HOME: "/h" });
	expect(Object.keys(env)).toHaveLength(5);
});
