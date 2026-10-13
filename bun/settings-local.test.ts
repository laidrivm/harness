/**
 * The sweep over a fabricated repository: its tracked `.claude/settings.json`
 * and an untracked `.claude/settings.local.json` beside it. The numbers in
 * brackets are the edge cases `/zombies` listed against the proposal.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, consumer, policy } from "./settings.fixture.ts";
import { machineLocal } from "./settings.ts";
import { sweep } from "./settings-local.ts";

afterAll(cleanup);

const script = join(import.meta.dir, "settings-local.ts");
const LOCAL = ".claude/settings.local.json";

type Lists = { deny?: string[]; ask?: string[]; allow?: string[] };

/**
 * A repository whose tracked file holds `tracked` as its permission lists and
 * whose local file holds `local` — an allow list, raw text, or nothing.
 */
function repo(tracked: Lists, local?: string[] | string): string {
	const config = policy();
	config.permissions = { deny: [], ask: [], allow: [], ...tracked };
	const files: Record<string, string> = {};
	if (local !== undefined)
		files[LOCAL] =
			typeof local === "string"
				? local
				: JSON.stringify({ permissions: { allow: local } });
	return consumer(config, files);
}

/** The sweep run as the command, from inside `dir`, with only `PATH` set. */
function run(dir: string) {
	const call = Bun.spawnSync(["bun", script], {
		cwd: dir,
		env: { PATH: process.env.PATH },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		out: call.stdout.toString(),
		err: call.stderr.toString(),
	};
}

/** What the sweep reports for one local entry against `tracked`. */
const report = (tracked: Lists, entry: string) =>
	sweep(repo(tracked, [entry]))?.reported ?? [];

describe("nothing to sweep", () => {
	// spec: agent-permissions/nothing-left-to-promote-or-drop
	test("an absent local file exits 0 and says there is nothing to sweep [1]", () => {
		const { code, out } = run(repo({ allow: ["Bash(bun test *)"] }));
		expect(code).toBe(0);
		expect(out).toContain("nothing to sweep");
	});

	test.each([
		["no permissions key", "{}"],
		["an empty allow list", JSON.stringify({ permissions: { allow: [] } })],
	])("a local file with %s exits 0 [2]", (_, text) => {
		expect(run(repo({}, text)).code).toBe(0);
	});

	test("a tracked file with no allow list leaves a pathless entry a gap [3]", () => {
		const config = policy();
		config.permissions = { deny: [], ask: [] } as unknown as typeof config.permissions;
		const dir = consumer(config, {
			[LOCAL]: JSON.stringify({ permissions: { allow: ["Bash(git rm -- *)"] } }),
		});
		expect(sweep(dir)?.reported).toEqual([
			"gap: Bash(git rm -- *) — promote it to .claude/settings.json or drop it",
		]);
	});
});

describe("one entry of each class", () => {
	test("an entry the tracked allow list holds is decided, naming it [4]", () => {
		const { code, err } = run(
			repo({ allow: ["Bash(bun test *)"] }, ["Bash(bun test *)"]),
		);
		expect(code).toBe(1);
		expect(err).toContain("decided: Bash(bun test *) — allow holds Bash(bun test *)");
	});

	// spec: agent-permissions/a-gap-in-the-tracked-policy
	test("an entry no tracked rule matches is a gap, and the run fails [5]", () => {
		const { code, err } = run(
			repo({ allow: ["Bash(bun test *)"] }, ["Bash(git push *)"]),
		);
		expect(code).toBe(1);
		expect(err).toContain("gap: Bash(git push *)");
	});

	// spec: agent-permissions/nothing-left-to-promote-or-drop
	test("a machine-local entry is kept, and the run passes [6]", () => {
		const { code, out, err } = run(
			repo({ allow: ["Bash(bun test *)"] }, ["Read(//Users/someone/x/**)"]),
		);
		expect(code).toBe(0);
		expect(out).toContain("kept: Read(//Users/someone/x/**)");
		expect(err).toBe("");
	});
});

describe("the order of the lists", () => {
	test("an entry deny and allow both match is decided by the deny entry [7]", () => {
		expect(
			report({ deny: ["Bash(npm *)"], allow: ["Bash(npm view *)"] }, "Bash(npm view x)"),
		).toEqual(["decided: Bash(npm view x) — deny holds Bash(npm *)"]);
	});

	test("an entry ask and allow both match is decided by the ask entry [8]", () => {
		expect(
			report({ ask: ["Bash(bun add *)"], allow: ["Bash(bun *)"] }, "Bash(bun add x)"),
		).toEqual(["decided: Bash(bun add x) — ask holds Bash(bun add *)"]);
	});

	test("every class in one file: decided before gaps, the kept one listed, the run failing [9]", () => {
		const dir = repo({ allow: ["Bash(git log *)"] }, [
			"Bash(sed -i x y)",
			"Read(//Users/someone/**)",
			"Bash(git log --oneline)",
		]);
		expect(sweep(dir)).toEqual({
			reported: [
				"decided: Bash(git log --oneline) — allow holds Bash(git log *)",
				"gap: Bash(sed -i x y) — promote it to .claude/settings.json or drop it",
			],
			kept: [
				"kept: Read(//Users/someone/**) — carries a path a clone does not have",
			],
		});
		expect(run(dir).code).toBe(1);
	});
});

describe("the documented matching", () => {
	test("a trailing ` *` also matches the bare command [10]", () => {
		expect(report({ allow: ["Bash(git log *)"] }, "Bash(git log)")).toEqual([
			"decided: Bash(git log) — allow holds Bash(git log *)",
		]);
	});

	test("the space before a trailing `*` is a word boundary [11]", () => {
		expect(report({ allow: ["Bash(ls *)"] }, "Bash(lsof)")).toEqual([
			"gap: Bash(lsof) — promote it to .claude/settings.json or drop it",
		]);
	});

	// spec: agent-permissions/an-entry-the-tracked-file-already-decides
	test("a trailing `:*` is a trailing ` *`, so an ask entry decides it and the run fails [12]", () => {
		const { code, err } = run(
			repo({ ask: ["Bash(bun install *)"] }, ["Bash(bun install:*)"]),
		);
		expect(code).toBe(1);
		expect(err).toContain(
			"decided: Bash(bun install:*) — ask holds Bash(bun install *)",
		);
	});

	test("a `:*` inside a rule is literal [13]", () => {
		expect(report({ allow: ["Bash(git:* push)"] }, "Bash(git push)")).toEqual([
			"gap: Bash(git push) — promote it to .claude/settings.json or drop it",
		]);
	});

	test.each(["Bash", "Bash(*)"])(
		"a tracked %s decides every Bash entry [14]",
		(rule) => {
			expect(report({ allow: [rule] }, "Bash(anything at all)")).toEqual([
				`decided: Bash(anything at all) — allow holds ${rule}`,
			]);
		},
	);

	test("a Bash rule never decides another tool's entry with the same text [15]", () => {
		expect(report({ allow: ["Bash(git log *)"] }, "PowerShell(git log)")).toEqual([
			"gap: PowerShell(git log) — promote it to .claude/settings.json or drop it",
		]);
	});
});

describe("an input that cannot be read", () => {
	test("a local file that does not parse throws, naming it [22]", () => {
		const dir = repo({}, '{ "permissions": ');
		expect(() => sweep(dir)).toThrow(LOCAL);
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
		expect(report({ allow: [rule] }, entry)).toEqual([
			`gap: ${entry} — promote it to .claude/settings.json or drop it`,
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
