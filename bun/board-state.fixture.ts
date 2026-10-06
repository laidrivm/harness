/**
 * A throwaway `openspec/changes/` tree for the board-state cases, so that each
 * one states the tree it is about rather than asserting against this
 * repository's, which changes under it every time a change is archived.
 *
 * Its own module because the statuses and the blocking edges are checked in two
 * files — the pair is over the file cap as one — and both build the same trees.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const made: string[] = [];

export function cleanup() {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
	made.length = 0;
}

/**
 * A root holding `tree`, each key a path under it.
 *
 * A key ending in `/` is an empty directory, which is the state `specs/` is in
 * for one of the two `proposing` cases and which no file entry can express.
 */
export function fabricate(tree: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "board-state-"));
	made.push(root);
	for (const [path, text] of Object.entries(tree)) {
		const full = join(root, path);
		if (path.endsWith("/")) {
			mkdirSync(full, { recursive: true });
			continue;
		}
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
	return root;
}

/** Every artefact a complete change directory holds, for one slug. */
export function complete(
	slug: string,
	yaml = "schema: spec-driven\n",
): Record<string, string> {
	const dir = `openspec/changes/${slug}`;
	return {
		[`${dir}/.openspec.yaml`]: yaml,
		[`${dir}/proposal.md`]: "",
		[`${dir}/design.md`]: "",
		[`${dir}/tasks.md`]: "",
		[`${dir}/specs/a-capability/spec.md`]: "",
	};
}

/** An archived change directory, named the way `openspec archive` names one. */
export const archived = (
	date: string,
	slug: string,
): Record<string, string> => ({
	[`openspec/changes/archive/${date}-${slug}/proposal.md`]: "",
});
