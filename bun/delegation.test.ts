import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flat } from "./prose.fixture.ts";
import { root } from "./root.ts";

// spec: delegation/the-rulebook-states-the-rule-where-every-session-reads-it
test("the Rules preamble says how a session delegates to a subagent", () => {
	const rules = readFileSync(join(root, "core", "rules.md"), "utf8");
	const start = rules.indexOf("### Rules");
	expect(start).toBeGreaterThan(-1);
	const end = rules.indexOf("####", start);
	expect(end).toBeGreaterThan(start);
	const preamble = flat(rules.slice(start, end));
	for (const phrase of [
		"a fresh one",
		"forking only when",
		"never into git",
		"nothing the harness already loads",
		"For a subagent that works on a change or a card, open the call's `description` with the slug of the change it carries, or of the card where there is none",
		"name the agent's ID, where the call returns one, beside the change's card, or beside that card when there is no change, in each report",
	]) {
		expect(preamble).toContain(phrase);
	}
});
