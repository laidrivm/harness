/**
 * The question gate on a machine with the ask settings: a question goes to the
 * ask command, in any session, and every other call is decided as before.
 * The gate reads whether the file exists and nothing else. [n]: the
 * `/zombies` list of the extension's pull request.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOW, asked, cleanup, run, scratch } from "./question-gate.fixture.ts";
import { RUNNER_ASKS } from "./question-gate.ts";

afterAll(cleanup);

/** A config home whose `harness/notion-ask.json` is `kind`, or absent. */
function config(kind?: "file" | "empty" | "directory"): { XDG_CONFIG_HOME: string } {
	const dir = scratch();
	mkdirSync(join(dir, "harness"));
	const path = join(dir, "harness/notion-ask.json");
	if (kind === "directory") mkdirSync(path);
	else if (kind) writeFileSync(path, kind === "file" ? "{}" : "");
	return { XDG_CONFIG_HOME: dir };
}

describe("a question on a machine with the ask settings", () => {
	// spec: agent-permissions/a-question-on-a-machine-with-the-ask-settings
	test.each([
		["a settings file [57]", "file"],
		["an empty file, counted as present [58]", "empty"],
		["a directory at the path, since the gate reads existence alone [59]", "directory"],
	] as const)("%s: deny naming the ask command, recorded refused under ask", (_, kind) => {
		const { code, out, ledger } = run(asked(), undefined, config(kind));
		const answer = JSON.parse(out).hookSpecificOutput.decision;
		expect([code, answer.behavior]).toEqual([0, "deny"]);
		expect(answer.message).toContain("notion-ask.ts");
		expect(ledger).toEqual([expect.objectContaining({ decision: "refused", rule: "ask" })]);
	});

	// spec: agent-permissions/a-question-in-a-session-the-runner-asks-for
	test("the runner's variable decides first [61]", () => {
		const { ledger } = run(asked(), undefined, { ...config("file"), [RUNNER_ASKS.name]: RUNNER_ASKS.value });
		expect(ledger).toEqual([expect.objectContaining({ decision: "refused", rule: "runner" })]);
	});
});

describe("every other call is decided as before", () => {
	// spec: agent-permissions/no-ask-settings
	test("no settings file: a question is allowed [56]", () => {
		expect(JSON.parse(run(asked(), undefined, config()).out)).toEqual(ALLOW);
	});

	// spec: agent-permissions/a-comment-that-is-not-a-question
	test("a reply gets no answer, recorded passed [60]", () => {
		const { out, ledger } = run(asked({ discussion_id: "discussion://a/b/c" }), undefined, config("file"));
		expect({ out, ledger }).toEqual({ out: "", ledger: [expect.objectContaining({ decision: "passed", rule: "reply" })] });
	});
});
