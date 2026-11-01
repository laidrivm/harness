import { afterAll, describe, expect, test } from "bun:test";
import { realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { change, clone, records, run } from "./board-loop.fixture.ts";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";

/** Each pass's one record and one line. [n]: `/zombies` ideas. */

afterAll(cleanup);

describe("one record and one line per pass", () => {
	// spec: board-loop/every-pass-leaves-a-record
	test("an unwritable state directory changes neither the line nor the exit [28]", () => {
		const { dir } = clone();
		const state = join(emptyDir("board-loop-file-"), "not-a-directory");
		writeFileSync(state, "");
		const r = run(dir, [], {}, { state });
		expect([r.code, r.last]).toEqual([0, "board-loop: met — apply demo step 1"]);
	});

	test("a record names the clone and no commit", () => {
		const { dir } = clone();
		const [loop] = records(run(dir).state);
		expect([loop.project, "commit" in loop]).toEqual([realpathSync(dir), false]);
	});

	const gone = (origin: string) => rmSync(origin, { recursive: true });
	test.each([
		["a fetch that fails", [], gone, {}, "git fetch failed"],
		["a tree board-state rejects", ["ghost"], () => {}, {}, "does not derive a board state"],
		["no claude on PATH", [], () => {}, { claudeCode: null }, "claude could not be started"],
	] as const)("%s refuses the pass", (_, after, arrange, stubs, reason) => {
		const { dir, origin } = clone(change("demo", undefined, [...after]));
		arrange(origin);
		const r = run(dir, [], stubs);
		expect(r.last).toStartWith("board-loop: refused");
		expect(r.last).toContain(reason);
	});

	// spec: board-loop/every-pass-leaves-a-record
	test.each([
		["refused", { install: 1 }, change("demo")],
		["idle", {}, {}],
		["met", {}, change("demo")],
	] as const)("a %s pass leaves exactly one loop record [29]", (decision, stubs, tree) => {
		const { dir } = clone(tree);
		const r = run(dir, [], stubs);
		expect(records(r.state).map((x) => x.decision)).toEqual([decision]);
	});
});
