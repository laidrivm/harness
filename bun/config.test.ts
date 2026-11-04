/**
 * What a gate does when the consumer's `package.json` leaves its value out:
 * fail, naming the key — never run on a default nobody chose; `reviewers`
 * alone reads its absence as none.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bumpTest, read, reviewers } from "./config.ts";
import { stray } from "./repo-layout.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A consumer repository whose manifest holds `harness`, tracked. */
function consumer(harness?: Record<string, unknown>): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-config-"));
	made.push(dir);
	writeFileSync(join(dir, "package.json"), JSON.stringify(harness === undefined ? {} : { harness }));
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
	return dir;
}

describe("reading a value", () => {
	test("a present key is returned as written", () => {
		const dir = consumer({ diffBudgetExclude: ["bun.lock"] });
		expect(read(dir, "diffBudgetExclude")).toEqual(["bun.lock"]);
	});

	test("the bump's test command is read, and its absence names it", () => {
		expect(read(consumer({ bumpTest: "bun test" }), "bumpTest")).toBe("bun test");
		expect(() => read(consumer({}), "bumpTest")).toThrow("harness.bumpTest");
	});

	test("the project's test command is returned, and an absent or blank one names the key [26]", () => {
		expect(bumpTest(consumer({ bumpTest: "bun test" }))).toBe("bun test");
		for (const harness of [{}, { bumpTest: "" }, { bumpTest: "   " }, { bumpTest: 1 }])
			expect(() => bumpTest(consumer(harness))).toThrow("harness.bumpTest");
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

describe("the reviewers finish waits for", () => {
	/** A directory with no `package.json` at all. */
	const bare = () => {
		const dir = mkdtempSync(join(tmpdir(), "harness-config-"));
		made.push(dir);
		return dir;
	};

	// spec: work-finish/a-project-naming-no-reviewer
	test("no file, no harness object, no key, null and an empty list each name none", () => {
		for (const dir of [bare(), consumer(), consumer({}), consumer({ reviewers: null }), consumer({ reviewers: [] })])
			expect(reviewers(dir)).toEqual([]);
	});

	test("a list naming CodeRabbit is returned as written", () => {
		expect(reviewers(consumer({ reviewers: ["CodeRabbit"] }))).toEqual(["CodeRabbit"]);
	});

	// spec: work-finish/a-package-file-that-is-not-json
	test("a file that is not JSON throws naming the file", () => {
		const dir = bare();
		writeFileSync(join(dir, "package.json"), "{");
		expect(() => reviewers(dir)).toThrow(join(dir, "package.json"));
	});

	// spec: work-finish/a-value-that-is-not-a-list
	test.each([
		["a string", "CodeRabbit"],
		["a list holding a number", [1]],
		["an object", { CodeRabbit: true }],
	])("%s throws naming harness.reviewers", (_, value) => {
		expect(() => reviewers(consumer({ reviewers: value }))).toThrow("harness.reviewers");
	});

	// spec: work-finish/a-reviewer-finish-does-not-know
	test("a name other than CodeRabbit throws naming it", () => {
		expect(() => reviewers(consumer({ reviewers: ["CodeRabbit", "Copilot"] }))).toThrow("Copilot");
	});

	test("an empty name is refused and shown quoted", () => {
		expect(() => reviewers(consumer({ reviewers: [""] }))).toThrow('names ""');
	});
});

describe("a gate whose value is absent", () => {
	test("the mutation floor fails naming harness.mutationFloor", () => {
		// The command a consumer runs, from inside the consumer.
		const run = Bun.spawnSync(["bun", join(import.meta.dir, "mutation-floor.ts")], {
			cwd: consumer({ rootFiles: {} }),
		});
		expect(run.exitCode).not.toBe(0);
		expect(run.stderr.toString()).toContain("harness.mutationFloor");
	});

	test("the root sweep fails naming harness.rootFiles", () => {
		expect(() => stray(consumer({ mutationFloor: {} }))).toThrow("harness.rootFiles");
	});
});
