/**
 * The check run as a command: what it prints, what it exits with, and where it
 * resolves its report from.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, report } from "./mutation-floor.fixture.ts";

afterAll(cleanup);

/** The floor the fabricated consumer declares. */
const FLOOR = 3;

describe("the command line entry point", () => {
	const cli = (report: string | null) => {
		const dir = emptyDir("mutation-floor-cli-");
		// A consumer of our own, run from inside, so the check resolves this
		// report and this floor rather than any real repository's.
		Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({
				harness: {
					mutationFloor: {
						surviving: FLOOR,
						why: "measured",
					},
				},
			}),
		);
		if (report !== null) {
			mkdirSync(join(dir, "reports", "mutation"), { recursive: true });
			writeFileSync(join(dir, "reports", "mutation", "mutation.json"), report);
		}
		return Bun.spawnSync(["bun", join(import.meta.dir, "mutation-floor.ts")], {
			cwd: dir,
		});
	};

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
