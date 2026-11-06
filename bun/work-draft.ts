/**
 * `work.ts draft --pr <n>`: marks open pull request `<n>` of `origin`'s
 * repository a draft as follow-up on it starts, and names its head, the
 * `--head` `work.ts resolve` takes
 * (`openspec/changes/work-draft/design.md`). The undo is the CI flow's
 * `ready(…, "--undo")`, which answers only whether `gh` exited 0, so a failure
 * claims no state; there is no read-back, as `finish` trusts `ready()` too.
 */
import { ready } from "./ci-run-draft.ts";
import { originRepository, readPullRequest } from "./pull-requests.ts";

/** The line `draft` prints and its exit code. */
export function draft(n: string): { lines: string[]; code: number } {
	const say = (line: string, code = 0) => ({ lines: [line], code });
	const refuse = (why: string) => say(`draft: refused — ${why}`, 1);
	// `origin` first, as `finish` reads it, so a URL naming no repository is not refused as a failed read.
	const repo = originRepository();
	if (!repo) return refuse("origin names no owner and repository");
	const full = `${repo.owner}/${repo.repo}`;
	const pr = readPullRequest(n, repo);
	const head = pr?.headRefOid;
	// A head that is not 40 hex digits is no `--head` `resolve` takes, so the answer counts as unread.
	if (!pr || typeof head !== "string" || !/^[0-9a-f]{40}$/.test(head))
		return refuse(`cannot read #${n} of ${full}; check \`gh auth status\``);
	if (pr.state !== "OPEN") return refuse(`#${n} is ${pr.state.toLowerCase()}`);
	if (pr.draft) return say(`draft: #${n} already a draft, head ${head}`);
	if (!ready(full, Number(n), "--undo"))
		return say(`draft: failed — gh pr ready --undo failed, so #${n} could not be confirmed a draft`, 1);
	return say(`draft: #${n} marked draft, head ${head}`);
}
