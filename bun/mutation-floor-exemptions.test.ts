/**
 * Which disable comments Stryker honours, and therefore which lines the check
 * must see as exempted. This file leaves with the scanner it exercises when
 * `mutation-floor.ts` switches to `scripts/scan.ts` — `scan-lift` owns that
 * lift, and is a card on `Harness`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup } from "./mutation-floor.fixture.ts";
import { exemptions } from "./mutation-floor.ts";

afterAll(cleanup);

/** `src/model.ts` as the scan sees it: `lines` with the code they annotate. */
const marked = (...lines: string[]) =>
	lines.map((line) => `${line}\nconst x = 1;`).join("\n");

// spec: mutation-floor/an-exemption-with-no-reason
describe("an exemption with no reason", () => {
	// spec: mutation-floor/an-equivalent-mutant-is-marked
	test("a named mutator with a reason is accepted", () => {
		expect(
			exemptions(
				marked(
					"// Stryker disable next-line EqualityOperator: bound is <=, = is a typo",
				),
			),
		).toEqual([]);
	});

	test("a comma-separated list of mutators shares one reason", () => {
		// One line can carry two mutants equivalent for the same reason, and
		// rejecting the list would push the author towards `all`.
		expect(
			exemptions(
				marked(
					"// Stryker disable next-line EqualityOperator,ArithmeticOperator: both re-derive the same total",
				),
			),
		).toEqual([]);
	});

	test("a mutator named with nothing after the colon fails", () => {
		expect(
			exemptions(marked("// Stryker disable next-line EqualityOperator:")),
		).not.toEqual([]);
	});

	test("a reason of whitespace alone fails", () => {
		expect(
			exemptions(marked("// Stryker disable next-line EqualityOperator:   ")),
		).not.toEqual([]);
	});

	test("a mutator named with no colon at all fails", () => {
		expect(
			exemptions(marked("// Stryker disable next-line EqualityOperator")),
		).not.toEqual([]);
	});

	test("a list written with spaces after the commas is accepted", () => {
		expect(
			exemptions(
				marked(
					"// Stryker disable next-line EqualityOperator, ArithmeticOperator: one reason",
				),
			),
		).toEqual([]);
	});

	test("two malformed comments yield two problems", () => {
		// Every other case here asserts only that something was reported, so a
		// scan that stopped at the first would satisfy them all.
		expect(
			exemptions(
				marked(
					"// Stryker disable next-line EqualityOperator",
					"// Stryker disable next-line all",
				),
			),
		).toHaveLength(2);
	});

	test("the failure names the line it sits on", () => {
		const [problem] = exemptions(
			`const a = 1;\nconst b = 2;\n// Stryker disable next-line EqualityOperator\nconst c = 3;\n`,
		);
		expect(problem).toContain("3");
	});
});

// spec: mutation-floor/a-blanket-disable-comment
describe("a blanket disable comment", () => {
	test("`all` instead of a mutator fails", () => {
		// On the form, not on the name: with no colon it never reaches the
		// `all` branch, and asserting that branch here would assert a lie.
		expect(exemptions(marked("// Stryker disable next-line all"))).toEqual([
			expect.stringContaining("write `// Stryker disable next-line"),
		]);
	});

	test("`all` with a reason still fails", () => {
		// The reason does not redeem it: `all` would also silence a mutant
		// added to that line later that nobody has judged.
		expect(
			exemptions(
				marked(
					"// Stryker disable next-line all: the whole line is a constant",
				),
			),
		).toEqual([expect.stringContaining("names `all`")]);
	});

	test("a disable without next-line fails, whatever it names", () => {
		// Its scope runs to the end of the file or to a matching restore.
		expect(
			exemptions(
				marked("// Stryker disable EqualityOperator: bound is deliberate"),
			),
		).toEqual([expect.stringContaining("write `// Stryker disable next-line")]);
	});
});

// spec: mutation-floor/a-well-formed-directive-in-a-block-comment
describe("a directive Stryker honours outside a line comment", () => {
	test("a single-line block comment is scanned too", () => {
		// Stryker matches every comment Babel gives it, so this silences the
		// line's mutants exactly as a `//` directive would.
		expect(
			exemptions(marked("/* Stryker disable next-line all */")),
		).not.toEqual([]);
	});

	test("one trailing a line of code is scanned too", () => {
		expect(
			exemptions(
				"const a = 1; /* Stryker disable next-line all */\nconst x = 1;\n",
			),
		).not.toEqual([]);
	});

	test("a trailing line comment is scanned too", () => {
		expect(
			exemptions(
				"const a = 1; // Stryker disable next-line all\nconst x = 1;\n",
			),
		).not.toEqual([]);
	});

	test("one hiding behind an innocuous comment on the same line is found", () => {
		expect(
			exemptions(
				"const a = 1; /* a note */ // Stryker disable next-line all\nconst x = 1;\n",
			),
		).not.toEqual([]);
	});

	test("a well-formed one still fails, because the spelling is not the form", () => {
		// Stryker honours both spellings; the check accepts one, so a reader
		// of src/model.ts never has to know there are two.
		expect(
			exemptions(
				marked(
					"/* Stryker disable next-line ArithmeticOperator: re-derives the same total */",
				),
			),
		).not.toEqual([]);
	});
});

describe("what is not a disable comment", () => {
	test("one inside a string literal is not one", () => {
		expect(
			exemptions(
				`const s = "// Stryker disable next-line all";\nconst x = 1;\n`,
			),
		).toEqual([]);
	});

	test("one inside a block comment is not one", () => {
		expect(
			exemptions(`/*\n// Stryker disable next-line all\n*/\nconst x = 1;\n`),
		).toEqual([]);
	});

	test("one behind an escaped quote is still inside the string", () => {
		// The escape must not end the literal early: everything after it is
		// string, not code, and flagging it would fail the build on innocence.
		expect(
			exemptions(
				`const s = "he said \\"// Stryker disable next-line all\\"";\n`,
			),
		).toEqual([]);
	});

	test("a quote that opens no string does not silence the file", () => {
		// The `'` in a regex literal closes nowhere. If it were treated as a
		// string opener the scan would run to the end of the file and report
		// nothing at all, which is the one failure it must never have.
		expect(
			exemptions(`const re = /['"]/;\n// Stryker disable next-line all\n`),
		).not.toEqual([]);
	});

	test("an escaped newline still counts as a line", () => {
		const [problem] = exemptions(
			"const s = `a\\\nb`;\n// Stryker disable next-line all\nconst x = 1;\n",
		);
		expect(problem).toContain("src/model.ts:3");
	});

	test("one inside a multi-line template literal is not one", () => {
		expect(
			exemptions("const s = `a\n// Stryker disable next-line all\nb`;\n"),
		).toEqual([]);
	});

	test("a `/*` inside a line comment opens no block", () => {
		// If it did, every comment below would be swallowed and the scan would
		// go quiet for the rest of the file.
		expect(
			exemptions("// see /* the note\n// Stryker disable next-line all\n"),
		).not.toEqual([]);
	});

	test("a directive spanning a block comment's first line is found", () => {
		// Stryker anchors at the comment's text, so this one it honours.
		expect(
			exemptions("/* Stryker disable next-line all\n   because reasons */\n"),
		).not.toEqual([]);
	});

	test("one on a line whose block comment opened earlier is not one", () => {
		expect(
			exemptions(`const opener = "/*";\n// Stryker disable next-line all\n`),
		).not.toEqual([]);
	});
});
