import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drift, sync } from "./sync.ts";

const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A package `core/` and a consumer copy, each holding the files given. */
function pair(core: Record<string, string>, copy: Record<string, string>) {
	const dir = mkdtempSync(join(tmpdir(), "harness-sync-"));
	made.push(dir);
	const write = (sub: string, files: Record<string, string>) => {
		mkdirSync(join(dir, sub));
		for (const [name, text] of Object.entries(files))
			writeFileSync(join(dir, sub, name), text);
	};
	write("core", core);
	write("copy", copy);
	return { core: join(dir, "core"), copy: join(dir, "copy") };
}

const PACKAGE = { "rules.md": "# rules\n", "testing.md": "# testing\n" };

describe("the copy against the package", () => {
	test("an identical copy passes", () => {
		const { core, copy } = pair(PACKAGE, PACKAGE);
		expect(drift(core, copy)).toEqual([]);
	});

	test("three differing files are each named", () => {
		const three = { "a.md": "a\n", "b.md": "b\n", "c.md": "c\n" };
		const { core, copy } = pair(
			{ ...PACKAGE, ...three },
			{ ...PACKAGE, "a.md": "A\n", "b.md": "B\n", "c.md": "C\n" },
		);
		const problems = drift(core, copy);
		expect(problems).toHaveLength(3);
		for (const name of Object.keys(three))
			expect(problems.join("\n")).toContain(`harness/${name}: differs`);
	});

	test("a file missing from the copy is named", () => {
		const { core, copy } = pair(PACKAGE, { "rules.md": "# rules\n" });
		expect(drift(core, copy)).toEqual([
			expect.stringContaining("harness/testing.md: missing from the copy"),
		]);
	});

	test("a file only the copy holds is named", () => {
		const { core, copy } = pair(PACKAGE, { ...PACKAGE, "notes.md": "x\n" });
		expect(drift(core, copy)).toEqual([
			expect.stringContaining("harness/notes.md: not in the pinned package"),
		]);
	});

	test("a one-byte difference is named", () => {
		const { core, copy } = pair(PACKAGE, {
			...PACKAGE,
			"rules.md": "# rules \n",
		});
		expect(drift(core, copy)).toEqual([
			expect.stringContaining("harness/rules.md: differs"),
		]);
	});

	test("a skill directory beside the rules is not copied", () => {
		const { core, copy } = pair(PACKAGE, PACKAGE);
		mkdirSync(join(core, "skills"));
		expect(drift(core, copy)).toEqual([]);
	});
});

describe("syncing", () => {
	test("leaves the copy identical to the package, extras removed", () => {
		const { core, copy } = pair(PACKAGE, {
			"rules.md": "stale\n",
			"gone.md": "x\n",
		});
		sync(core, copy);
		expect(drift(core, copy)).toEqual([]);
	});

	test("a package holding no rulebook is refused, the copy left whole", () => {
		const { core, copy } = pair({}, PACKAGE);
		expect(() => sync(core, copy)).toThrow(/holds no rules\.md/);
		expect(readdirSync(copy).sort()).toEqual(Object.keys(PACKAGE).sort());
	});

	test("a package directory that is absent fails the check", () => {
		const { copy } = pair({}, PACKAGE);
		expect(() => drift(join(copy, "..", "absent"), copy)).toThrow(
			/holds no rules\.md/,
		);
	});
});
