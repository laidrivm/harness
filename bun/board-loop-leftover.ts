/**
 * Whether the clone's unpushed tip is a merged branch's leftover, which a board-loop pass switches off
 * and keeps: every commit it holds over `origin`'s `base` is there already by patch, so leaving it loses
 * nothing. `at` runs a command where the pass runs its git, in the session's clone on the host.
 */
export function leftover(at: (...cmd: string[]) => { ok: boolean; out: string }, base: string): boolean {
	// No line at all: origin's base holds HEAD itself.
	// shortcut: a squash of several commits matches none of them by patch, so that branch still refuses; compare trees if one does.
	const cherry = at("git", "cherry", `origin/${base}`, "HEAD");
	// `git cherry` lists no merge, and a merge's own resolution may be work origin lacks, so a merge refuses.
	const merges = at("git", "rev-list", "--merges", `origin/${base}..HEAD`);
	return cherry.ok && merges.ok && !merges.out && !/^\+/m.test(cherry.out);
}
