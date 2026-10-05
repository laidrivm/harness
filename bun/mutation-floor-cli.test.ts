/**
 * The check run as a command: what it prints, what it exits with, and where it
 * resolves its report from.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	cleanup,
	emptyDir,
	modules,
	report,
} from "./mutation-floor.fixture.ts";
import { FLOOR } from "./mutation-floor.ts";

afterAll(cleanup);

describe("the command line entry point", () => {
	const cli = (
		report: string | null,
		files: Record<string, string> = { "src/model.ts": "const x = 1;\n" },
	) => {
		const dir = emptyDir("mutation-floor-cli-");
		// A copy of the check beside a tree of our own, so it resolves this
		// report and this model rather than the repository's real ones.
		mkdirSync(join(dir, "scripts"), { recursive: true });
		for (const [name, text] of Object.entries(modules))
			writeFileSync(join(dir, "scripts", name), text);
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(join(dir, dirname(path)), { recursive: true });
			writeFileSync(join(dir, path), text);
		}
		if (report !== null) {
			mkdirSync(join(dir, "reports", "mutation"), { recursive: true });
			writeFileSync(join(dir, "reports", "mutation", "mutation.json"), report);
		}
		return Bun.spawnSync(["bun", join(dir, "scripts", "mutation-floor.ts")]);
	};

	const holding = () =>
		JSON.stringify(report(...Array(FLOOR).fill("Survived"), "Killed"));

	test("it exits 0 and says nothing when the count equals the floor", () => {
		const run = cli(
			JSON.stringify(report(...Array(FLOOR).fill("Survived"), "Killed")),
		);
		expect(run.stderr.toString()).toBe("");
		expect(run.exitCode).toBe(0);
	});

	test("it exits 1 and names the gap on stderr when the count differs", () => {
		const run = cli(
			JSON.stringify(report(...Array(FLOOR + 1).fill("Survived"), "Killed")),
		);
		expect(run.stderr.toString()).toContain(String(FLOOR + 1));
		expect(run.stdout.toString()).toBe("");
		expect(run.exitCode).toBe(1);
	});

	test("it fails when the report is absent rather than passing", () => {
		const run = cli(null);
		expect(run.exitCode).not.toBe(0);
	});

	test("a malformed exemption in the model fails the check", () => {
		const run = cli(holding(), {
			"src/model.ts": "// Stryker disable next-line all\nconst x = 1;\n",
		});
		expect(run.stderr.toString()).toContain("all");
		expect(run.exitCode).toBe(1);
	});

	test("the same comment in another file does not fail it", () => {
		// The scan is scoped to the one file that is mutated; elsewhere the
		// comment means nothing to Stryker and so means nothing here.
		const run = cli(holding(), {
			"src/model.ts": "const x = 1;\n",
			"src/app/session.ts": "// Stryker disable next-line all\nconst y = 2;\n",
		});
		expect(run.stderr.toString()).toBe("");
		expect(run.exitCode).toBe(0);
	});

	test("it fails when the model is absent rather than passing", () => {
		const run = cli(holding(), {});
		expect(run.exitCode).not.toBe(0);
	});
});

describe("the check resolves its report from the repository root", () => {
	test("run from a subdirectory it names the same file", () => {
		const run = Bun.spawnSync(
			[
				"bun",
				"-e",
				`console.log((await import(${JSON.stringify(join(import.meta.dir, "mutation-floor.ts"))})).REPORT)`,
			],
			{ cwd: import.meta.dir },
		);
		// Derived here rather than taken from `./root.ts`, which is what the
		// code under test resolves through: an expectation reading that module
		// would move with a defect in it and report the same pass.
		expect(run.stdout.toString().trim()).toBe(
			join(import.meta.dir, "..", "reports", "mutation", "mutation.json"),
		);
	});
});
