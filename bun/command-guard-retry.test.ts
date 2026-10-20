import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, verdict } from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses of a `bun test`, or a `bun run` forwarding
 * to a script, that carries `--retry` (design.md D9 of flaky-test-findings).
 * Numbers are the proposal's /zombies items. Every line here is a string the
 * guard reads; none of them is ever run.
 */

afterAll(cleanup);

const refused = (command: string) => {
	const { code, rule } = verdict(command);
	expect({ code, rule }).toEqual({ code: 2, rule: "bun-test-retry" });
};

describe("a test run with a retry", () => {
	// spec: flaky-tests/a-retry-flag
	test("bun test --retry=3 blocks, naming --retry [45, 55]", () => {
		const { code, reason, rule } = verdict("bun test --retry=3");
		expect({ code, rule }).toEqual({ code: 2, rule: "bun-test-retry" });
		expect(reason).toContain("--retry");
	});

	// spec: flaky-tests/a-retry-flag
	test.each([
		["bun test --retry 3", "[46]"],
		["bun --bun test --retry=1 a.test.ts", "[47]"],
		["bun test a.test.ts --retry=1", "[48]"],
		["bun test -t --retry", "[54]"],
		["/usr/local/bin/bun test --retry=1", "[58]"],
	])("%s blocks %s", (line) => refused(line));

	// spec: flaky-tests/a-retry-forwarded-through-a-script
	test.each([
		["bun run test --retry=2", "[49]"],
		["bun run --retry=2 test", "[56]"],
	])("%s blocks %s", (line) => refused(line));

	test.each([
		["cd x && bun test --retry=1", "[53a]"],
		['bash -c "bun test --retry=1"', "[53b]"],
	])("%s blocks %s", (line) => refused(line));
});

describe("a test run the guard lets through", () => {
	// spec: flaky-tests/running-each-test-many-times
	test.each([
		["bun test --rerun-each=20", "[50]"],
		["bun test --retryx", "[51]"],
		["bun test --retries=2", "[51]"],
		["bunx --no-install playwright test --retries=2", "[52]"],
		["bun test", ""],
	])("%s runs %s", (line) => expect(verdict(line).code).toBe(0));
});
