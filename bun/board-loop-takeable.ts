/** Which `proposed` change a board-loop pass may take, and which step of it. */
import { readFileSync } from "node:fs";
import type { Step } from "./board-loop-prompt.ts";
import type { sh } from "./board-loop-push.ts";
import { type Pull, readPullRequests } from "./pull-requests.ts";
import { groups } from "./turn-gate.ts";

/** The branch's pull requests, the number of a draft open on it, or why the change waits: a failed read or a ready open one. */
function read(branch: string): Pull[] | number | string {
	const prs = readPullRequests(branch);
	// Never "no pull request": a missed open one would start a second
	// session on a branch under review.
	if (!prs) return "the pull request query failed";
	const open = prs.find((pr) => pr.state === "OPEN");
	// A draft waits on its card's answer, which a pass carries on the same step and branch.
	if (open?.draft && typeof open.number === "number") return open.number;
	return open ? `pull request #${open.number} is open on ${branch}` : prs;
}

/**
 * The step a `proposed` change would carry next, or why it cannot be taken. A
 * change with every group ticked is an answer candidate for step N+1, which
 * only the pick session can tell from one with no answer on its card. Groups
 * whose unticked boxes sit on a branch only merged pull requests used are
 * carried as step N+1, up to the first group whose branch is not. A step
 * whose branch has an open draft pull request is an answer candidate on that
 * same step and branch.
 */
export function consider(slug: string, status: string, blocking: string[]): Step | string {
	if (status !== "proposed") return `it is ${status}, not proposed`;
	if (blocking.length) return `after: ${blocking.join(", ")} is still open`;
	const found = [...groups(readFileSync(`openspec/changes/${slug}/tasks.md`, "utf8"))];
	const carried: number[] = [];
	for (const [i, [, boxes]] of found.entries()) {
		if (boxes.open === 0) continue;
		// `git-and-prs.md`: a single group ships whole on `feat/<slug>`; an answer or a carry makes it two.
		const branch = found.length === 1 ? `feat/${slug}` : `feat/${slug}-${i + 1}`;
		const prs = read(branch);
		if (typeof prs === "number") return { step: i + 1, branch, answer: true, draft: prs };
		if (typeof prs === "string") return prs;
		// A closed one is the user's "not this": no carry.
		const closed = prs.find((pr) => pr.state === "CLOSED");
		if (closed) return `pull request #${closed.number} already used ${branch}`;
		if (!prs.length) {
			if (!carried.length) return { step: i + 1, branch, answer: false };
			break;
		}
		carried.push(i + 1);
	}
	const answer = !carried.length;
	const step = found.length + 1;
	const branch = `feat/${slug}-${step}`;
	const prs = read(branch);
	if (typeof prs === "number") return { step, branch, answer: true, draft: prs };
	if (typeof prs === "string") return prs;
	// A squash-merged branch is never freed, and nor is a closed one.
	if (prs.length) return `pull request #${prs[0].number} already used ${branch}`;
	return answer ? { step, branch, answer } : { step, branch, answer, carried };
}

/**
 * Whether the step's branch exists, in the clone or on `origin` as the pass's
 * fetch left it: a session that ended before its pull request left it.
 */
export const left = (at: typeof sh, branch: string) =>
	[`refs/heads/${branch}`, `refs/remotes/origin/${branch}`].some((ref) => at("git", "rev-parse", "--verify", "-q", ref).ok);
