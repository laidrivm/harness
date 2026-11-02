import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { old } from "./transcript-archive-store.ts";

/**
 * The store's own reads, where a case cannot reach them through the hook or
 * the catch-up; those exercise the copy, lock, record and prune whole.
 */

const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe("old()", () => {
	// A concurrent export renames its `.tmp` or drops its `.lock` between prune's listing and this read.
	test("a path gone since it was listed is not old, rather than a throw that ends the prune", () => {
		const dir = mkdtempSync(join(tmpdir(), "transcript-store-"));
		made.push(dir);
		expect(old(join(dir, "gone.tmp"))).toBe(false);
	});
});
