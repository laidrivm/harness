/**
 * What `sync.ts` writes into a consumer's `package.json`: the `deps` script
 * and nothing else. Its own file because `sync-settings.test.ts` is at the
 * line cap; the entry point's refusal is in `sync-bunfig.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { DEPS, settings } from "./settings.ts";
import { CANONICAL, cleanup, consumer, read, SETTINGS, STALE_BUNFIG, stale } from "./sync-settings.fixture.ts";
import { syncSettings } from "./sync-settings.ts";

afterAll(cleanup);

describe("package.json", () => {
	// spec: harness-updates/a-consumer-without-the-script
	test.each([
		["no scripts", { name: "app", private: true }, "\t", { name: "app", private: true, scripts: { deps: DEPS } }],
		[
			"scripts but no deps",
			{ name: "app", scripts: { test: "bun test" }, private: true },
			"  ",
			{ name: "app", scripts: { test: "bun test", deps: DEPS }, private: true },
		],
	])("%s gains scripts.deps, the other keys and the indentation kept", (_, before, indent, after) => {
		const dir = consumer({ [SETTINGS]: JSON.stringify(stale()), "package.json": JSON.stringify(before, null, indent) });
		syncSettings(dir);
		expect(read(dir, "package.json")).toBe(JSON.stringify(after, null, indent));
	});

	test("a missing package.json is written with the script, and the check then passes", () => {
		const dir = consumer({ [SETTINGS]: JSON.stringify(stale()) });
		syncSettings(dir);
		expect(JSON.parse(read(dir, "package.json"))).toEqual({ scripts: { deps: DEPS } });
		expect(settings(dir).join("\n")).not.toContain("package.json");
	}, 30_000);

	// spec: harness-updates/a-consumer-that-already-holds-it
	test("one already holding the script is left byte for byte", () => {
		const text = `{"scripts":{  "deps": "${DEPS}"}, "z": 1}`;
		const dir = consumer({ [SETTINGS]: "{}", "package.json": text });
		syncSettings(dir);
		expect(read(dir, "package.json")).toBe(text);
	});

	// spec: harness-updates/a-consumer-s-own-deps-script
	test("a deps script of the consumer's own fails naming it and writes no file", () => {
		const json = JSON.stringify(stale());
		const pkg = '{ "scripts": { "deps": "pnpm install" } }\n';
		const dir = consumer({ [SETTINGS]: json, "bunfig.toml": STALE_BUNFIG, "package.json": pkg });
		expect(() => syncSettings(dir)).toThrow('package.json: scripts.deps is "pnpm install"');
		expect([read(dir, "package.json"), read(dir, SETTINGS), read(dir, "bunfig.toml")]).toEqual([
			pkg,
			json,
			STALE_BUNFIG,
		]);
	});

	test.each([
		["not JSON", "{"],
		["scripts that are not an object", '{ "scripts": [] }'],
	])("a package.json with %s fails naming the file and writes nothing", (_, pkg) => {
		const dir = consumer({ [SETTINGS]: "{}", "bunfig.toml": CANONICAL, "package.json": pkg });
		expect(() => syncSettings(dir)).toThrow("package.json");
		expect([read(dir, "package.json"), read(dir, SETTINGS)]).toEqual([pkg, "{}"]);
	});
});
