import { afterAll, expect, test } from "bun:test";
import { cleanup, gate, repo, tasks } from "./diff-budget.fixture.ts";

/**
 * Ticking a task box changes state rather than content, and only that flip is
 * free. Every case here is about what pairs with what: a pair is one file, one
 * text, opposite boxes, and everything else is read like any other line.
 */

afterAll(cleanup);

test("ticking task boxes counts zero", () => {
	const g = gate(
		repo({ "tasks.md": tasks(30, " ") }, { "tasks.md": tasks(30, "x") }),
	);
	expect(g.total).toBe(0);
});

test("unticking counts zero too", () => {
	const g = gate(
		repo({ "tasks.md": tasks(12, "x") }, { "tasks.md": tasks(12, " ") }),
	);
	expect(g.total).toBe(0);
});

test("newly authored task lines are counted", () => {
	const g = gate(repo({ "a.ts": "one\n" }, { "tasks.md": tasks(60, " ") }));
	expect(g.total).toBe(60);
});

test("a task line whose text was rewritten is counted, not cancelled", () => {
	const g = gate(
		repo(
			{ "tasks.md": "- [ ] write the parser\n- [ ] keep me\n" },
			{ "tasks.md": "- [x] write the tokeniser\n- [ ] keep me\n" },
		),
	);
	expect(g.total).toBe(2);
});

test("an identical task line moved between files is counted on both sides", () => {
	const g = gate(
		repo(
			{ "a/tasks.md": "- [ ] write the parser\n", "b/tasks.md": "keep\n" },
			{ "a/tasks.md": "\n", "b/tasks.md": "keep\n- [x] write the parser\n" },
		),
	);
	// The removal, the addition, and the blank line left behind in a/.
	expect(g.total).toBe(3);
});

test("a task line moved with its box unchanged is counted on both sides", () => {
	const g = gate(
		repo(
			{ "tasks.md": "- [x] write the parser\nmiddle\n" },
			{ "tasks.md": "middle\n- [x] write the parser\n" },
		),
	);
	expect(g.total).toBe(2);
});

test("the same task text ticked in two files pairs within each", () => {
	const both = (box: " " | "x") => `- [${box}] write the parser\n`;
	const g = gate(
		repo(
			{ "a/tasks.md": both(" "), "b/tasks.md": both(" ") },
			{ "a/tasks.md": both("x"), "b/tasks.md": both("x") },
		),
	);
	expect(g.total).toBe(0);
});

test("an indented task line pairs on a tick", () => {
	const g = gate(
		repo(
			{ "PLAN.md": "  - [ ] **5.1 slicing rules** — rules only\n" },
			{ "PLAN.md": "  - [x] **5.1 slicing rules** — rules only\n" },
		),
	);
	expect(g.total).toBe(0);
});

test("re-indenting a task line is a change, not a tick", () => {
	const g = gate(
		repo(
			{ "tasks.md": "- [x] write the parser\n" },
			{ "tasks.md": "    - [x] write the parser\n" },
		),
	);
	expect(g.total).toBe(2);
});

test("an uppercase box pairs with a lowercase one", () => {
	const g = gate(
		repo(
			{ "tasks.md": "- [ ] write the parser\n" },
			{ "tasks.md": "- [X] write the parser\n" },
		),
	);
	expect(g.total).toBe(0);
});
