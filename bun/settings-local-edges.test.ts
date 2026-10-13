/**
 * The sweep's edges over fabricated repositories: a matcher that stays
 * literal, the files and checks it leaves alone, and the inputs it refuses to
 * read. The numbers in brackets are the edge cases `/zombies` listed against
 * the proposal; the classes themselves are `settings-local.test.ts`'s.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run as check } from "./check.ts";
import { consumer, policy } from "./settings.fixture.ts";
import { machineLocal } from "./settings.ts";
import { sweep } from "./settings-local.ts";
import {
	cleanup,
	gap,
	LOCAL,
	report,
	repo,
	run,
} from "./settings-local.fixture.ts";

afterAll(cleanup);

describe("a literal matcher, and the order honest", () => {
	test.each([
		"Bash(sort -t: -k2 -rn)",
		'Bash(echo "exit=$?")',
		"Bash(grep -E 'a.+b$' x)",
	])("%s is decided by itself [16]", (entry) => {
		expect(report({ allow: [entry] }, entry)).toEqual([
			`decided: ${entry} — allow holds ${entry}`,
		]);
	});

	test.each([
		["Bash(ls a?c)", "Bash(ls abc)"],
		["Bash(grep a.c x)", "Bash(grep abc x)"],
		['Bash(echo "exit=$?")', 'Bash(echo "exit=0")'],
	])("%s does not decide %s [16]", (rule, entry) => {
		expect(report({ allow: [rule] }, entry)).toEqual([gap(entry)]);
	});

	test.each([
		["mcp__*", "mcp__github__get_issue"],
		["mcp__*__get_issue", "mcp__github__get_issue"],
	])("an unanchored allow glob %s decides nothing, as Claude Code skips it", (rule, entry) => {
		expect(report({ allow: [rule] }, entry)).toEqual([gap(entry)]);
	});

	test("an allow glob after a named server decides that server's tools", () => {
		const entry = "mcp__github__get_issue";
		expect(report({ allow: ["mcp__github__*"] }, entry)).toEqual([
			`decided: ${entry} — allow holds mcp__github__*`,
		]);
	});

	test("a path specifier that leaves by traversal is kept [17]", () => {
		const swept = sweep(repo({}, ["Read(../outside/**)"]));
		expect(swept).toEqual({
			reported: [],
			kept: [
				"kept: Read(../outside/**) — reaches outside the repository",
			],
		});
	});

	test.each([
		"Read(//Users/someone/**)",
		"Bash(cp a /tmp/b)",
		"Bash(cat ~/notes)",
		"Edit(../secrets/**)",
		"Read(docs/**)",
		"Bash(bun test)",
	])("%s is kept exactly when the tracked-file check refuses it [20]", (entry) => {
		const dir = repo({}, [entry]);
		const kept = (sweep(dir)?.kept ?? []).length === 1;
		expect(kept).toBe(machineLocal(entry, dir) !== undefined);
	});

	test("an entry with an absolute path that a tracked rule decides is decided, not kept [18]", () => {
		expect(
			report({ allow: ["Bash(mkdir *)"] }, "Bash(mkdir -p /tmp/x)"),
		).toEqual(["decided: Bash(mkdir -p /tmp/x) — allow holds Bash(mkdir *)"]);
	});
});

describe("what the sweep leaves alone", () => {
	// spec: agent-permissions/nothing-left-to-promote-or-drop
	test("neither file changes across a run that reports entries [24]", () => {
		const dir = repo({ allow: ["Bash(git log *)"] }, [
			"Bash(git log)",
			"Bash(git push *)",
		]);
		const read = () =>
			[".claude/settings.json", LOCAL].map((f) => readFileSync(join(dir, f)));
		const before = read();
		expect(run(dir).code).toBe(1);
		expect(read()).toEqual(before);
	});

	test("the harness's own tracked allow list names no machine-local entry", () => {
		const root = join(import.meta.dir, "..");
		const tracked = JSON.parse(
			readFileSync(join(root, ".claude/settings.json"), "utf8"),
		) as { permissions: { allow: string[] } };
		const local = tracked.permissions.allow.filter((e) => machineLocal(e, root));
		expect(local).toEqual([]);
	});

	test("check.ts's run reports the same with and without a local file [21]", () => {
		const manifest = {
			harness: {
				rootFiles: {},
				suppressions: {},
				uncitedFloor: { count: 0, why: "none" },
			},
		};
		const dir = consumer(policy(), {
			"package.json": JSON.stringify(manifest),
			// The size gate refuses a tree with no file it caps.
			"src/index.ts": "export {};\n",
		});
		const before = check(dir);
		// Unparseable, so a check that read it would throw or report it.
		writeFileSync(join(dir, LOCAL), "{ not json");
		expect(check(dir)).toEqual(before);
	});
});

describe("an input that cannot be read", () => {
	test("a local file that does not parse throws, naming it [22]", () => {
		const dir = repo({}, '{ "permissions": ');
		expect(() => sweep(dir)).toThrow(LOCAL);
	});

	test("a local allow that is not a list throws, naming the file", () => {
		const text = JSON.stringify({ permissions: { allow: "Bash(git push *)" } });
		expect(() => sweep(repo({}, text))).toThrow(LOCAL);
	});

	test.each([
		["missing", undefined],
		["not JSON", "{ permissions: "],
	])("a tracked file %s throws, naming it [23]", (_, text) => {
		const dir = repo({}, ["Bash(git push *)"]);
		const tracked = join(dir, ".claude/settings.json");
		if (text === undefined) rmSync(tracked);
		else writeFileSync(tracked, text);
		expect(() => sweep(dir)).toThrow(".claude/settings.json");
	});
});
