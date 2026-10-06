import { afterAll, expect, test } from "bun:test";
import {
	cleanup,
	gate,
	git,
	lines,
	repo,
	tasks,
} from "./diff-budget.fixture.ts";

/**
 * The propose stage's own seam. A branch that authors a proposal — adding both
 * `proposal.md` and `tasks.md` under one change directory — has a remedy for
 * an over-budget diff that no `oversize:` marker may stand in for: it splits
 * along the seam the artefacts already are. Every case here is about which
 * branches that refusal reaches and which it must not.
 */

afterAll(cleanup);

/** A branch authoring a proposal: both artefacts added, `total` counted lines. */
const authored = (slug: string, total: number) => ({
	[`openspec/changes/${slug}/proposal.md`]: lines(total - 1),
	[`openspec/changes/${slug}/tasks.md`]: tasks(1, " "),
});

// spec: change-slicing/an-unsplit-proposal-reaching-for-the-override
test("an unsplit proposal over the threshold is refused whatever its body carries", () => {
	const dir = repo({ "a.ts": "one\n" }, authored("big-change", 900));
	const g = gate(dir, "main", "oversize: the artefacts are simply this long\n");
	expect(g.line).toContain("FAIL — 900 lines");
	expect(g.line).not.toContain("OVERRIDE");
	expect(g.code).toBe(1);
});

// The ordinary case: an author who never reached for the marker still gets
// the seam named, because the remedy is the same one either way.
// spec: change-slicing/an-unsplit-proposal-reaching-for-the-override
test("an unsplit proposal carrying no marker is still told where to split", () => {
	const dir = repo({ "a.ts": "one\n" }, authored("no-marker", 900));
	const g = gate(dir, "main");
	expect(g.line).toContain("spec/<slug>-plan");
	expect(g.code).toBe(1);
});

// spec: change-slicing/an-unsplit-proposal-reaching-for-the-override
test("a branch authoring two unsplit proposals is refused", () => {
	const dir = repo(
		{ "a.ts": "one\n" },
		{
			...authored("first", 450),
			...authored("second", 450),
		},
	);
	const g = gate(dir, "main", "oversize: two proposals in one push\n");
	expect(g.line).toContain("FAIL — 900 lines");
	expect(g.code).toBe(1);
});

// The one move whose destination does match the glob, so what the script asks
// git for is the only thing between it and a refusal it has not earned.
test("renaming a change directory to a new slug authors no proposal", () => {
	const dir = repo(
		{
			"openspec/changes/old-slug/proposal.md": lines(400),
			"openspec/changes/old-slug/tasks.md": tasks(20, " "),
		},
		{
			"openspec/changes/old-slug/proposal.md": null,
			"openspec/changes/old-slug/tasks.md": null,
			// Both edited on the way, so neither pairs exactly: an identical
			// move is matched before the limit is consulted, and it is the
			// leftover matrix that `renameLimit` refuses to search.
			"openspec/changes/new-slug/proposal.md": lines(401),
			"openspec/changes/new-slug/tasks.md": tasks(21, " "),
			"src/model.ts": lines(900),
		},
	);
	// Detection off, which is what makes this discriminating: on the default
	// the rename is spotted whether or not the script asks for it, so dropping
	// the script's `-M` would pass here and the case would guard nothing.
	// `renameLimit` is set too and guards nothing here, deliberately: git pairs
	// same-basename files before it consults the limit, and every path this
	// pathspec matches is named `proposal.md` or `tasks.md`. The script's `-l0`
	// is exercised by the counting suite, where basenames differ.
	git(dir, "config", "diff.renames", "false");
	git(dir, "config", "diff.renameLimit", "1");
	const g = gate(dir, "main", "oversize: the rename rides a large change\n");
	expect(g.line).toContain("OVERRIDE");
	expect(g.code).toBe(0);
});

// spec: change-slicing/an-unsplit-proposal-reaching-for-the-override
test("the refusal fires at exactly the failing threshold", () => {
	const dir = repo({ "a.ts": "one\n" }, authored("at-threshold", 800));
	const g = gate(dir, "main", "oversize: right on it, not past it\n");
	expect(g.line).toContain("FAIL — 800 lines");
	expect(g.code).toBe(1);
});

// The threshold is where the refusal starts, so the line below it is the case
// that could have produced the opposite outcome.
// spec: change-slicing/an-unsplit-proposal-reaching-for-the-override
test("an unsplit proposal one line below the threshold warns and exits zero", () => {
	const dir = repo({ "a.ts": "one\n" }, authored("under-threshold", 799));
	const g = gate(dir, "main", "oversize: not needed here\n");
	expect(g.line).toContain("WARN — 799 lines");
	expect(g.code).toBe(0);
});

// An implementation branch adds neither artefact, so this is what covers it.
// spec: change-slicing/an-implementation-branch-is-untouched
test("a branch adding neither artefact still reports the override", () => {
	const dir = repo({ "a.ts": "one\n" }, { "src/model.ts": lines(900) });
	const g = gate(dir, "main", "oversize: mechanical rename across 14 files\n");
	expect(g.line).toContain("OVERRIDE — 900 lines");
	expect(g.code).toBe(0);
});

// spec: change-slicing/a-split-half-over-budget
test("a split half over the threshold still reports the override", () => {
	const dir = repo(
		{ "a.ts": "one\n" },
		{
			"openspec/changes/half/proposal.md": lines(500),
			"openspec/changes/half/specs/thing/spec.md": lines(400),
		},
	);
	const g = gate(
		dir,
		"main",
		"oversize: the requirements alone run this long\n",
	);
	expect(g.line).toContain("OVERRIDE — 900 lines");
	expect(g.code).toBe(0);
});

test("proposal.md for one change and tasks.md for another is not one unsplit proposal", () => {
	const dir = repo(
		{ "a.ts": "one\n" },
		{
			"openspec/changes/one/proposal.md": lines(500),
			"openspec/changes/two/tasks.md": tasks(400, " "),
		},
	);
	const g = gate(dir, "main", "oversize: two changes touched, one authored\n");
	expect(g.line).toContain("OVERRIDE — 900 lines");
	expect(g.code).toBe(0);
});

// spec: change-slicing/an-archived-change-is-not-a-new-proposal
test("an archive move is not the authoring of a proposal", () => {
	const dir = repo(
		{
			"openspec/changes/done/proposal.md": lines(400),
			"openspec/changes/done/tasks.md": tasks(20, "x"),
		},
		{
			"openspec/changes/done/proposal.md": null,
			"openspec/changes/done/tasks.md": null,
			"openspec/changes/archive/2026-08-27-done/proposal.md": lines(400),
			"openspec/changes/archive/2026-08-27-done/tasks.md": tasks(20, "x"),
			"openspec/specs/done/spec.md": lines(900),
		},
	);
	const g = gate(dir, "main", "oversize: the capability arrives whole\n");
	expect(g.line).toContain("OVERRIDE");
	expect(g.code).toBe(0);
});

// Without a glob that stops at a separator, both paths below reduce to the
// same `archive` directory and read as one unsplit proposal.
// spec: change-slicing/an-archived-change-is-not-a-new-proposal
test("an archived change's artefacts are not matched as a change directory", () => {
	const dir = repo(
		{ "a.ts": "one\n" },
		{
			"openspec/changes/archive/2026-08-27-old/proposal.md": lines(500),
			"openspec/changes/archive/2026-08-27-old/tasks.md": tasks(400, "x"),
		},
	);
	const g = gate(dir, "main", "oversize: an archive arriving whole\n");
	expect(g.line).toContain("OVERRIDE — 900 lines");
	expect(g.code).toBe(0);
});

test("adding proposal.md beside an already-tracked tasks.md is not an unsplit proposal", () => {
	const dir = repo(
		{ "openspec/changes/late/tasks.md": tasks(2, " ") },
		{
			"openspec/changes/late/tasks.md": tasks(2, " ") + lines(400),
			"openspec/changes/late/proposal.md": lines(500),
		},
	);
	const g = gate(dir, "main", "oversize: the plan predates the proposal\n");
	expect(g.line).toContain("OVERRIDE — 900 lines");
	expect(g.code).toBe(0);
});

test("modifying both artefacts without adding either is not an unsplit proposal", () => {
	const dir = repo(
		{
			"openspec/changes/redo/proposal.md": lines(1),
			"openspec/changes/redo/tasks.md": tasks(1, " "),
		},
		{
			"openspec/changes/redo/proposal.md": lines(501),
			"openspec/changes/redo/tasks.md": `${tasks(1, " ")}${lines(400)}`,
		},
	);
	const g = gate(dir, "main", "oversize: the proposal was rewritten\n");
	expect(g.line).toContain("OVERRIDE — 900 lines");
	expect(g.code).toBe(0);
});

test("a proposal.md outside openspec/changes/ does not trigger the refusal", () => {
	const dir = repo(
		{ "a.ts": "one\n" },
		{ "docs/proposal.md": lines(500), "docs/tasks.md": tasks(400, " ") },
	);
	const g = gate(dir, "main", "oversize: documentation, not a change\n");
	expect(g.line).toContain("OVERRIDE — 900 lines");
	expect(g.code).toBe(0);
});

// The reader is holding the branch that needs splitting, so the line answers
// it rather than sending them to the capability.
// spec: change-slicing/an-unsplit-proposal-reaching-for-the-override
test("the refused gate line names both branches of the seam", () => {
	const dir = repo({ "a.ts": "one\n" }, authored("seam", 900));
	const g = gate(dir, "main", "oversize: a reason that changes nothing\n");
	expect(g.line).toContain("spec/<slug>");
	expect(g.line).toContain("spec/<slug>-plan");
	expect(g.line).toContain("FAIL");
	expect(g.line).not.toContain("OVERRIDE");
	expect(g.code).toBe(1);
});

// spec: change-slicing/an-unsplit-proposal-whose-marker-names-no-reason
test("a reasonless marker on an unsplit proposal gets the split remedy", () => {
	const dir = repo({ "a.ts": "one\n" }, authored("no-reason", 900));
	const g = gate(dir, "main", "oversize:   \r\n");
	// Not "marker carries no reason": the reason it would ask for is one the
	// requirement refuses to accept, so writing it would change nothing.
	expect(g.line).toContain("spec/<slug>-plan");
	expect(g.line).not.toContain("carries no reason");
	expect(g.code).toBe(1);
});

// spec: change-slicing/a-proposal-that-fits
test("a proposal carrying all four artefacts under the threshold passes", () => {
	const dir = repo(
		{ "a.ts": "one\n" },
		{
			"openspec/changes/small/proposal.md": lines(100),
			"openspec/changes/small/specs/thing/spec.md": lines(100),
			"openspec/changes/small/design.md": lines(100),
			"openspec/changes/small/tasks.md": tasks(50, " "),
		},
	);
	const g = gate(dir, "main");
	expect(g.line).toContain("PASS — 350 lines");
	expect(g.code).toBe(0);
});

// spec: change-slicing/a-proposal-that-does-not-fit
test("the first half of a split proposal passes on its own", () => {
	const dir = repo(
		{ "a.ts": "one\n" },
		{
			"openspec/changes/big/proposal.md": lines(300),
			"openspec/changes/big/specs/thing/spec.md": lines(300),
		},
	);
	const g = gate(dir, "main");
	expect(g.line).toContain("WARN — 600 lines");
	expect(g.code).toBe(0);
});

// The base already carries the first half, which is the state the second pull
// request opens against once `spec/<slug>` has merged.
// spec: change-slicing/a-proposal-that-does-not-fit
test("the second half of a split proposal passes against the merged base", () => {
	const dir = repo(
		{
			"openspec/changes/big/proposal.md": lines(300),
			"openspec/changes/big/specs/thing/spec.md": lines(300),
		},
		{
			"openspec/changes/big/design.md": lines(300),
			"openspec/changes/big/tasks.md": tasks(300, " "),
		},
	);
	const g = gate(dir, "main");
	expect(g.line).toContain("WARN — 600 lines");
	expect(g.code).toBe(0);
});
