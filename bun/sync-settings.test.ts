/**
 * What `sync.ts` writes into a consumer's `.claude/settings.json`: every value
 * the policy check dictates, and nothing it only checks. `bunfig.toml` and
 * the script's own entry point are in `sync-bunfig.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { HOOKS, MARK } from "./bootstrap.ts";
import { ASK, DENY, settings } from "./settings.ts";
import { syncSettings } from "./sync-settings.ts";
import {
	cleanup,
	consumer,
	old,
	parsed,
	read,
	SETTINGS,
	STALE_BUNFIG,
	stale,
} from "./sync-settings.fixture.ts";

afterAll(cleanup);

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
		// A project's own hook may call a harness script by its path.
		const check = {
			type: "command",
			command: "bun node_modules/harness/bun/check.ts",
		};
		const config = stale({ model: "opus" });
		config.permissions.deny.push("Edit(secrets/**)");
		config.permissions.ask.unshift("mcp__notion__update");
		config.hooks.PreToolUse.push({ matcher: "Edit", hooks: [own] });
		config.hooks.UserPromptSubmit[0]?.hooks.push(own);
		config.hooks.Stop.push({ hooks: [check] });
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
		expect(after.hooks.Stop).toContainEqual({ hooks: [check] });
	});

	test("a hook copied by hand before the mark existed is replaced, not doubled", () => {
		const unmarked = (command: string) => command.slice(0, -` ${MARK}`.length);
		const config = stale();
		type Group = { matcher?: string; hooks: object[] };
		for (const { event, matcher, command } of HOOKS) {
			// A hook the previous version never registered is only added.
			const groups: Group[] =
				config.hooks[event as keyof typeof config.hooks] ?? [];
			const group = groups.find((g) => g.matcher === matcher);
			if (group) group.hooks = [{ type: "command", command: unmarked(command) }];
		}
		const dir = consumer({ [SETTINGS]: JSON.stringify(config) });
		syncSettings(dir);
		for (const { event, matcher, command } of HOOKS)
			expect(
				parsed(dir).hooks[event].filter((g: Group) => g.matcher === matcher),
			).toEqual([
				expect.objectContaining({ hooks: [{ type: "command", command }] }),
			]);
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

	test("an event left with no hooks once a previous version's are gone is dropped", () => {
		const config = stale();
		Object.assign(config.hooks, {
			SessionEnd: [{ hooks: [{ type: "command", command: old("bye.ts") }] }],
		});
		const dir = consumer({ [SETTINGS]: JSON.stringify(config) });
		syncSettings(dir);
		expect(Object.keys(parsed(dir).hooks)).not.toContain("SessionEnd");
	});

	test("a deny list with no Bash entries gets them after the project's own", () => {
		const config = stale();
		config.permissions.deny = ["Edit(secrets/**)"];
		const dir = consumer({ [SETTINGS]: JSON.stringify(config) });
		syncSettings(dir);
		expect(parsed(dir).permissions.deny).toEqual([
			"Edit(secrets/**)",
			...DENY,
			"Edit(.npmrc)",
		]);
	});

	test("interleaved Bash entries collapse where the first stood", () => {
		const config = stale();
		config.permissions.deny = ["Edit(a)", "Bash(npx *)", "Edit(b)", "Bash(x *)"];
		const dir = consumer({ [SETTINGS]: JSON.stringify(config) });
		syncSettings(dir);
		expect(parsed(dir).permissions.deny).toEqual([
			"Edit(a)",
			...DENY,
			"Edit(b)",
			"Edit(.npmrc)",
		]);
	});

	test("settings that are not JSON fail naming the file and write nothing", () => {
		const dir = consumer({ [SETTINGS]: "{", "bunfig.toml": STALE_BUNFIG });
		expect(() => syncSettings(dir)).toThrow(".claude/settings.json");
		expect(read(dir, SETTINGS)).toBe("{");
		expect(read(dir, "bunfig.toml")).toBe(STALE_BUNFIG);
	});

	test.each([
		["an event that is not a list", { Stop: "x" }],
		["an entry that is not an object", { Stop: [null] }],
		["an entry whose hooks are not a list", { Stop: [{ hooks: "x" }] }],
	])("%s fails naming hooks.Stop and writes nothing", (_, hooks) => {
		const json = JSON.stringify({ hooks });
		const dir = consumer({ [SETTINGS]: json });
		expect(() => syncSettings(dir)).toThrow("hooks.Stop");
		expect(read(dir, SETTINGS)).toBe(json);
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
