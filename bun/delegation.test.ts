import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./root.ts";

// spec: delegation/the-rulebook-states-the-rule-where-every-session-reads-it
test("the Rules preamble says how a session delegates to a subagent", () => {
	const rules = readFileSync(join(root, "core", "rules.md"), "utf8");
	const start = rules.indexOf("### Rules");
	expect(start).toBeGreaterThan(-1);
	const preamble = rules.slice(start, rules.indexOf("####", start)).replace(/\s+/g, " ");
	for (const phrase of ["a fresh one", "forking only when", "never into git", "nothing the harness already loads"]) {
		expect(preamble).toContain(phrase);
	}
});
