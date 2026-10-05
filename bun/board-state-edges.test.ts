/**
 * What each unapplied change is waiting on, read from the `after:` list in its
 * `.openspec.yaml`. Blocked is computed every time it is asked for, so no case
 * stores it and none goes stale when its predecessor is archived.
 *
 * What an ordering the derivation cannot read is refused for is
 * `board-state-refusals.test.ts`'s — the two together are over the file cap,
 * and the seam is whether the tree derives an answer at all.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	archived,
	cleanup,
	complete,
	fabricate,
} from "./board-state.fixture.ts";
import { boardState } from "./board-state.ts";
import { root } from "./root.ts";

afterAll(cleanup);

/** A change whose `.openspec.yaml` carries `after`, written as `yaml` says. */
const ordered = (slug: string, after: string) =>
	complete(slug, `schema: spec-driven\nafter: ${after}\n`);

// spec: task-board/a-change-whose-predecessor-has-not-landed
describe("a predecessor that has not landed", () => {
	test("blocks the change, naming the slug that blocks it", () => {
		const tree = fabricate({
			...ordered("score-calibration", "[outcome-calibration]"),
			...complete("outcome-calibration"),
		});
		expect(boardState(tree).edges["score-calibration"]).toEqual({
			after: ["outcome-calibration"],
			blocking: ["outcome-calibration"],
		});
	});

	test("a predecessor at proposing blocks as one at proposed does", () => {
		const half = complete("outcome-calibration");
		delete half["openspec/changes/outcome-calibration/tasks.md"];
		const tree = fabricate({
			...ordered("score-calibration", "[outcome-calibration]"),
			...half,
		});
		expect(boardState(tree).edges["score-calibration"]?.blocking).toEqual([
			"outcome-calibration",
		]);
	});

	test("only the predecessors that have not landed are named", () => {
		const tree = fabricate({
			...ordered("beta-refit", "[hero-aliases-seed, outcome-calibration]"),
			...complete("hero-aliases-seed"),
			...archived("2026-08-25", "outcome-calibration"),
		});
		expect(boardState(tree).edges["beta-refit"]).toEqual({
			after: ["hero-aliases-seed", "outcome-calibration"],
			blocking: ["hero-aliases-seed"],
		});
	});
});

// spec: task-board/a-change-whose-predecessors-have-all-landed
describe("predecessors that have all landed", () => {
	test("report the change takeable and leave the after: list standing", () => {
		const tree = fabricate({
			...ordered("score-calibration", "[outcome-calibration]"),
			...archived("2026-08-25", "outcome-calibration"),
		});
		expect(boardState(tree).edges["score-calibration"]).toEqual({
			after: ["outcome-calibration"],
			blocking: [],
		});
	});
});

// spec: task-board/a-change-with-no-ordering-constraint
describe("a change naming no predecessor", () => {
	test("an absent after: key reports takeable rather than malformed", () => {
		const tree = fabricate(complete("focus-restore-idiom"));
		expect(boardState(tree).edges["focus-restore-idiom"]).toEqual({
			after: [],
			blocking: [],
		});
	});

	test("an absent .openspec.yaml reports takeable rather than malformed", () => {
		const whole = complete("focus-restore-idiom");
		delete whole["openspec/changes/focus-restore-idiom/.openspec.yaml"];
		expect(boardState(fabricate(whole)).edges["focus-restore-idiom"]).toEqual({
			after: [],
			blocking: [],
		});
	});

	test("an empty after: list reports takeable", () => {
		const tree = fabricate(ordered("focus-restore-idiom", "[]"));
		expect(boardState(tree).edges["focus-restore-idiom"]?.blocking).toEqual([]);
	});

	test("an empty .openspec.yaml reports takeable rather than malformed", () => {
		// YAML parses an empty document to `null`, which is neither a mapping
		// carrying no `after:` nor a shape worth reporting.
		expect(
			boardState(fabricate(complete("focus-restore-idiom", ""))).edges[
				"focus-restore-idiom"
			],
		).toEqual({ after: [], blocking: [] });
	});
});

describe("what carries no edges at all", () => {
	test("an archived slug gets no key, its ordering being spent", () => {
		const tree = fabricate({
			...ordered("score-calibration", "[outcome-calibration]"),
			...archived("2026-08-25", "outcome-calibration"),
		});
		const { edges } = boardState(tree);
		expect(Object.hasOwn(edges, "outcome-calibration")).toBe(false);
		expect(Object.keys(edges)).toEqual(["score-calibration"]);
	});
});

describe("a change that is not yet complete", () => {
	test("still declares its predecessors and is still blocked by them", () => {
		// Edges are read from `.openspec.yaml`, which a half-written directory
		// carries as readily as a finished one — deriving them only for what is
		// `proposed` would leave a proposing change's ordering unreadable
		// exactly while it is being argued.
		const half = ordered("laning-phase-model", "[candidacy-gate]");
		delete half["openspec/changes/laning-phase-model/tasks.md"];
		const tree = fabricate({ ...half, ...complete("candidacy-gate") });
		const state = boardState(tree);
		expect(state.status["laning-phase-model"]).toBe("proposing");
		expect(state.edges["laning-phase-model"]).toEqual({
			after: ["candidacy-gate"],
			blocking: ["candidacy-gate"],
		});
	});
});

describe("this repository's own ordering", () => {
	// Every case above fabricates its tree, so a typo in one of the seven
	// `.openspec.yaml` files this repository actually carries is caught by
	// nothing here — it would surface as an unrelated case throwing somewhere
	// else, which is the shape of a failure nobody reads.
	//
	// Derived inside each case rather than in this block: a throw while the
	// block is being collected takes both cases out of the run, and bun
	// reports the smaller number as a pass. A typo has to fail a case, not
	// remove it.
	test("every after: entry names a change the tree holds", () => {
		const derived = boardState(root);
		for (const [slug, { after }] of Object.entries(derived.edges))
			for (const entry of after)
				expect([slug, entry, Object.hasOwn(derived.status, entry)]).toEqual([
					slug,
					entry,
					true,
				]);
	});

	test("eight changes declare a predecessor and the rest declare none", () => {
		const declaring = Object.entries(boardState(root).edges)
			.filter(([, { after }]) => after.length > 0)
			.map(([slug]) => slug)
			.sort();
		expect(declaring).toEqual([
			"beta-refit",
			"extract-harness",
			"lane-synergy-model",
			"laning-phase-model",
			"outcome-calibration",
			"score-calibration",
			"side-and-phase-deltas",
			"suggestion-calibration",
		]);
	});
});
