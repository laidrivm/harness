import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	after,
	base,
	before,
	cleanup,
	env,
	failure,
	kept,
	run,
	SILENT,
	script,
	temp,
	thrice,
} from "./loop-guard.fixture.ts";

/**
 * What the loop guard counts as one call failing the same way, and its
 * registrations. Refusing the call is `loop-guard-refuse.test.ts`'s.
 */

afterAll(cleanup);

const input = (over: object) => ({ tool_input: { command: "x", ...over } });

describe("what counts as one call failing the same way", () => {
	test("a first failure exits 0 with no output [1]", () => {
		expect(run(temp(), failure())).toEqual(SILENT);
	});

	test("a call with no count yet exits 0 with no output [2]", () => {
		expect(run(temp(), before())).toEqual(SILENT);
	});

	test("a second identical failure gives no output [3]", () => {
		const tmp = temp();
		run(tmp, failure());
		expect(run(tmp, failure())).toEqual(SILENT);
	});

	// spec: loop-guard/the-same-command-fails-the-same-way-three-times
	test.each([
		["only in a duration [9]", ["in 120ms", "in 7ms", "in 4031ms"]],
		["only in whitespace [10]", ["1 fail ", "1  fail", "1\tfail\n"]],
	])("errors differing %s are one call", (_, errors) => {
		const fails = errors.map((error) => failure({ error }));
		expect(after(fails).code).toBe(2);
	});

	// spec: loop-guard/a-different-error
	test("errors differing in a word are two calls [11]", () => {
		const fails = ["1 fail", "1 skip", "1 fail"].map((error) =>
			failure({ error }),
		);
		expect(after(fails).code).toBe(0);
	});

	// spec: loop-guard/only-the-description-differs
	test("inputs differing only in `description` are one call [12]", () => {
		const fails = ["a", "b", "c"].map((d) =>
			failure(input({ description: d })),
		);
		expect(after(fails, before(input({ description: "d" }))).code).toBe(2);
	});

	// spec: loop-guard/a-different-input
	test("inputs differing in `timeout` are two calls [13]", () => {
		const fails = [1000, 2000, 1000].map((t) =>
			failure(input({ timeout: t })),
		);
		expect(after(fails, before(input({ timeout: 1000 }))).code).toBe(0);
	});

	test("inputs differing only in key order are one call [14]", () => {
		const one = { tool_input: { command: "x", timeout: 1 } };
		const other = { tool_input: { timeout: 1, command: "x" } };
		const fails = [one, other, one].map((over) => failure(over));
		expect(after(fails, before(other)).code).toBe(2);
	});

	test.each([
		["the first", base.tool_input, 2],
		["the second", { command: "bun run x" }, 0],
	])("two calls failing alternately keep separate counts: %s [6]", (_, call, code) => {
		const other = { tool_input: { command: "bun run x" } };
		const fails = [{}, other, {}, other, {}].map((over) => failure(over));
		expect(after(fails, before({ tool_input: call })).code).toBe(code);
	});

	// spec: loop-guard/a-sub-agent-and-its-parent
	test.each([
		["another session [7]", { session_id: "s2" }],
		["a sub-agent", { agent_id: "a1" }],
	])("a failure in %s is counted apart", (_, over) => {
		expect(after([failure(), failure(over), failure()]).code).toBe(0);
	});

	test("two processes recording at once leave a count that parses [8]", async () => {
		const tmp = temp();
		const calls = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
			Bun.spawn(["bun", script], {
				cwd: tmp,
				env: env(tmp),
				stdin: Buffer.from(
					JSON.stringify(failure(input({ command: "x".repeat(n * 50) }))),
				),
			}),
		);
		await Promise.all(calls.map((call) => call.exited));
		expect(() => kept(tmp).map((text) => JSON.parse(text))).not.toThrow();
	});

	test.each([
		["holding `/` and `..` [15]", { session_id: "../s1" }],
		["of a sub-agent holding `..`", { agent_id: "../a1" }],
	])("an id %s decides nothing", (_, over) => {
		expect(after(thrice(over), before(over)).code).toBe(0);
	});

	test("the count holds no substring of the input or the error [17]", () => {
		const tmp = temp();
		const secret = {
			tool_input: { command: "echo hunter2" },
			error: "hunter2!",
		};
		for (const event of thrice(secret)) run(tmp, event);
		expect(kept(tmp).join("\n")).not.toContain("hunter2");
	});

	// spec: loop-guard/an-interrupted-call
	test("an interrupted call is not counted [18]", () => {
		expect(after(thrice({ is_interrupt: true })).code).toBe(0);
	});

	// spec: loop-guard/an-unreadable-event
	test("an event that is not JSON exits 0 with no output [19, 30]", () => {
		expect(run(temp(), "not json")).toEqual(SILENT);
	});

	test("failures with no `session_id` decide nothing [20]", () => {
		const none = { session_id: undefined };
		expect(after(thrice(none), before(none))).toEqual(SILENT);
	});
});

describe("the registrations in this repository's settings", () => {
	test.each(["PostToolUseFailure", "PreToolUse"])(
		"%s runs the guard for every tool, failing open",
		(event) => {
			const { hooks } = JSON.parse(
				readFileSync(`${import.meta.dir}/../.claude/settings.json`, "utf8"),
			);
			expect(hooks[event]).toContainEqual({
				hooks: [
					{
						type: "command",
						command: 'bun "$CLAUDE_PROJECT_DIR/bun/loop-guard.ts"',
					},
				],
			});
		},
	);
});
