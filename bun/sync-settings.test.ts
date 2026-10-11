/**
 * What `sync.ts` writes into a consumer's `.claude/settings.json` and
 * `bunfig.toml`: every value the policy check dictates, and nothing it only
 * checks. Each case starts from a fabricated consumer whose files carry a
 * previous harness version's values, the state a bump leaves behind.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { HOOKS } from "./bootstrap.ts";
import { ASK, DENY, INSTALL, settings } from "./settings.ts";
import { syncSettings } from "./sync-settings.ts";

const made: string[] = [];
afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const SETTINGS = ".claude/settings.json";

/** A git repository holding `files`, so the policy check can list it. */
function consumer(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-sync-settings-"));
	made.push(dir);
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	return dir;
}

const read = (dir: string, path: string) =>
	readFileSync(join(dir, path), "utf8");
const parsed = (dir: string) => JSON.parse(read(dir, SETTINGS));

/** A previous version's hook: another script under the harness package. */
const old = (script: string) =>
	`g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/${script}"; bun "$g"`;

/** Settings as a previous harness version left them, plus `extra`. */
const stale = (extra: Record<string, unknown> = {}) => ({
	permissions: {
		deny: ["Bash(npx *)", "Bash(npm *)", "Edit(.npmrc)"],
		ask: ["Bash(bun add *)", "Edit(bunfig.toml)"],
		allow: ["Bash(bun test *)"],
	},
	hooks: {
		PreToolUse: [
			{ matcher: "Bash", hooks: [{ type: "command", command: old("g.ts") }] },
		],
		UserPromptSubmit: [
			{ hooks: [{ type: "command", command: old("turn-gate.ts mark") }] },
		],
		Stop: [{ hooks: [{ type: "command", command: old("turn-gate.ts stop") }] }],
	},
	...extra,
});

const STALE_BUNFIG =
	"[install]\nexact = true\nminimumReleaseAge = 86400\nminimumReleaseAgeExcludes = []\n";
const CANONICAL =
	"[install]\nexact = true\nminimumReleaseAge = 259200\nminimumReleaseAgeExcludes = []\n";

describe("the settings file", () => {
	// spec: harness-updates/a-harness-change-to-its-policy-needs-no-manual-edit
	test("a previous version's hooks, lists and [install] come out passing the check", () => {
		const dir = consumer({
			[SETTINGS]: JSON.stringify(stale(), null, "\t"),
			"bunfig.toml": STALE_BUNFIG,
		});
		syncSettings(dir);
		expect(settings(dir)).toEqual([]);
		const text = read(dir, SETTINGS);
		for (const script of ["g.ts", "turn-gate.ts mark", "turn-gate.ts stop"])
			expect(text).not.toContain(JSON.stringify(old(script)).slice(1, -1));
		const hooks = parsed(dir).hooks;
		expect(hooks.UserPromptSubmit).toHaveLength(1);
		expect(hooks.Stop).toHaveLength(1);
	}, 30_000);

	// spec: harness-updates/the-project-s-own-settings-survive-a-sync
	test("a project hook, the allow list, non-Bash entries and unknown keys parse equal", () => {
		const own = { type: "command", command: "echo own" };
		const config = stale({ model: "opus" });
		config.permissions.deny.push("Edit(secrets/**)");
		config.permissions.ask.unshift("mcp__notion__update");
		config.hooks.PreToolUse.push({ matcher: "Edit", hooks: [own] });
		config.hooks.UserPromptSubmit[0]?.hooks.push(own);
		const dir = consumer({ [SETTINGS]: JSON.stringify(config, null, "\t") });
		syncSettings(dir);
		const after = parsed(dir);
		expect(after.model).toBe("opus");
		expect(after.permissions.allow).toEqual(["Bash(bun test *)"]);
		expect(after.permissions.deny).toEqual([
			...DENY,
			"Edit(.npmrc)",
			"Edit(secrets/**)",
		]);
		expect(after.permissions.ask).toEqual([
			"mcp__notion__update",
			...ASK,
			"Edit(bunfig.toml)",
		]);
		expect(after.hooks.PreToolUse).toContainEqual({
			matcher: "Edit",
			hooks: [own],
		});
		expect(after.hooks.UserPromptSubmit[0]).toEqual({ hooks: [own] });
	});

	test("a matcher group the removal empties is dropped, not left empty", () => {
		const dir = consumer({ [SETTINGS]: JSON.stringify(stale()) });
		syncSettings(dir);
		for (const groups of Object.values(parsed(dir).hooks) as {
			hooks: unknown[];
		}[][])
			for (const group of groups) expect(group.hooks.length).toBeGreaterThan(0);
	});

	test.each([
		["tabs", "\t"],
		["two spaces", "  "],
	])("indentation by %s is kept", (_, indent) => {
		const dir = consumer({ [SETTINGS]: JSON.stringify(stale(), null, indent) });
		syncSettings(dir);
		const text = read(dir, SETTINGS);
		expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, indent)}\n`);
	});

	test("a consumer with no settings file gets the hooks and the lists", () => {
		const dir = consumer({});
		syncSettings(dir);
		const after = parsed(dir);
		expect(after.permissions.deny).toEqual([...DENY, "Edit(.npmrc)"]);
		expect(after.permissions.ask).toEqual([...ASK, "Edit(bunfig.toml)"]);
		for (const { event, command } of HOOKS)
			expect(JSON.stringify(after.hooks[event])).toContain(
				JSON.stringify(command),
			);
	});

	test("a second sync changes no byte of either file", () => {
		const dir = consumer({
			[SETTINGS]: JSON.stringify(stale(), null, "  "),
			"bunfig.toml": STALE_BUNFIG,
		});
		syncSettings(dir);
		const once = [read(dir, SETTINGS), read(dir, "bunfig.toml")];
		syncSettings(dir);
		expect([read(dir, SETTINGS), read(dir, "bunfig.toml")]).toEqual(once);
	});
});

describe("bunfig.toml", () => {
	const sync = (bunfig: string) => {
		const dir = consumer({ [SETTINGS]: "{}", "bunfig.toml": bunfig });
		syncSettings(dir);
		return read(dir, "bunfig.toml");
	};

	test("an [install] already equal to the harness's keeps every byte, comments included", () => {
		const commented =
			"[install]\n# why exact\nexact = true\n\nminimumReleaseAge = 259200 # 3 days\nminimumReleaseAgeExcludes = []\n\n[test]\nroot = \"src\"\n";
		expect(sync(commented)).toBe(commented);
	});

	// spec: harness-updates/the-project-s-own-settings-survive-a-sync
	test("a differing [install] is replaced up to the next table, which keeps its text", () => {
		const rest = '[serve.static]\nenv = "BUN_PUBLIC_*"\n\n';
		const tail = '\n[test]\n# kept\npathIgnorePatterns = ["e2e/**"]\n';
		const out = sync(`${rest}${STALE_BUNFIG}${tail}`);
		expect(out).toBe(`${rest}${CANONICAL}${tail}`);
		expect(Bun.TOML.parse(out)).toMatchObject({ install: INSTALL });
	});

	test("a missing [install] is appended", () => {
		expect(sync('[test]\nroot = "src"\n')).toBe(
			`[test]\nroot = "src"\n\n${CANONICAL}`,
		);
	});

	test("a missing bunfig.toml is written with [install] alone", () => {
		const dir = consumer({ [SETTINGS]: "{}" });
		syncSettings(dir);
		expect(read(dir, "bunfig.toml")).toBe(CANONICAL);
	});

	// spec: harness-updates/an-install-section-the-rewrite-would-damage-is-left-untouched
	test.each([
		[
			"a subtable that would stay under [install]",
			`${STALE_BUNFIG}\n[install.scopes]\nx = "y"\n`,
		],
		[
			"an array line that reads as a header",
			"[install]\nexact = false\nminimumReleaseAgeExcludes = [\n[\"x\"],\n]\n",
		],
	])("%s fails naming bunfig.toml and writes neither file", (_, bunfig) => {
		const json = JSON.stringify(stale());
		const dir = consumer({ [SETTINGS]: json, "bunfig.toml": bunfig });
		expect(() => syncSettings(dir)).toThrow("bunfig.toml");
		expect(read(dir, "bunfig.toml")).toBe(bunfig);
		expect(read(dir, SETTINGS)).toBe(json);
	});
});
