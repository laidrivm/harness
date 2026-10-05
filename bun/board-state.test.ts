/**
 * The three statuses `board-state.ts` derives, and the five it never
 * reports. Every case but the last builds its own tree: this repository's
 * changes directory is the subject of one case and the fixture of none.
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

/** The four artefacts, minus one, so each absence is one case's subject. */
const without = (slug: string, artefact: string) => {
	const whole = complete(slug);
	delete whole[`openspec/changes/${slug}/${artefact}`];
	return whole;
};

// spec: task-board/a-complete-change-directory-no-step-applied
describe("a change directory holding all four artefacts", () => {
	test("derives proposed", () => {
		const tree = fabricate(complete("candidacy-gate"));
		expect(boardState(tree).status).toEqual({ "candidacy-gate": "proposed" });
	});

	test("derives proposed with every task box ticked, the boxes being unread", () => {
		const whole = complete("candidacy-gate");
		whole["openspec/changes/candidacy-gate/tasks.md"] = "- [x] 1.1 done\n";
		expect(boardState(fabricate(whole)).status["candidacy-gate"]).toBe(
			"proposed",
		);
	});
});

// spec: task-board/a-change-directory-missing-an-artefact
describe("a change directory missing one artefact", () => {
	for (const artefact of ["proposal.md", "design.md", "tasks.md"]) {
		test(`derives proposing without ${artefact}`, () => {
			const tree = fabricate(without("candidacy-gate", artefact));
			expect(boardState(tree).status["candidacy-gate"]).toBe("proposing");
		});
	}
});

// spec: task-board/a-change-directory-whose-specs-is-empty
describe("a change directory whose specs/ holds no delta", () => {
	test("derives proposing where the directory is empty", () => {
		const whole = without("candidacy-gate", "specs/a-capability/spec.md");
		whole["openspec/changes/candidacy-gate/specs/"] = "";
		expect(boardState(fabricate(whole)).status["candidacy-gate"]).toBe(
			"proposing",
		);
	});

	test("derives proposing where the directory is absent", () => {
		const tree = fabricate(
			without("candidacy-gate", "specs/a-capability/spec.md"),
		);
		expect(boardState(tree).status["candidacy-gate"]).toBe("proposing");
	});

	test("derives proposing where the directory holds no markdown", () => {
		const whole = without("candidacy-gate", "specs/a-capability/spec.md");
		whole["openspec/changes/candidacy-gate/specs/a-capability/notes.txt"] = "";
		expect(boardState(fabricate(whole)).status["candidacy-gate"]).toBe(
			"proposing",
		);
	});

	test("derives proposed from a delta at any depth, the walk being recursive", () => {
		const whole = without("candidacy-gate", "specs/a-capability/spec.md");
		whole["openspec/changes/candidacy-gate/specs/a/deeper/spec.md"] = "";
		expect(boardState(fabricate(whole)).status["candidacy-gate"]).toBe(
			"proposed",
		);
	});
});

// spec: task-board/an-archived-change
describe("a change the archive holds", () => {
	test("derives done", () => {
		const tree = fabricate(archived("2026-08-25", "repo-layout"));
		expect(boardState(tree).status).toEqual({ "repo-layout": "done" });
	});

	test("derives done though a directory for the slug also stands unapplied", () => {
		const tree = fabricate({
			...complete("repo-layout"),
			...archived("2026-08-25", "repo-layout"),
		});
		expect(boardState(tree).status["repo-layout"]).toBe("done");
	});

	test("derives done for its own slug and not for one the slug prefixes", () => {
		const tree = fabricate({
			...archived("2026-08-01", "archive"),
			...complete("archive-preflight"),
		});
		expect(boardState(tree).status).toEqual({
			archive: "done",
			"archive-preflight": "proposed",
		});
	});

	test("an entry not named <date>-<slug> is reported, naming the directory", () => {
		const tree = fabricate({ "openspec/changes/archive/repo-layout/x.md": "" });
		expect(() => boardState(tree)).toThrow(/archive\/repo-layout/);
	});

	test("an entry whose date is not four-two-two is reported too", () => {
		// The case above carries no date at all, so nothing exercises the digit
		// counts: a looser `\d+` would still read `2026-8-25-x` as an archive
		// and derive `done` for a slug spelled `25-x`.
		const tree = fabricate({ "openspec/changes/archive/2026-8-25-x/p.md": "" });
		expect(() => boardState(tree)).toThrow(/2026-8-25-x/);
	});
});

// spec: task-board/a-slug-reported-at-no-status-at-all
// spec: task-board/a-status-the-tree-cannot-see
describe("what the derivation reports nothing for", () => {
	test("an empty changes directory derives nothing and is not an error", () => {
		const tree = fabricate({ "openspec/changes/": "" });
		expect(boardState(tree)).toEqual({ status: {}, edges: {} });
	});

	test("a tree with no changes directory at all does the same", () => {
		// Distinct from the case above, and reached by every run from a root
		// that is not a repository: absent and empty must not be told apart by
		// one throwing.
		expect(boardState(fabricate({ "README.md": "" }))).toEqual({
			status: {},
			edges: {},
		});
	});

	test("an archive directory holding nothing derives no done and reports nothing", () => {
		const tree = fabricate({
			...complete("candidacy-gate"),
			"openspec/changes/archive/": "",
		});
		expect(boardState(tree).status).toEqual({ "candidacy-gate": "proposed" });
	});

	test("a slug named for an inherited key is still reported", () => {
		// Every key is a directory name off the filesystem, so the records are
		// prototype-free: on a plain object `status["__proto__"] = "proposed"`
		// calls the inherited setter, stores nothing, and drops the slug in
		// silence.
		const tree = fabricate({
			...complete("__proto__"),
			...complete("constructor"),
		});
		// Read through a `Map` rather than by key, because neither spelling of
		// the key works here: `{ __proto__: "proposed" }` as an expectation sets
		// the prototype and yields `{}`, which is the same trap one level up,
		// and `status["__proto__"]` is what `noProto` refuses. `Object.entries`
		// carries an own key of either name out intact.
		const derived = new Map(Object.entries(boardState(tree).status));
		expect([...derived.keys()].sort()).toEqual(["__proto__", "constructor"]);
		expect(derived.get("__proto__")).toBe("proposed");
		expect(derived.get("constructor")).toBe("proposed");
	});

	test("a plain file under changes/ is skipped rather than read as a change", () => {
		const tree = fabricate({
			...complete("candidacy-gate"),
			"openspec/changes/notes.md": "",
		});
		expect(Object.keys(boardState(tree).status)).toEqual(["candidacy-gate"]);
	});

	test("a slug the tree cannot see carries no key, rather than idea", () => {
		const state = boardState(fabricate(complete("candidacy-gate")));
		expect(Object.hasOwn(state.status, "a-finding-nobody-proposed")).toBe(
			false,
		);
		expect(Object.values(state.status)).not.toContain("idea");
	});

	test("no key carries any of the six statuses moved by hand", () => {
		const state = boardState(
			fabricate({
				...complete("candidacy-gate"),
				...archived("2026-08-25", "repo-layout"),
			}),
		);
		for (const hand of [
			"idea",
			"exploring",
			"explored",
			"applying",
			"applied",
			"archiving",
		])
			expect(Object.values(state.status)).not.toContain(hand);
	});
});

describe("a sweep over a whole tree", () => {
	test("gives every slug exactly one status, omitting none and doubling none", () => {
		const changes = Array.from({ length: 20 }, (_, n) => `open-${n}`);
		const archives = Array.from({ length: 30 }, (_, n) => `shipped-${n}`);
		const tree = fabricate(
			Object.assign(
				{},
				...changes.map((slug) => complete(slug)),
				...archives.map((slug) => archived("2026-08-25", slug)),
			),
		);
		const { status } = boardState(tree);
		expect(Object.keys(status).length).toBe(50);
		for (const slug of changes) expect(status[slug]).toBe("proposed");
		for (const slug of archives) expect(status[slug]).toBe("done");
	});
});

describe("a change whose .openspec.yaml is not a mapping", () => {
	test("a bare scalar document fails naming the file", () => {
		// Not the same as `after:` holding a scalar, which is step 3's case: the
		// whole document is one here, so every key reads `undefined` and the
		// file would otherwise pass as declaring no predecessor at all.
		const tree = fabricate(complete("score-calibration", "just a string\n"));
		expect(() => boardState(tree)).toThrow(/is not a mapping of keys/);
	});

	test("a sequence document fails naming the file", () => {
		const tree = fabricate(complete("score-calibration", "- one\n- two\n"));
		expect(() => boardState(tree)).toThrow(/is not a mapping of keys/);
	});

	test("an empty document declares no predecessor rather than failing", () => {
		const tree = fabricate(complete("score-calibration", ""));
		expect(boardState(tree).status["score-calibration"]).toBe("proposed");
	});
});
