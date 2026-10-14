import { describe, expect, test } from "bun:test";
import { blank, comments } from "./scan.ts";

/** `MARK` stands in for whatever a caller is looking for: it survives the scan
 * when it sits in code, and goes when it sits in something the language quotes
 * or comments out. */
const kept = (source: string, language: "css" | "ts") =>
	blank(source, language).includes("MARK");

describe("scanning TypeScript", () => {
	test.each([
		["a string", "const a = 'MARK';"],
		["a line comment", "// MARK"],
		["a block comment", "/* MARK */"],
		["template text", "const a = `text MARK`;"],
		["template text after an escaped backtick", "const a = `a \\` MARK`;"],
		["a regex literal", "const a = /MARK/;"],
		["a regex after return", "function f() { return /MARK/; }"],
		["a regex after an arrow", "const f = () => /MARK/;"],
		["a regex after typeof", "const a = typeof /MARK/;"],
		// `of` is the keyword here, so what follows it is a value.
		["a regex after the for-of binding", "for (const x of /MARK/) {}"],
	])("erases %s", (_, source) => expect(kept(source, "ts")).toBe(false));

	test.each([
		["plain code", "const MARK = 1;"],
		["a template expression", `const a = \`\${MARK}\`;`],
		["a nested template expression", `const a = \`\${\`\${MARK}\`}\`;`],
		["code after an interpolation closes", `const a = \`\${1}\` + MARK;`],
		["code after a division, which is not a regex", "const a = 1 / 2; MARK;"],
		// A quote that opened no string — one inside a regex literal, say — would
		// otherwise swallow the rest of the file and take the scan silent with it.
		["code after a quote left open on its line", "const a = 'x\nMARK;"],
		["code after a comment that names a quote", "// it's fine\nMARK;"],
		// `of` is an identifier here, so the `/` is a division. Read as a regex
		// it would run to the next `/` — the block comment's own opener — and
		// take the directive inside it with it.
		["code after a division by a name called `of`", "const a = of / 2; MARK;"],
		[
			"code after a block comment that follows a division by `of`",
			"const a = of / 2; /* hidden */ const MARK = 1;",
		],
		[
			"code after a regex literal holding a comment opener",
			"const r = /[/*]/; MARK;",
		],
		[
			"code after a template holding an escaped backtick",
			"const a = `\\``; MARK;",
		],
	])("keeps %s", (_, source) => expect(kept(source, "ts")).toBe(true));

	test("preserves offsets, so a match reads back out of the source", () => {
		const source = 'const a = "hidden"; const b = 1;';

		expect(blank(source, "ts")).toHaveLength(source.length);
		expect(blank(source, "ts").indexOf("const b")).toBe(
			source.indexOf("const b"),
		);
	});
});

describe("scanning CSS", () => {
	test.each([
		["a comment", "/* MARK */ .a {}"],
		["a string", '.a { content: "MARK"; }'],
	])("erases %s", (_, source) => expect(kept(source, "css")).toBe(false));

	// CSS has neither, and reading one would erase a rule that is really there.
	test.each([
		["a line comment", ".a { background: url(//cdn/MARK.png); }"],
		["a regex literal", ".a { margin: /MARK/; }"],
	])("keeps what TypeScript would take for %s", (_, source) =>
		expect(kept(source, "css")).toBe(true),
	);
});

const read = (source: string) => comments(source, "ts");

describe("reading comments", () => {
	test("a block comment spanning lines reports the line it opens on", () => {
		expect(read("a;\n/* one\ntwo */\nb;")).toEqual([
			{ text: " one\ntwo ", line: 2, block: true },
		]);
	});

	test("a line marker inside a block comment is the block's text", () => {
		expect(read("/* a // b */ c;")).toEqual([
			{ text: " a // b ", line: 1, block: true },
		]);
	});

	test("a block opener inside a line comment opens nothing", () => {
		expect(read("// a /* b\nconst x = 1; // after")).toEqual([
			{ text: " a /* b", line: 1, block: false },
			{ text: " after", line: 2, block: false },
		]);
	});

	test("a comment inside a template interpolation is one", () => {
		expect(read("const a = `${ /* c */ 1 }`;")).toEqual([
			{ text: " c ", line: 1, block: true },
		]);
	});

	test.each([
		["template text", "const a = `// no ${1} /* no */`;"],
		["template text after an escaped backtick", "const a = `a \\` // no`;"],
		// A syntax error, so everything after the opener stays template text.
		["an unterminated template", "const a = `x\n// no"],
	])("reports nothing from %s", (_, source) => {
		expect(read(source)).toEqual([]);
	});

	test("a comment opener inside a regex literal opens nothing", () => {
		expect(read("const r = /[/*]/;\n// c")).toEqual([
			{ text: " c", line: 2, block: false },
		]);
	});

	test("CRLF line ends count one line each", () => {
		expect(read("/* a\r\nb */\r\n// c\r\n").map((c) => c.line)).toEqual([
			1, 3,
		]);
	});

	// CSS has no line comment, so `//` in a URL is part of the rule.
	test("CSS reports its block comments and no line comment", () => {
		expect(
			comments(".a { background: url(//cdn/x.png); } /* c */", "css"),
		).toEqual([{ text: " c ", line: 1, block: true }]);
	});
});
