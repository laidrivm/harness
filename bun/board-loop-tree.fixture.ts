/**
 * The trees the board-loop cases run in: a bare `origin` and its clone, the
 * change directories they hold, and a commit made in either. Split from
 * `board-loop.fixture.ts`, which re-exports it, for its length.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyDir, git } from "./diff-budget.fixture.ts";

export const ONE = "## 1. Only\n\n- [ ] 1.1 a\n";
export const THREE = "## 1. First\n\n- [x] 1.1 a\n\n## 2. Second\n\n- [ ] 2.1 b\n\n## 3. Third\n\n- [ ] 3.1 c\n";
export const TICKED = "## 1. Only\n\n- [x] 1.1 a\n";

type Tree = Record<string, string>;

/** A complete change directory: `proposed`, as `board-state.ts` reads one. */
export const change = (slug: string, tasks = ONE, after: string[] = []): Tree => {
	const dir = `openspec/changes/${slug}`;
	return {
		[`${dir}/proposal.md`]: `# ${slug}\n`,
		[`${dir}/design.md`]: `# ${slug}\n`,
		[`${dir}/tasks.md`]: tasks,
		[`${dir}/specs/demo/spec.md`]: "# demo\n",
		[`${dir}/.openspec.yaml`]: after.length ? `after:\n${after.map((s) => `  - ${s}\n`).join("")}` : "",
	};
};

/** Writes `tree` into `dir` and commits it. */
export function commit(dir: string, tree: Tree = { "note.txt": `${Math.random()}\n` }) {
	for (const [path, text] of Object.entries(tree)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	git(dir, "add", "-A");
	git(dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-qm", "c");
}

/**
 * A bare `origin` whose `main` holds `tree`, and a clone of it on `main`. Its
 * `package.json` names the board `Demo` unless `tree` holds one of its own.
 */
export function clone(tree: Tree = change("demo")) {
	// Its path ends in `o/demo`, the repository the pull request read names.
	const origin = join(emptyDir("board-loop-origin-"), "o", "demo");
	mkdirSync(origin, { recursive: true });
	git(origin, "init", "-q", "--bare", "-b", "main");
	const dir = emptyDir("board-loop-clone-");
	git(dir, "init", "-q", "-b", "main");
	git(dir, "remote", "add", "origin", origin);
	commit(dir, { "package.json": '{"harness":{"board":"Demo"}}\n', ...tree });
	git(dir, "push", "-q", "origin", "main");
	return { dir, origin };
}

/** Moves `origin`'s `main` on by one commit made in another checkout. */
export function advance(origin: string, tree?: Tree) {
	const other = emptyDir("board-loop-other-");
	git(other, "clone", "-q", origin, ".");
	commit(other, tree);
	git(other, "push", "-q", "origin", "main");
}
