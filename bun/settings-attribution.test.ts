/**
 * The attribution half of the policy: Claude Code adds no line to a pull
 * request body and no session link anywhere, and a commit keeps its default
 * `Co-Authored-By` trailer. The value is compared whole.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ATTRIBUTION, settings } from "./settings.ts";
import {
	changed,
	cleanup,
	consumer,
	type Policy,
} from "./settings.fixture.ts";

afterAll(cleanup);

const report = (change: (c: Policy) => void) =>
	settings(consumer(changed(change))).join("\n");
const named = "attribution is not";

describe("the attribution setting", () => {
	// spec: agent-permissions/a-consumer-without-the-setting
	test("settings without it are named [z1]", () => {
		expect(report((c) => delete c.attribution)).toContain(named);
	});

	// spec: agent-permissions/a-consumer-that-hides-the-commit-trailer-too
	test.each([
		["a commit value beside the two [z6]", { ...ATTRIBUTION, commit: "" }],
		["false [z7]", false],
	])("%s is named", (_, value) => {
		expect(report((c) => (c.attribution = value))).toContain(named);
	});

	test.each([
		["a pr of one space [z4]", { pr: " ", sessionUrl: false }],
		["no sessionUrl [z5]", { pr: "" }],
		["a sessionUrl string [z8]", { pr: "", sessionUrl: "false" }],
	])("%s is named", (_, value) => {
		expect(report((c) => (c.attribution = value))).toContain(named);
	});

	// spec: agent-permissions/the-same-value-with-its-keys-in-another-order
	test("the two keys in reverse order report nothing [z3]", () => {
		expect(
			report((c) => (c.attribution = { sessionUrl: false, pr: "" })),
		).toBe("");
	});
});

describe("the harness's own settings", () => {
	// spec: agent-permissions/the-harness-s-own-settings
	test("hold the value the check compares [z9]", () => {
		const own = JSON.parse(
			readFileSync(`${import.meta.dir}/../.claude/settings.json`, "utf8"),
		);
		expect(own.attribution).toEqual(ATTRIBUTION);
	});
});
