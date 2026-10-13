import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, event, fabricate, run } from "./command-guard.fixture.ts";
import { pushWords } from "./git-options.ts";

/**
 * A value-taking push option's value is data git sends on, not a switch it
 * acts on: `git push -o --force` forces nothing. Checked against git 2.47.0,
 * whose `git push -h` lists `-o`/`--push-option`, `--repo`, `--receive-pack`,
 * `--exec` and `--recurse-submodules` as taking a value; a short value is the
 * rest of its word or, with none, the next word. What else a push is refused
 * for is `command-guard-push.test.ts`'s.
 */

afterAll(cleanup);

/** The guard's exit code on `command` from a feature branch, and the rule it recorded. */
function guard(command: string): { code: number; rule?: string } {
	const state = fabricate(undefined, "command-guard-state-");
	const env = { ...process.env, XDG_STATE_HOME: state };
	const { code } = run(event(command), fabricate("feat/x"), env);
	const ledger = join(state, "harness", "gates.jsonl");
	if (!existsSync(ledger)) return { code };
	return { code, rule: JSON.parse(readFileSync(ledger, "utf8")).rule };
}

// spec: agent-permissions/a-push-option-whose-value-reads-like-a-force-flag
describe("a push option's value", () => {
	test.each([
		"git push -o --force origin feat/x",
		"git push -o --all origin feat/x",
		"git push --push-option --force-with-lease origin feat/x",
		"git push --push-option=--all origin feat/x",
		"git push -o--force origin feat/x",
		"git push -of origin feat/x",
		"git push -uo --mirror origin feat/x",
		"git push --recurse-submodules --force origin feat/x",
	])("%s is allowed", (command) => {
		expect(guard(command)).toEqual({ code: 0 });
	});
});

// spec: agent-permissions/a-force-flag-beside-a-push-option
describe("the switches beside it", () => {
	test.each([
		["git push -o x --force origin feat/x", "force-push"],
		["git push -o x --force-with-lease origin feat/x", "force-push"],
		["git push -fo x origin feat/x", "force-push"],
		// Negated, it takes no value; abbreviated, it is not recognised — so the
		// word after either is read as a switch.
		["git push --no-push-option --force origin feat/x", "force-push"],
		["git push --push-opt --force origin feat/x", "force-push"],
		["git push -o x --all origin", "unbounded-push"],
		["git push -o--force main", "push-to-main"],
		["git push --push-option=x origin main", "push-to-main"],
	])("%s blocks as %s", (command, rule) => {
		expect(guard(command)).toEqual({ code: 2, rule });
	});
});

describe("pushWords", () => {
	test.each([
		["an attached short value takes no next word", ["-o--force", "x"], ["x"]],
		["an attached long value takes no next word", ["--push-option=a", "x"], ["x"]],
		["a separate value takes the next word", ["-o", "x", "y"], ["y"]],
		["a short group ends at its value", ["-uox", "y"], ["y"]],
	])("%s", (_, args, operands) => {
		expect(pushWords(args).operands).toEqual(operands);
	});

	test("a value never reaches the switches", () => {
		expect(pushWords(["-fo--all", "--repo", "--force"]).switches).toEqual([
			"-f",
			"--repo",
		]);
	});
});
