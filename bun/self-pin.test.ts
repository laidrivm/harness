/**
 * The harness's own sessions run its gates from its pin: the tracked
 * `.claude/settings.json` registers every hook a consumer gets, in the
 * consumer's text, and none that runs a script from the working tree, so an
 * edit to a gate holds no session until it merges and the pin moves past it.
 * The pin itself is a development dependency, which a consumer never installs.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOOKS, registration } from "./bootstrap.ts";

type Entry = { matcher?: string; hooks?: { command?: string }[] };

const tracked = (path: string) =>
	JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
const hooks = (): Record<string, Entry[]> =>
	tracked(".claude/settings.json").hooks ?? {};

describe("the harness's own hook registrations", () => {
	// spec: harness-updates/a-registration-is-missing-from-the-harness-s-settings
	test.each(HOOKS.map((hook) => [`${hook.name} (${hook.event})`, hook]))(
		"%s is registered in its consumer text",
		(_, hook) => {
			// The whole hook object, so an `if`, `async`, other type or other
			// timeout that would stop it running, blocking or finishing fails here
			// — no check reads these settings.
			const registered = (hooks()[hook.event] ?? [])
				.filter((entry) => entry.matcher === hook.matcher)
				.flatMap((entry) => entry.hooks ?? []);
			expect(registered).toContainEqual(registration(hook));
			if (hook.sole) expect(registered).toHaveLength(1);
		},
	);

	// spec: harness-updates/a-hook-runs-a-working-tree-script
	test("no hook runs a script from the working tree", () => {
		const commands = Object.values(hooks())
			.flat()
			.flatMap((entry) => entry.hooks ?? [])
			.map((hook) => hook.command ?? "");
		expect(
			commands.filter((command) =>
				command.includes("$CLAUDE_PROJECT_DIR/bun/"),
			),
		).toEqual([]);
	});

	test("the harness pins itself as a development dependency at a full commit", () => {
		const manifest = tracked("package.json");
		expect(manifest.dependencies?.harness).toBeUndefined();
		expect(manifest.devDependencies?.harness).toMatch(
			/^github:laidrivm\/harness#[0-9a-f]{40}$/,
		);
	});
});
