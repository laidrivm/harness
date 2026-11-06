/**
 * The arithmetic: which mutant statuses count as surviving, what a report the
 * check cannot read does, and what the count owes the floor. The command line
 * is in `mutation-floor-cli.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { naming } from "./floor.fixture.ts";
import { cleanup, fabricate, report } from "./mutation-floor.fixture.ts";
import { gauge, loadReport, survivors } from "./mutation-floor.ts";

afterAll(cleanup);

describe("the survivor count", () => {
	test("a report with no mutants fails rather than counting zero", () => {
		expect(() => survivors(report())).toThrow(/no mutants/);
	});

	test("mutants that are all killed count zero", () => {
		expect(survivors(report("Killed", "Killed", "Killed"))).toBe(0);
	});

	test("one survivor among many killed counts one", () => {
		expect(survivors(report("Killed", "Survived", "Killed"))).toBe(1);
	});

	test("only the survivors are counted among every other status", () => {
		expect(survivors(report("Killed", "Survived", "Timeout", "Ignored", "CompileError", "RuntimeError"))).toBe(1);
	});

	test("a mutant no test covered counts as surviving", () => {
		expect(survivors(report("Killed", "NoCoverage"))).toBe(1);
	});

	test("two survivors on one line count as two", () => {
		expect(survivors(report("Survived", "Survived"))).toBe(2);
	});

	test("a status the check does not recognise fails, naming it", () => {
		expect(() => survivors(report("Killed", "Pending"))).toThrow(/Pending/);
	});

	test("a mutant carrying no status fails rather than counting as killed", () => {
		expect(() => survivors({ files: { "src/model.ts": { mutants: [{}] } } })).toThrow(/undefined/);
	});

	test("a report naming no file at all fails", () => {
		// What Stryker writes when `mutate` matches nothing — the wrong-scope
		// case, which zero survivors would report as a clean run.
		expect(() => survivors({ files: {} })).toThrow(/no mutants/);
	});

	test("a report of null file entries fails rather than counting zero", () => {
		expect(() => survivors({ files: { "src/model.ts": null } })).toThrow(/no mutants/);
	});

	test("a file entry with no mutants key contributes none", () => {
		const partial = {
			files: {
				"src/model.ts": { mutants: [{ status: "Survived" }] },
				"src/other.ts": {},
			},
		};
		expect(survivors(partial)).toBe(1);
	});

	test("survivors are counted across every file in the report", () => {
		const both = {
			files: {
				"src/model.ts": { mutants: [{ status: "Survived" }] },
				"src/other.ts": { mutants: [{ status: "Survived" }] },
			},
		};
		expect(survivors(both)).toBe(2);
	});
});

describe("loading the report", () => {
	test("a missing file fails rather than reading as zero survivors", () => {
		const absent = join(tmpdir(), "mutation-floor-absent", "mutation.json");
		expect(() => loadReport(absent)).toThrow(absent);
	});

	test("a truncated report fails, naming the file", () => {
		const file = fabricate('{"files":{"src/model.ts":{"mutants":[');
		expect(() => loadReport(file)).toThrow(file);
	});

	test("a report that is not an object fails, naming the file", () => {
		const file = fabricate("[]");
		expect(() => loadReport(file)).toThrow(file);
	});

	test("a well-formed report loads and counts", () => {
		const file = fabricate(JSON.stringify(report("Killed", "Survived")));
		expect(survivors(loadReport(file))).toBe(1);
	});
});

/** A reason the floor carries, which every case not about reasons gives. */
const why = "measured";

describe("the count against the floor", () => {
	test("a count equal to the floor passes", () => {
		expect(gauge(12, 12, why)).toEqual([]);
	});

	// spec: mutation-floor/a-survivor-no-test-reaches
	test("a survivor the per-test runner reads as NoCoverage leaves the count and the verdict where they were", () => {
		const [before, after] = [survivors(report("Killed", "Survived")), survivors(report("Killed", "NoCoverage"))];
		expect([before, after, gauge(after, 1, why)]).toEqual([1, 1, []]);
	});

	// spec: mutation-floor/a-branch-added-without-a-test
	test("a count above the floor fails", () => {
		expect(gauge(13, 12, why)).not.toEqual([]);
	});

	test("a count below the floor fails", () => {
		expect(gauge(11, 12, why)).not.toEqual([]);
	});

	test("a floor of zero with no survivors passes", () => {
		expect(gauge(0, 0, why)).toEqual([]);
	});

	test("the failure above the floor names both numbers and the way down", () => {
		expect(gauge(13, 12, why)).toEqual([
			"13 surviving mutants against a floor of 12 — kill one, or raise the floor and say why",
		]);
	});

	test("the failure below the floor names the value to write", () => {
		const [problem] = gauge(11, 12, why);
		expect(problem).toContain("write 11");
	});

	// spec: mutation-floor/a-survivor-newly-killed
	test("a survivor newly killed fails until the floor is lowered", () => {
		const before = report(...Array(5).fill("Survived"), "Killed");
		expect(survivors(before)).toBe(5);
		// The new test kills one: the same report with one status flipped.
		const after = report(...Array(4).fill("Survived"), "Killed", "Killed");
		expect(survivors(after)).toBe(4);
		expect(gauge(4, 5, why)).not.toEqual([]);
		expect(gauge(4, 4, why)).toEqual([]);
	});
});

// spec: mutation-floor/the-floor-changed-with-no-reason-given
describe("the floor changed with no reason given", () => {
	// The other shapes of an unreadable reason are `floor.test.ts`'s; these
	// pin the field this check names.
	test("an empty reason fails naming the field", () => {
		expect(gauge(12, 12, "")).toEqual(naming("mutationFloor", "why"));
	});

	test("a reason of whitespace alone fails, on a rise too", () => {
		expect(gauge(12, 12, "   ")).toEqual(naming("mutationFloor", "why"));
		expect(gauge(13, 12, "   ")[0]).toContain("harness.mutationFloor.why");
	});

	test("an absent reason fails naming the field, rather than throwing", () => {
		expect(gauge(12, 12, undefined)).toEqual(naming("mutationFloor", "why"));
	});
});

// spec: mutation-floor/a-floor-that-is-not-a-whole-number
describe("a floor that is not a whole number", () => {
	test("a floor written as a string fails naming the field", () => {
		expect(gauge(12, "12", why)).toEqual(naming("mutationFloor", "surviving"));
	});
});
