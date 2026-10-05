/**
 * What a gate does when the consumer's `package.json` leaves its value out:
 * fail, naming the key — never run on a default nobody chose.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { read } from "./config.ts";
import { stray } from "./repo-layout.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A consumer repository whose manifest holds `harness`, tracked. */
function consumer(harness?: Record<string, unknown>): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-config-"));
	made.push(dir);
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify(harness === undefined ? {} : { harness }),
	);
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
	return dir;
}

describe("reading a value", () => {
	test("a present key is returned as written", () => {
		const dir = consumer({ diffBudgetExclude: ["bun.lock"] });
		expect(read(dir, "diffBudgetExclude")).toEqual(["bun.lock"]);
	});

	test("a manifest with no harness object names the key it lacks", () => {
		expect(() => read(consumer(), "rootFiles")).toThrow("harness.rootFiles");
	});

	test("a key set to null names that key", () => {
		const dir = consumer({ rootFiles: null });
		expect(() => read(dir, "rootFiles")).toThrow("harness.rootFiles");
	});

	test("a harness object without the key names that key", () => {
		const dir = consumer({ rootFiles: {} });
		expect(() => read(dir, "suppressions")).toThrow("harness.suppressions");
	});
});

describe("a gate whose value is absent", () => {
	test("the mutation floor fails naming harness.mutationFloor", () => {
		// The command a consumer runs, from inside the consumer.
		const run = Bun.spawnSync(
			["bun", join(import.meta.dir, "mutation-floor.ts")],
			{ cwd: consumer({ rootFiles: {} }) },
		);
		expect(run.exitCode).not.toBe(0);
		expect(run.stderr.toString()).toContain("harness.mutationFloor");
	});

	test("the root sweep fails naming harness.rootFiles", () => {
		expect(() => stray(consumer({ mutationFloor: {} }))).toThrow(
			"harness.rootFiles",
		);
	});
});
