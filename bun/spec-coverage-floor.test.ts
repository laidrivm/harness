/**
 * The number the check reports and what it demands of a change to it: the
 * floor, the reason its line must carry, and what an archived change owes.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fabricate, problems, spec } from "./spec-coverage.fixture.ts";
import { gauge, uncited } from "./spec-coverage.ts";

afterAll(cleanup);

// spec: spec-test-traceability/a-criterion-added-without-a-test
// spec: spec-test-traceability/a-criterion-newly-covered
describe("the count of uncited criteria against its floor", () => {
	const reasoned = "const FLOOR = 380; // first measurement";

	test("a count equal to the floor passes", () => {
		expect(gauge(380, 380, reasoned)).toEqual([]);
	});

	test("a count one above the floor fails", () => {
		expect(gauge(381, 380, reasoned).length).toBe(1);
	});

	test("a count one below the floor fails, naming the value to write", () => {
		expect(gauge(379, 380, reasoned).join("\n")).toContain("write 379");
	});

	test("either failure reports the count and the floor, not only that it failed", () => {
		for (const count of [381, 379]) {
			const said = gauge(count, 380, reasoned).join("\n");
			expect(said).toContain(String(count));
			expect(said).toContain("380");
		}
	});
});

// spec: spec-test-traceability/the-floor-changed-with-no-reason-given
describe("the floor's line carries a reason", () => {
	test("a line with no trailing comment fails", () => {
		expect(gauge(380, 380, "const FLOOR = 380;").length).toBe(1);
	});

	test("a trailing marker with no text after it is not a reason", () => {
		expect(gauge(380, 380, "const FLOOR = 380; //").length).toBe(1);
	});

	test("more markers are not a reason either", () => {
		// `\S` alone accepted `///`: the third slash is not whitespace. A
		// reason needs a character that is neither.
		expect(gauge(380, 380, "const FLOOR = 380; ///").length).toBe(1);
	});

	test("a reason that begins with a slash is still a reason", () => {
		expect(gauge(380, 380, "const FLOOR = 380; // /docs says why")).toEqual([]);
	});

	test("a trailing comment of whitespace alone is not a reason", () => {
		expect(gauge(380, 380, "const FLOOR = 380; //   ").length).toBe(1);
	});

	test("a quoted marker on the line is not a reason", () => {
		const quoted = 'const FLOOR = 380; const note = "// not a reason";';
		expect(gauge(380, 380, quoted).length).toBe(1);
	});

	test("the reason is demanded whichever direction the number moved", () => {
		for (const count of [379, 380, 381]) {
			expect(gauge(count, 380, "const FLOOR = 380;").join("\n")).toContain(
				"reason",
			);
		}
	});
});

// spec: spec-test-traceability/a-change-is-archived-with-its-tests-already-written
describe("a change is archived with its tests already written", () => {
	test("the count is unchanged, so no floor edit is needed", () => {
		const settled = ["A settled thing", "Another settled thing"];
		const added = ["A new thing", "Another new thing"];
		const dir = fabricate({
			"openspec/specs/capability/spec.md": spec(...settled),
			"openspec/changes/in-flight/specs/capability/spec.md": spec(...added),
			"src/thing.test.ts":
				'// spec: capability/a-new-thing capability/another-new-thing\ntest("acts", () => {});\n',
		});
		expect(uncited(dir)).toBe(2);

		// Archiving is two filesystem moves: the delta's criteria join the living
		// spec, and the change drops a directory deeper. Neither touches git,
		// because only the test files are listed from the index.
		writeFileSync(
			join(dir, "openspec/specs/capability/spec.md"),
			spec(...settled, ...added),
		);
		mkdirSync(join(dir, "openspec/changes/archive"), { recursive: true });
		renameSync(
			join(dir, "openspec/changes/in-flight"),
			join(dir, "openspec/changes/archive/2026-01-01-in-flight"),
		);

		expect(uncited(dir)).toBe(2);
		expect(problems(dir)).toEqual([]);
	});
});

describe("a change archived without its tests", () => {
	test("the count rises by one, so the floor has to move or the criterion be cited", () => {
		const dir = fabricate({
			"openspec/specs/capability/spec.md": spec("A settled thing"),
			"src/thing.test.ts": 'test("acts", () => {});\n',
		});
		const before = uncited(dir);

		writeFileSync(
			join(dir, "openspec/specs/capability/spec.md"),
			spec("A settled thing", "A thing nothing asserts"),
		);

		expect(uncited(dir)).toBe(before + 1);
		expect(gauge(uncited(dir), before, "const FLOOR = 1; // x").length).toBe(1);
	});
});

// spec: spec-test-traceability/a-criterion-admitted-as-untestable
describe("a criterion admitted as untestable", () => {
	test("the raised floor passes once its line carries the reason", () => {
		const raised =
			"const FLOOR = 381; // one criterion is discharged at review";
		expect(gauge(381, 381, raised)).toEqual([]);
	});
});
