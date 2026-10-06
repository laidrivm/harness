import { describe, expect, test } from "bun:test";
import { blank } from "./scan.ts";

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
