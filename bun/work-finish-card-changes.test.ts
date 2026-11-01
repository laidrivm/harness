/**
 * The change directories `finish --card` reads from the branch
 * (`work-finish-card.ts`), in temporary repositories with a bare `origin`
 * (`work-finish-card.fixture.ts`), and the cursor loop both Notion reads share
 * (`paged()` of `notion-bot.ts`), pinned here so neither of its older test
 * files grows. The record on the card is in `work-finish-card.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanup, emptyDir, git, put } from "./diff-budget.fixture.ts";
import { type Call, paged } from "./notion-bot.ts";
import { ARCHIVE, adding, archiving, FOO, tree, unrelated } from "./work-finish-card.fixture.ts";
import { added, changes, kind } from "./work-finish-card.ts";

afterAll(cleanup);

describe("paged", () => {
	test("a second page of a path with no query is read behind `?start_cursor=`", async () => {
		const paths: string[] = [];
		const call = (async (_step: string, path: string) => {
			paths.push(path);
			return paths.length === 1
				? { results: [1], has_more: true, next_cursor: "c 1" }
				: { results: [2], has_more: false };
		}) as Call;
		expect(await paged(call, "the block read", "/v1/blocks/x/children")).toEqual([1, 2]);
		expect(paths).toEqual(["/v1/blocks/x/children", "/v1/blocks/x/children?start_cursor=c%201"]);
	});

	test("more pages behind no cursor name the step", async () => {
		const call = (async () => ({ results: [], has_more: true, next_cursor: null })) as Call;
		expect(
			await paged(call, "the block read", "/v1/blocks/x/children").then(
				() => "",
				(e: Error) => e.message,
			),
		).toBe("the block read gave no new cursor");
	});
});

describe("the change directories the branch adds files to", () => {
	/** The change directories and the kind the branch at `top` gives. */
	const read = (top: string) => {
		const paths = added(top);
		return [changes(paths), kind(paths)];
	};

	// spec: work-finish/a-proposals-first-finish
	test("one change added", () => {
		expect(read(adding())).toEqual([[FOO], "proposal"]);
	});

	// spec: work-finish/an-archive-branch
	test("an archive, with renames on in the repository's config, names only the archived directory", () => {
		const dir = archiving();
		git(dir, "config", "diff.renames", "true");
		expect(read(dir)).toEqual([[ARCHIVE], "archive"]);
	});

	// spec: work-finish/an-apply-branch
	test("none, with tasks.md edited and code added", () => {
		expect(
			read(tree({ [`${FOO}tasks.md`]: "- [ ] 1\n" }, { [`${FOO}tasks.md`]: "- [x] 1\n", "bun/x.ts": "x\n" })),
		).toEqual([[], "apply"]);
	});

	// spec: work-finish/an-apply-branch-adding-a-delta-spec
	test("a delta spec alone added to a change the base holds: that change, kind apply", () => {
		const top = tree(
			{ [`${FOO}proposal.md`]: "# foo\n" },
			{ [`${FOO}specs/x/spec.md`]: "# x\n", [`${FOO}notes.md`]: "n\n" },
		);
		expect(read(top)).toEqual([[FOO], "apply"]);
	});

	// spec: work-finish/several-added-directories
	test("two", () => {
		expect(read(tree({}, { [`${FOO}proposal.md`]: "# foo\n", "openspec/changes/bar/proposal.md": "# bar\n" }))).toEqual(
			[["openspec/changes/bar/", FOO], "proposal"],
		);
	});

	// spec: work-finish/a-main-that-archived-a-change-after-the-branch-forked
	test("a change archived on main after the fork, main merged in, is not read as added", () => {
		const dir = tree({ "openspec/changes/bar/proposal.md": "# bar\n" }, { [`${FOO}proposal.md`]: "# foo\n" });
		git(dir, "checkout", "-q", "main");
		put(dir, {
			"openspec/changes/bar/proposal.md": null,
			"openspec/changes/archive/2026-11-01-bar/proposal.md": "# bar\n",
		});
		git(dir, "add", "-A");
		git(dir, "commit", "-qm", "archive bar");
		git(dir, "push", "-q", "origin", "main");
		git(dir, "checkout", "-q", "feature");
		git(dir, "merge", "-q", "--no-edit", "main");
		expect(read(dir)[0]).toEqual([FOO]);
	});

	// spec: work-finish/a-proposals-second-half
	test("design.md and tasks.md added to a change the base holds name that change, kind proposal", () => {
		expect(
			read(tree({ [`${FOO}proposal.md`]: "# foo\n" }, { [`${FOO}design.md`]: "d\n", [`${FOO}tasks.md`]: "- [ ] 1\n" })),
		).toEqual([[FOO], "proposal"]);
	});

	test("a path git would quote is read as it is", () => {
		expect(read(tree({}, { "openspec/changes/fóo/proposal.md": "# fóo\n" }))[0]).toEqual(["openspec/changes/fóo/"]);
	});

	// As a shallow clone reads: no common history with origin/main.
	test("a main with no common history throws the merge base's step", () => {
		expect(() => added(unrelated(adding()))).toThrow(/^the merge base with origin\/main failed: /);
	});

	test("an origin whose main cannot be fetched throws", () => {
		const dir = adding();
		git(dir, "remote", "set-url", "origin", join(emptyDir(), "gone.git"));
		expect(() => added(dir)).toThrow(/^the fetch of origin\/main failed: /);
	});
});
