/**
 * Which step of a change a board-loop pass would carry, and on which branch:
 * moved out of `board-loop.ts` at its line cap, under the name
 * `reopened-group-branch`'s design gives it.
 */
import { readFileSync } from "node:fs";
import type { Step } from "./board-loop-prompt.ts";
import type { sh } from "./board-loop-push.ts";
import { readPullRequests } from "./pull-requests.ts";
import { groups } from "./turn-gate.ts";

/**
 * The step a `proposed` change would carry next, or why it cannot be taken. A
 * change with every group ticked is an answer candidate for step N+1, which
 * only the pick session can tell from one with no answer on its card, and so
 * is a change whose step's branch has an open draft pull request.
 */
export function consider(slug: string, status: string, blocking: string[]): Step | string {
	if (status !== "proposed") return `it is ${status}, not proposed`;
	if (blocking.length) return `after: ${blocking.join(", ")} is still open`;
	const found = [...groups(readFileSync(`openspec/changes/${slug}/tasks.md`, "utf8"))];
	const answer = found.every(([, boxes]) => boxes.open === 0);
	const step = answer ? found.length + 1 : found.findIndex(([, boxes]) => boxes.open > 0) + 1;
	// `git-and-prs.md`: a single group ships whole on `feat/<slug>`; an answer makes it two.
	const branch = found.length === 1 && !answer ? `feat/${slug}` : `feat/${slug}-${step}`;
	const prs = readPullRequests(branch);
	// Never "no pull request": a missed open one would start a second
	// session on a branch under review.
	if (!prs) return "the pull request query failed";
	const open = prs.find((pr) => pr.state === "OPEN");
	// A draft waits on its card's answer, which a pass carries on the same step and branch.
	if (open?.draft && typeof open.number === "number") return { step, branch, answer: true, draft: open.number };
	if (open) return `pull request #${open.number} is open on ${branch}`;
	// A squash-merged branch is never freed, and nor is a closed one.
	if (prs.length) return `pull request #${prs[0].number} already used ${branch}`;
	return { step, branch, answer };
}

/**
 * Whether the step's branch exists, in the clone or on `origin` as the pass's
 * fetch left it: a session that ended before its pull request left it.
 */
export const left = (at: typeof sh, branch: string) =>
	[`refs/heads/${branch}`, `refs/remotes/origin/${branch}`].some((ref) => at("git", "rev-parse", "--verify", "-q", ref).ok);
