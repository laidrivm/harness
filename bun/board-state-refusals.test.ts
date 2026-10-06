/**
 * What an ordering the derivation cannot read is refused for: an `after:`
 * naming a slug the tree does not hold, one that is not a list of slugs, a
 * document that is not YAML, and a ring no order satisfies.
 *
 * Beside `board-state-edges.test.ts`, which asserts what a readable ordering
 * derives. Every case here ends in a throw, and the message is the subject:
 * the derivation names the file and the slug so its reader is not sent back
 * to the tree to find out which.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	archived,
	cleanup,
	complete,
	fabricate,
} from "./board-state.fixture.ts";
import { boardState } from "./board-state.ts";

afterAll(cleanup);

/** A change whose `.openspec.yaml` carries `after`, written as `yaml` says. */
const ordered = (slug: string, after: string) =>
	complete(slug, `schema: spec-driven\nafter: ${after}\n`);

// spec: task-board/an-after-naming-a-slug-that-does-not-exist
describe("an after: naming a slug the tree does not hold", () => {
	test("fails naming the slug and the file, rather than reading it as landed", () => {
		const tree = fabricate(
			ordered("score-calibration", "[outcome-calibraton]"),
		);
		expect(() => boardState(tree)).toThrow(/outcome-calibraton/);
		expect(() => boardState(tree)).toThrow(
			/openspec\/changes\/score-calibration\/\.openspec\.yaml/,
		);
	});

	test("an archived slug resolves, the archive being where landed work sits", () => {
		const tree = fabricate({
			...ordered("score-calibration", "[outcome-calibration]"),
			...archived("2026-08-25", "outcome-calibration"),
		});
		expect(() => boardState(tree)).not.toThrow();
	});
});

// spec: task-board/an-after-that-is-not-a-list
describe("an after: that is not a list", () => {
	test("a bare string fails naming the file, and its characters are not walked", () => {
		const tree = fabricate(ordered("score-calibration", "outcome-calibration"));
		let said = "";
		try {
			boardState(tree);
		} catch (error) {
			said = error instanceof Error ? error.message : String(error);
		}
		expect(said).toContain("openspec/changes/score-calibration/.openspec.yaml");
		expect(said).toContain("bare string");
		// The characters a walk would have yielded, each of which would then be
		// reported as a slug naming nothing — a typo in a file whose real defect
		// is its shape.
		expect(said).not.toContain(" o,");
		expect(said).not.toMatch(/names o\b/);
	});

	test("a mapping fails naming the file", () => {
		const tree = fabricate(
			complete(
				"score-calibration",
				"schema: spec-driven\nafter:\n  outcome-calibration: true\n",
			),
		);
		expect(() => boardState(tree)).toThrow(
			/score-calibration\/\.openspec\.yaml/,
		);
	});

	test("a list holding something that is not a slug fails naming the file", () => {
		const tree = fabricate(ordered("score-calibration", "[7]"));
		expect(() => boardState(tree)).toThrow(
			/score-calibration\/\.openspec\.yaml/,
		);
	});

	test("a file that is not YAML at all fails naming the file", () => {
		const tree = fabricate(
			complete("score-calibration", "after: [a\n  - unclosed: {\n"),
		);
		// "not YAML" as well as the path: every other case in this block also
		// throws naming that file, so the path alone would pass on a parse that
		// succeeded and failed further down for a different reason.
		expect(() => boardState(tree)).toThrow(
			/score-calibration\/\.openspec\.yaml: not YAML/,
		);
	});
});

describe("more than one defect in one tree", () => {
	test("every problem is reported, not only the first the sweep reaches", () => {
		const tree = fabricate({
			...ordered("score-calibration", "[a-slug-that-is-nowhere]"),
			...ordered("beta-refit", "outcome-calibration"),
			"openspec/changes/archive/not-a-dated-name/p.md": "",
		});
		let said = "";
		try {
			boardState(tree);
		} catch (error) {
			said = error instanceof Error ? error.message : String(error);
		}
		// Three unrelated defects: a throw at the first would report one and
		// send the reader back for the other two a run at a time.
		expect(said).toContain("a-slug-that-is-nowhere");
		expect(said).toContain("bare string");
		expect(said).toContain("not-a-dated-name");
	});
});

describe("an ordering that contradicts itself", () => {
	test("a change named in its own after: is reported rather than left blocked", () => {
		const tree = fabricate(ordered("score-calibration", "[score-calibration]"));
		expect(() => boardState(tree)).toThrow(/score-calibration/);
	});

	test("a three-change ring is reported whole, naming all three", () => {
		const tree = fabricate({
			...ordered("beta-refit", "[score-calibration]"),
			...ordered("score-calibration", "[side-and-phase-deltas]"),
			...ordered("side-and-phase-deltas", "[beta-refit]"),
		});
		let said = "";
		try {
			boardState(tree);
		} catch (error) {
			said = error instanceof Error ? error.message : String(error);
		}
		for (const slug of [
			"beta-refit",
			"score-calibration",
			"side-and-phase-deltas",
		])
			expect(said).toContain(slug);
		expect(
			said.split("\n").filter((line) => line.includes("cycle")).length,
		).toBe(1);
	});

	test("a ring reached from outside it is still reported once", () => {
		// The cases above start the sweep on a member. Entering from a change
		// that is not in the ring is what exercises the settled set: without it
		// the walk re-enters the ring from each remaining root and names it
		// again.
		const tree = fabricate({
			...ordered("suggestion-calibration", "[beta-refit]"),
			...ordered("beta-refit", "[score-calibration]"),
			...ordered("score-calibration", "[beta-refit]"),
		});
		let said = "";
		try {
			boardState(tree);
		} catch (error) {
			said = error instanceof Error ? error.message : String(error);
		}
		expect(
			said.split("\n").filter((line) => line.includes("cycle")).length,
		).toBe(1);
		expect(said).toContain("beta-refit");
		expect(said).toContain("score-calibration");
	});

	test("a two-change cycle is reported, naming both", () => {
		const tree = fabricate({
			...ordered("laning-phase-model", "[suggestion-calibration]"),
			...ordered("suggestion-calibration", "[laning-phase-model]"),
		});
		let said = "";
		try {
			boardState(tree);
		} catch (error) {
			said = error instanceof Error ? error.message : String(error);
		}
		expect(said).toContain("laning-phase-model");
		expect(said).toContain("suggestion-calibration");
		// Once, from whichever member the sweep reaches first: a cycle reported
		// once per member reads as two arguments rather than as one.
		expect(
			said.split("\n").filter((line) => line.includes("cycle")).length,
		).toBe(1);
	});
});
