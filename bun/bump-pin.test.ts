/**
 * Moving the harness pin in a consumer's `package.json` text: one line
 * changes, whatever the indentation, and a spec the edit cannot be sure of
 * fails before anything is installed.
 */
import { describe, expect, test } from "bun:test";
import { movePin, pinOf } from "./bump-pin.ts";

const OLD = "eddf1fdd56642c48a3b222034ec6268c9b55971f";
const NEW = "9d321b61a74c70d4d3324d11e64fef488f2202a0";
const spec = (sha: string) => `github:laidrivm/harness#${sha}`;

const manifest = (indent: string, harness = spec(OLD)) =>
	`${JSON.stringify(
		{
			name: "consumer",
			dependencies: { harness, react: "19.0.0" },
			harness: { bumpTest: "bun test" },
		},
		null,
		indent,
	)}\n`;

describe("moving the pin", () => {
	test.each([
		["tabs", "\t"],
		["two spaces", "  "],
	])("under %s, exactly the pin's line changes", (_, indent) => {
		const before = manifest(indent).split("\n");
		const after = movePin(manifest(indent), NEW).split("\n");
		const changed = before.filter((line, i) => line !== after[i]);
		expect(after).toHaveLength(before.length);
		expect(changed).toEqual([`${indent}${indent}"harness": "${spec(OLD)}",`]);
	});

	test("the parsed dependency is the new spec afterwards", () => {
		const after = JSON.parse(movePin(manifest("\t"), NEW));
		expect(after.dependencies.harness).toBe(spec(NEW));
		expect(pinOf(movePin(manifest("\t"), NEW))).toBe(NEW);
	});

	test.each([
		["a short hash", spec("eddf1fd")],
		["another owner", `github:someone/harness#${OLD}`],
		["a version range", "^1.0.0"],
	])("a spec with %s fails naming it", (_, harness) => {
		expect(() => movePin(manifest("\t", harness), NEW)).toThrow(harness);
	});

	test("a spec that occurs twice in the text fails naming it", () => {
		const twice = manifest("\t").replace(
			'"name": "consumer"',
			`"name": "consumer",\n\t"note": "${spec(OLD)}"`,
		);
		expect(() => movePin(twice, NEW)).toThrow(spec(OLD));
	});

	test("a target that is not a full commit hash fails", () => {
		expect(() => movePin(manifest("\t"), "9d321b6")).toThrow("9d321b6");
	});

	test("a manifest without the dependency fails naming it", () => {
		expect(() => pinOf('{"dependencies": {}}')).toThrow("dependencies.harness");
	});
});
