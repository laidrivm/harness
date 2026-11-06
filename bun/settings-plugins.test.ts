/**
 * The plugin half of the policy: the harness's two plugins enabled, and the
 * `ponytail` marketplace pinned by tag. Other plugins and marketplaces are
 * the consumer's own.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { noted } from "../orchestrator/layout.ts";
import { changed, cleanup, consumer, type Policy } from "./settings.fixture.ts";
import { MARKETPLACE, PLUGINS, settings } from "./settings.ts";

afterAll(cleanup);

const report = (change: (c: Policy) => void) => settings(consumer(changed(change))).join("\n");
const own = () => JSON.parse(readFileSync(`${import.meta.dir}/../.claude/settings.json`, "utf8"));

/** Each `ref` line of `text` with no note on it or above it, as `file:line`, by the runner's pin scan. */
const noteless = (file: string, text: string) =>
	text.split("\n").flatMap((line, i, all) => (/^\s*ref:/.test(line) && !noted(all, i) ? [`${file}:${i + 1}`] : []));

describe("the harness's plugins", () => {
	// spec: agent-permissions/a-consumer-without-the-plugins
	test("settings with no enabledPlugins name both, and one without you-should-know names it", () => {
		const none = report((c) => delete c.enabledPlugins);
		for (const id of PLUGINS) expect(none).toContain(`enabledPlugins.${id}`);
		const one = report((c) => (c.enabledPlugins = { "ponytail@ponytail": true }));
		expect(one).toContain("enabledPlugins.cc-plugin-you-should-know@builtin");
		expect(one).not.toContain("enabledPlugins.ponytail@ponytail");
	});

	// spec: agent-permissions/a-plugin-turned-off-in-the-tracked-file
	test("ponytail set to false is named", () => {
		expect(report((c) => (c.enabledPlugins = { ...c.enabledPlugins, "ponytail@ponytail": false }))).toContain(
			"enabledPlugins.ponytail@ponytail",
		);
	});

	// spec: agent-permissions/a-consumer-s-own-plugin-beside-the-harness-s
	test.each([true, false])("a consumer's own plugin set to %p reports nothing", (on) => {
		expect(report((c) => (c.enabledPlugins = { ...c.enabledPlugins, "some-tool@acme": on }))).toBe("");
	});

	test.each(
		["enabledPlugins", "extraKnownMarketplaces"].flatMap((key) =>
			[[], "x", null].map((value) => [key, value] as const),
		),
	)("%s as %p is named as no object, with a hand edit for its fix", (key, value) => {
		const text = report((c) => Object.assign(c, { [key]: value }));
		expect(text).toContain(`${key} is not an object — make it one by hand`);
		expect(text).not.toContain(`${key}.`);
	});

	// spec: agent-permissions/the-harness-s-own-plugins
	test("the harness's own settings enable both", () => {
		for (const id of PLUGINS) expect(own().enabledPlugins[id]).toBe(true);
	});
});

describe("the ponytail marketplace", () => {
	const entry = (change: (e: { source: Record<string, unknown>; autoUpdate?: unknown }) => void) =>
		report((c) => {
			const e = structuredClone(MARKETPLACE) as { source: Record<string, unknown>; autoUpdate?: unknown };
			change(e);
			c.extraKnownMarketplaces = { ponytail: e };
		});
	const named = "extraKnownMarketplaces.ponytail";

	// spec: agent-permissions/a-marketplace-entry-that-follows-the-author-s-default-branch
	test.each([
		["no ref", (e: { source: Record<string, unknown> }) => delete e.source.ref],
		["another tag", (e: { source: Record<string, unknown> }) => (e.source.ref = "v5.3.2")],
	])("an entry with %s is named", (_, change) => {
		expect(entry(change)).toContain(named);
	});

	// spec: agent-permissions/a-marketplace-entry-that-updates-itself
	test.each([
		["autoUpdate true", (e: { autoUpdate?: unknown }) => (e.autoUpdate = true)],
		["no autoUpdate", (e: { autoUpdate?: unknown }) => delete e.autoUpdate],
	])("an entry with %s is named", (_, change) => {
		expect(entry(change)).toContain(named);
	});

	test("the same entry with its keys in another order reports nothing", () => {
		const { source, autoUpdate } = MARKETPLACE;
		expect(report((c) => (c.extraKnownMarketplaces = { ponytail: { autoUpdate, source: { ...source } } }))).toBe("");
	});

	// spec: agent-permissions/a-consumer-s-own-marketplace-beside-the-harness-s
	test("a consumer's own marketplace beside it reports nothing", () => {
		const acme = { source: { source: "github", repo: "acme/tools" } };
		expect(report((c) => (c.extraKnownMarketplaces = { ...c.extraKnownMarketplaces, "acme-tools": acme }))).toBe("");
	});

	// spec: agent-permissions/the-pin-without-its-note
	test("the tag in bun/settings.ts carries the note on the line above, and a fixture without it is named", () => {
		const source = readFileSync(`${import.meta.dir}/settings.ts`, "utf8");
		expect(source).toMatch(/^\s*ref:/m);
		expect(noteless("bun/settings.ts", source)).toEqual([]);
		expect(noteless("x.ts", '\t\trepo: "a/b",\n\t\tref: "v1",\n')).toEqual(["x.ts:2"]);
	});

	// spec: agent-permissions/the-harness-s-own-marketplace-entry
	test("the harness's own settings hold the entry the check compares", () => {
		expect(own().extraKnownMarketplaces.ponytail).toEqual(MARKETPLACE);
	});
});
