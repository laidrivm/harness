/**
 * The `gh run` writes the policy asks about (flaky-test-findings D8): re-run,
 * cancel and delete, each with the subcommand first and after a flag. Beside
 * `settings.test.ts`, which is near its cap.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { ASK, settings } from "./settings.ts";
import { changed, cleanup, consumer } from "./settings.fixture.ts";

afterAll(cleanup);

const GH_RUN = [
	"Bash(gh run rerun *)",
	"Bash(gh run * rerun *)",
	"Bash(gh run cancel *)",
	"Bash(gh run * cancel *)",
	"Bash(gh run delete *)",
	"Bash(gh run * delete *)",
];

/** A `Bash(…)` rule as Claude Code matches it: `*` is any text, and a trailing ` *` may be empty. */
const matches = (entry: string, command: string) => {
	const body = entry.slice("Bash(".length, -1).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${body.replace(/ \*$/, "( .*)?").replace(/\*/g, ".*")}$`).test(command);
};

describe("the gh run ask entries", () => {
	// spec: agent-permissions/re-running-a-failed-run agent-permissions/a-flag-before-the-subcommand agent-permissions/cancelling-or-deleting-a-run
	test("ASK holds each write in both forms, after the manifest entries (plan review)", () => {
		expect(ASK.slice(-GH_RUN.length)).toEqual(GH_RUN);
		for (const command of ["gh run rerun 1", "gh run -R o/r rerun 1", "gh run rerun", "gh run cancel 1", "gh run delete 1"])
			expect(ASK.some((entry) => matches(entry, command))).toBe(true);
	});

	// spec: agent-permissions/reading-a-run
	test.each(["gh run view 123 --log-failed", "gh run list", "gh run watch 123"])(
		"no ask entry matches %s (plan review)",
		(command) => expect(ASK.filter((entry) => matches(entry, command))).toEqual([]),
	);

	// spec: agent-permissions/an-entry-is-dropped
	test("an ask list without Bash(gh run * rerun *) fails the check [75]", () => {
		const config = changed((c) => {
			c.permissions.ask = c.permissions.ask.filter((e) => e !== "Bash(gh run * rerun *)");
		});
		expect(settings(consumer(config)).join("\n")).toContain("the Bash ask list is not");
	});

	test("the bun --help check passes with the gh entries and names none of them [77]", () => {
		const problems = settings(consumer(changed(() => {})));
		expect(problems).toEqual([]);
	});

	test("a consumer's own Bash(gh run *) allow entry is not gated and allowed back [78]", () => {
		const config = changed((c) => c.permissions.allow.push("Bash(gh run *)"));
		expect(settings(consumer(config)).join("\n")).not.toContain("gh run");
	});
});
