/**
 * How a citation is read: what counts as one, which call it attaches to, and
 * which criterion its identifier resolves to. What the sweep counts is in
 * `spec-coverage-sweep.test.ts`, and the floor in
 * `spec-coverage-floor.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { root } from "./root.ts";
import {
	cited,
	cleanup,
	fabricate,
	ids,
	problems,
	spec,
	world,
} from "./spec-coverage.fixture.ts";
import { check } from "./spec-coverage.ts";
import { counted } from "./spec-criteria.ts";

afterAll(cleanup);

// spec: spec-test-traceability/an-identifier-is-derived-from-a-heading
describe("an identifier is derived from a heading", () => {
	test("a heading becomes its capability and slug", () => {
		const dir = fabricate({
			"openspec/specs/draft-session/spec.md": spec(
				"Board is not an active context",
			),
		});
		expect(ids(counted(dir))).toEqual([
			"draft-session/board-is-not-an-active-context",
		]);
	});

	test("punctuation and a section mark collapse to single hyphens", () => {
		expect(ids(counted(root))).toContain(
			"draft-model/insufficient-hero-picked-model-spec-7-5",
		);
	});

	test("a spec with no scenario heading yields no criteria", () => {
		const dir = fabricate({
			"openspec/specs/empty/spec.md": "# capability\n\nProse only.\n",
		});
		expect(counted(dir)).toEqual([]);
	});

	test("a scenario heading inside a fenced block is not a criterion", () => {
		const dir = fabricate({
			"openspec/specs/fenced/spec.md": `${spec("A real one")}\n\`\`\`md\n#### Scenario: An illustrated one\n\`\`\`\n`,
		});
		expect(ids(counted(dir))).toEqual(["fenced/a-real-one"]);
	});
});

// spec: spec-test-traceability/a-test-cites-one-criterion
describe("a test cites one criterion", () => {
	test("a citation above a test call marks its criterion", () => {
		const dir = world(
			'// spec: capability/a-first-thing\ntest("acts", () => {});\n',
			"A first thing",
			"A second thing",
		);
		expect(cited(dir)).toEqual(["capability/a-first-thing"]);
		expect(problems(dir)).toEqual([]);
	});

	test("a citation above a test.each call counts", () => {
		const dir = world(
			'// spec: capability/a-first-thing\ntest.each([1])("acts %i", () => {});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual(["capability/a-first-thing"]);
		expect(problems(dir)).toEqual([]);
	});

	test("blank lines between the comment and the call do not break it", () => {
		const dir = world(
			'// spec: capability/a-first-thing\n\n\ndescribe("acts", () => {});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual(["capability/a-first-thing"]);
		expect(problems(dir)).toEqual([]);
	});
});

// spec: spec-test-traceability/one-act-closes-several-criteria
describe("one act closes several criteria", () => {
	test("two identifiers on one line both count", () => {
		const dir = world(
			'// spec: capability/a-first-thing capability/a-second-thing\nit("acts", () => {});\n',
			"A first thing",
			"A second thing",
		);
		expect(cited(dir)).toEqual([
			"capability/a-first-thing",
			"capability/a-second-thing",
		]);
	});

	test("identifiers on consecutive comment lines all count", () => {
		const dir = world(
			'// spec: capability/a-first-thing\n//       capability/a-second-thing\ntest("acts", () => {});\n',
			"A first thing",
			"A second thing",
		);
		expect(cited(dir)).toEqual([
			"capability/a-first-thing",
			"capability/a-second-thing",
		]);
	});
});

// spec: spec-test-traceability/one-criterion-needs-several-tests
describe("one criterion needs several tests", () => {
	test("five tests citing one leave one criterion cited", () => {
		const one = '// spec: capability/a-first-thing\ntest("acts", () => {});\n';
		const dir = world(one.repeat(5), "A first thing", "A second thing");
		expect(cited(dir)).toEqual(["capability/a-first-thing"]);
		const { criteria } = check(dir);
		expect(criteria.length - cited(dir).length).toBe(1);
	});
});

// spec: spec-test-traceability/a-citation-floating-in-a-file
describe("a citation floating in a file", () => {
	test("a statement between the comment and the call fails", () => {
		const dir = world(
			'// spec: capability/a-first-thing\nconst x = 1;\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(problems(dir).join("\n")).toContain("src/thing.test.ts:1");
	});

	test("a citation with no call after it at all fails", () => {
		const dir = world("// spec: capability/a-first-thing\n", "A first thing");
		expect(problems(dir).join("\n")).toContain("src/thing.test.ts:1");
	});
});

describe("what is not a citation", () => {
	test("a spec marker inside a string literal is ignored", () => {
		const dir = world(
			'const source = "// spec: capability/a-first-thing";\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual([]);
		expect(problems(dir)).toEqual([]);
	});

	test("a spec marker inside a multi-line block comment is ignored", () => {
		const dir = world(
			'/*\n// spec: capability/a-first-thing\n*/\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual([]);
		expect(problems(dir)).toEqual([]);
	});

	test("a spec marker inside a block comment is ignored", () => {
		const dir = world(
			'/* // spec: capability/a-first-thing */\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual([]);
		expect(problems(dir)).toEqual([]);
	});

	test("a string literal holding a comment opener blinds nothing below it", () => {
		const dir = world(
			'const opener = "/*";\n// spec: capability/a-first-thing\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual(["capability/a-first-thing"]);
		expect(problems(dir)).toEqual([]);
	});

	test("a block comment between a citation and its call separates them", () => {
		const dir = world(
			'// spec: capability/a-first-thing\n/* note\ntext */\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(cited(dir)).toEqual(["capability/a-first-thing"]);
		expect(problems(dir)).toEqual([]);
	});

	test("a citation naming no identifier fails", () => {
		const dir = world('// spec:\ntest("acts", () => {});\n', "A first thing");
		expect(problems(dir).join("\n")).toContain("src/thing.test.ts:1");
	});

	test("an identifier without its capability fails", () => {
		const dir = world(
			'// spec: a-first-thing\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(problems(dir).join("\n")).toContain("a-first-thing");
		expect(cited(dir)).toEqual([]);
	});

	test("an identifier carrying uppercase or a space fails", () => {
		const dir = world(
			'// spec: capability/A First Thing\ntest("acts", () => {});\n',
			"A first thing",
		);
		expect(problems(dir).length).toBeGreaterThan(0);
		expect(cited(dir)).toEqual([]);
	});
});
