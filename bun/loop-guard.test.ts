import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
 * What the loop guard counts as one call failing the same way, the warning,
 * and what it records in the gate ledger. Refusing the call is
 * `loop-guard-refuse.test.ts`'s; that the harness registers it is
 * `self-pin.test.ts`'s.
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

	// spec: loop-guard/second-failure
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

	test.each([
		["[14]", { command: "x", timeout: 1 }, { timeout: 1, command: "x" }],
		["at depth", { o: { a: 1, b: 2 } }, { o: { b: 2, a: 1 } }],
	])("inputs differing only in key order are one call %s", (_, one, other) => {
		const fails = [one, other, one].map((i) => failure({ tool_input: i }));
		expect(after(fails, before({ tool_input: other })).code).toBe(2);
	});

	test("a failure reported under another event is not counted", () => {
		const fails = thrice({ hook_event_name: "PostToolUse" });
		expect(after(fails).code).toBe(0);
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

	test("a null `agent_id` is counted as the session's own", () => {
		const fails = [failure(), failure({ agent_id: null }), failure()];
		expect(after(fails).code).toBe(2);
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

/** The `hookSpecificOutput` a run printed on stdout. */
const said = (out: string) => JSON.parse(out).hookSpecificOutput;

describe("the warning", () => {
	// spec: loop-guard/third-failure
	test("a third identical failure adds context naming the tool and 3 [4, 16]", () => {
		const { code, out, err } = after(thrice().slice(0, 2), failure());
		expect({ code, err }).toEqual({ code: 0, err: "" });
		const { hookEventName, additionalContext } = said(out);
		expect(hookEventName).toBe("PostToolUseFailure");
		expect(additionalContext).toStartWith("loop-guard:");
		expect(additionalContext).toContain("Bash");
		expect(additionalContext).toContain("3 times");
		expect(additionalContext).toContain("will be refused");
		expect(additionalContext).toContain("change approach");
		expect(additionalContext).toContain("`BLOCKED`");
	});

	// spec: loop-guard/fails-again-after-a-new-prompt
	test("a fourth identical failure, under a new prompt, warns with 4 [5]", () => {
		const { code, out } = after(thrice(), failure({ prompt_id: "p2" }));
		expect(code).toBe(0);
		expect(said(out).additionalContext).toContain("4 times");
	});

	test("a barred call failing with another error says nothing", () => {
		expect(after(thrice(), failure({ error: "2 skip" }))).toEqual(SILENT);
	});

	test("with the store unwritable, the third failure says nothing", () => {
		const tmp = temp();
		writeFileSync(join(tmp, "loop-guard"), ""); // a file where the store goes
		expect(after(thrice().slice(0, 2), failure(), tmp)).toEqual(SILENT);
	});
});

/** Where the ledger lies in `tmp`, which the fixture makes `XDG_STATE_HOME`. */
const ledger = (tmp: string) => join(tmp, "harness", "gates.jsonl");

describe("the gate ledger", () => {
	// spec: loop-guard/a-warning-then-a-refusal
	test("records the warning [31], then the refusal [32], under one rule", () => {
		const tmp = temp();
		const secret = { tool_input: { command: "echo hunter2" } };
		after(thrice({ ...secret, error: "hunter2!" }), before(secret), tmp);
		const text = readFileSync(ledger(tmp), "utf8");
		const records = text
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(records).toMatchObject([
			{ gate: "loop-guard", decision: "warned", rule: "repeated-failure" },
			{ gate: "loop-guard", decision: "refused", rule: "repeated-failure" },
		]);
		expect(records).toHaveLength(2);
		expect(text).not.toContain("hunter2");
	});

	// spec: loop-guard/a-first-failure
	test("a first and a second failure leave it absent [33]", () => {
		const tmp = temp();
		for (const event of thrice().slice(0, 2)) run(tmp, event);
		expect(existsSync(ledger(tmp))).toBe(false);
	});

	test("a call the guard lets run leaves it absent", () => {
		const tmp = temp();
		run(tmp, before());
		expect(existsSync(ledger(tmp))).toBe(false);
	});

	test("unwritable, the warning and the refusal are unchanged [34]", () => {
		const events = [...thrice(), before()];
		const answers = (tmp: string) => events.map((event) => run(tmp, event));
		const unwritable = temp();
		// A file where the ledger's directory goes.
		writeFileSync(join(unwritable, "harness"), "");
		const written = answers(temp());
		expect(written[2]?.out).toContain("additionalContext");
		expect(written[3]?.code).toBe(2);
		expect(answers(unwritable)).toEqual(written);
	});
});
