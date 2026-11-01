/**
 * The checkouts the `finish --card` cases run in, for
 * `work-finish-card.test.ts` and `work-finish-card-changes.test.ts`: a tree of
 * `harness` on `feature` past `main`, a change added or archived on it, and a
 * `main` sharing no history with it. `afterAll` is not registered here: each
 * test file registers its own.
 */
import { git } from "./diff-budget.fixture.ts";
import { checkout } from "./work-finish.fixture.ts";

const MANIFEST = JSON.stringify({ name: "harness", harness: { board: "Harness" } });
export const FOO = "openspec/changes/foo/";
export const ARCHIVE = "openspec/changes/archive/2026-11-02-foo/";
export const PULL = { number: 7, url: "https://github.com/o/demo/pull/7" };

/** A checkout of `harness`, its board `Harness`, on `feature` past `main`, `base` and `head` its two trees. */
export const tree = (base: Record<string, string>, head: Record<string, string | null>) => checkout(false, head, { "package.json": MANIFEST, ...base });
export const adding = () => tree({}, { [`${FOO}proposal.md`]: "# foo\n" });
export const archiving = () =>
	tree({ [`${FOO}proposal.md`]: "# foo\n", [`${FOO}tasks.md`]: "- [x] 1\n" }, {
		[`${FOO}proposal.md`]: null,
		[`${FOO}tasks.md`]: null,
		[`${ARCHIVE}proposal.md`]: "# foo\n",
		[`${ARCHIVE}tasks.md`]: "- [x] 1\n",
	});

/** `dir` with `origin`'s `main` replaced by a commit sharing no history with `feature`, so no merge base is found. */
export function unrelated(dir: string): string {
	git(dir, "checkout", "-q", "--orphan", "other");
	git(dir, "commit", "-qm", "unrelated", "--allow-empty");
	git(dir, "push", "-q", "-f", "origin", "other:main");
	git(dir, "checkout", "-q", "feature");
	return dir;
}
