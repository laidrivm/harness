import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup } from "./diff-budget.fixture.ts";
import { change, clone, ONE, run, TICKED } from "./board-loop.fixture.ts";
import { MARK } from "./question-gate.ts";

/**
 * The stage prompt's line on asking the user, against the question gate's
 * mark and `core/feature-workflow.md`'s launch form. [n]: `question-gate-reason`'s
 * `/zombies` ideas.
 */

afterAll(cleanup);

/** The stage session's prompt, line by line, out of the stub `claude`'s calls. */
const stage = (calls: string) => {
	const from = calls.indexOf("\nclaude -p /goal ") + 1;
	expect(from).toBeGreaterThan(0);
	return calls.slice(from, calls.indexOf(" --permission-mode", from)).split("\n");
};

describe("the launch form's question line", () => {
	// spec: stage-goal/a-stage-asks-its-question
	test.each([
		["an apply step [20] [23]", ONE],
		["an answer step [21]", TICKED],
	])("%s: the fourth line names the gate's mark and the comment's form, as the workflow doc does", (_, tasks) => {
		const { dir } = clone(change("demo", tasks));
		const lines = stage(run(dir).calls);
		const doc = readFileSync(join(import.meta.dir, "../core/feature-workflow.md"), "utf8");
		expect(lines).toHaveLength(4);
		for (const part of [MARK, "`page_id`", "`markdown`", "page-level"]) expect(lines[3]).toContain(part);
		// The doc's form closes the shell's single quote on this line.
		expect(doc.split("\n").filter((line) => line.startsWith("A question only the user"))).toEqual([`${lines[3]}'`]);
	});
});
