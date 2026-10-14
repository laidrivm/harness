import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	after,
	before,
	cleanup,
	failure,
	run,
	temp,
	thrice,
} from "./loop-guard.fixture.ts";

/**
 * When the loop guard refuses a call that failed the same way three times,
 * for how long, and what lets it through. What counts as one call is
 * `loop-guard.test.ts`'s.
 */

afterAll(cleanup);

describe("refusing the call that failed three times", () => {
	// spec: loop-guard/the-fourth-identical-call
	test("the same call under the same prompt exits 2 with the reason [22]", () => {
		const { code, err } = after(thrice());
		expect(code).toBe(2);
		expect(err).toStartWith("loop-guard:");
		expect(err).toContain("Bash");
		expect(err).toContain("3 times");
		expect(err).toContain("change approach");
		expect(err).toContain("`BLOCKED`");
	});

	// spec: loop-guard/the-agent-keeps-calling
	test("a second attempt is refused again [23]", () => {
		const tmp = temp();
		after(thrice(), before(), tmp);
		expect(run(tmp, before()).code).toBe(2);
	});

	// spec: loop-guard/a-sub-agent-s-refused-call
	test.each([
		["its parent's identical call runs [24]", {}, 0],
		["its own identical call is refused", { agent_id: "a1" }, 2],
	])("after a sub-agent's three failures, %s", (_, over, code) => {
		expect(after(thrice({ agent_id: "a1" }), before(over)).code).toBe(code);
	});

	// spec: loop-guard/a-new-prompt
	test("the call under a different `prompt_id` runs [25]", () => {
		expect(after(thrice(), before({ prompt_id: "p2" })).code).toBe(0);
	});

	test("with no `prompt_id` on either side the call is refused [26]", () => {
		const none = { prompt_id: undefined };
		expect(after(thrice(none), before(none)).code).toBe(2);
	});

	// spec: loop-guard/repeats-after-that-warning
	test("a fourth failure under the new prompt bars the call under it", () => {
		const fails = [...thrice(), failure({ prompt_id: "p2" })];
		expect(after(fails, before({ prompt_id: "p2" })).code).toBe(2);
	});

	// spec: loop-guard/a-different-input-after-the-warning
	test.each([
		["a different input [27]", { tool_input: { command: "bun test x" } }],
		["the same input under another tool [28]", { tool_name: "Monitor" }],
	])("%s runs", (_, over) => {
		expect(after(thrice(), before(over)).code).toBe(0);
	});
});

describe("what the guard cannot read or write lets the call through", () => {
	// spec: loop-guard/an-unreadable-count-before-a-call
	test("a garbage count file lets the call through [29]", () => {
		const tmp = temp();
		for (const event of thrice()) run(tmp, event);
		for (const name of readdirSync(join(tmp, "loop-guard")))
			writeFileSync(join(tmp, "loop-guard", name), "garbage");
		expect(run(tmp, before()).code).toBe(0);
	});

	// spec: loop-guard/an-unwritable-count
	test("with the store unwritable, the fourth call runs [21]", () => {
		const tmp = temp();
		writeFileSync(join(tmp, "loop-guard"), ""); // a file where the store goes
		expect(after(thrice(), before(), tmp).code).toBe(0);
	});
});
