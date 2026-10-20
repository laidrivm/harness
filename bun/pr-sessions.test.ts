import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { append, lookup } from "./pr-sessions.ts";

/** The PR → session table's append and lookup. [n]: `ci-run-agent`'s `/zombies` items. */

afterAll(cleanup);

/** A table path under a directory that does not exist yet. */
const table = () => join(emptyDir("pr-sessions-"), "orchestrator", "pr-sessions.jsonl");
const step = (repo: string, branch: string, session: string) => ({ repo, branch, session, clone: "/clones/r" });

describe("a lookup", () => {
	// spec: board-loop/a-step-continued-by-a-second-session
	test("in a missing table finds no session [20]", () => {
		expect(lookup("o/r", "feat/x", table())).toBeUndefined();
	});

	// spec: board-loop/a-step-continued-by-a-second-session
	test("finds the last of two lines for one branch [22]", () => {
		const file = table();
		append(step("o/r", "feat/x", "first"), file);
		append(step("o/r", "feat/x", "second"), file);
		expect(lookup("o/r", "feat/x", file)?.session).toBe("second");
	});

	// spec: board-loop/a-step-continued-by-a-second-session
	test("keeps one branch name in two repositories apart [23]", () => {
		const file = table();
		append(step("o/r", "feat/x", "here"), file);
		append(step("o/other", "feat/x", "there"), file);
		expect([lookup("o/r", "feat/x", file)?.session, lookup("o/other", "feat/x", file)?.session]).toEqual(["here", "there"]);
	});

	// spec: board-loop/a-step-continued-by-a-second-session
	test.each([
		["a line cut off mid-JSON", `{"repo":"o/r","branch":"feat/x","session":"cut`],
		["a line lacking session", `{"repo":"o/r","branch":"feat/x","clone":"/c","at":"2026-10-20T00:00:00.000Z"}`],
		["a line with an empty session", `{"repo":"o/r","branch":"feat/x","session":"","clone":"/c","at":"2026-10-20T00:00:00.000Z"}`],
	])("skips %s and finds the earlier line [24]", (_, bad) => {
		const file = table();
		append(step("o/r", "feat/x", "valid"), file);
		writeFileSync(file, `${readFileSync(file, "utf8")}${bad}\n`);
		expect(lookup("o/r", "feat/x", file)?.session).toBe("valid");
	});
});

describe("an append", () => {
	// spec: board-loop/a-step-ready-to-push
	test("writes one line with every field and an ISO time, creating the directory [21]", () => {
		const file = table();
		append(step("o/r", "feat/x", "s"), file);
		const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
		expect(lines.length).toBe(1);
		const row = JSON.parse(lines[0]);
		expect(Object.keys(row)).toEqual(["repo", "branch", "session", "clone", "at"]);
		expect(new Date(row.at).toISOString()).toBe(row.at);
		// The runner's alone: on the host no session user may read which session carries which pull request.
		expect([statSync(dirname(file)).mode & 0o777, statSync(file).mode & 0o777]).toEqual([0o700, 0o600]);
	});

	// spec: board-loop/the-table-cannot-be-written
	test("throws where the table's directory cannot be made [26]", () => {
		const file = table();
		mkdirSync(dirname(dirname(file)), { recursive: true });
		writeFileSync(dirname(file), "a file where the directory goes");
		expect(() => append(step("o/r", "feat/x", "s"), file)).toThrow();
	});
});
