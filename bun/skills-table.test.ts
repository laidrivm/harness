/**
 * Fails when the README's skill table and the tracked skills under
 * `core/skills/` disagree: a row naming no tracked skill, or a tracked skill
 * with no row. Only tracked files count, so a skill present in one checkout and
 * absent from a clone cannot pass here.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tracked } from "./tracked.ts";

/** Each body row of the `## Skills` table, as its raw line. */
function rows(root: string): string[] {
	const readme = readFileSync(join(root, "README.md"), "utf8");
	const start = readme.search(/^## Skills$/m);
	if (start < 0) throw new Error("README.md has no `## Skills` heading");
	const rest = readme.slice(start).split("\n").slice(1);
	const end = rest.findIndex((line) => line.startsWith("## "));
	const table = (end < 0 ? rest : rest.slice(0, end)).filter((line) =>
		line.startsWith("|"),
	);
	// The header and the separator row are the table's first two lines.
	return table.slice(2);
}

/** The skill a row names: its first cell, which must be one backticked name. */
function named(row: string): string | undefined {
	const cell = row.split("|")[1]?.trim() ?? "";
	return /^`([^`]+)`$/.exec(cell)?.[1];
}

/** The skills git tracks, one per `core/skills/<name>/SKILL.md`. */
function skills(paths: string[]): string[] {
	return paths.flatMap((path) => {
		const name = /^core\/skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1];
		return name ? [name] : [];
	});
}

describe("the README's skill table", () => {
	test("every row names a tracked skill", () => {
		const { root, paths } = tracked();
		const known = new Set(skills(paths));
		const strays = rows(root).filter((row) => {
			const name = named(row);
			return name === undefined || !known.has(name);
		});
		expect(rows(root).length).toBeGreaterThan(0);
		expect(strays).toEqual([]);
	});

	test("every tracked skill has a row", () => {
		const { root, paths } = tracked();
		const listed = new Set(rows(root).map(named));
		const missing = skills(paths).filter((name) => !listed.has(name));
		expect(skills(paths).length).toBeGreaterThan(0);
		expect(missing).toEqual([]);
	});
});
