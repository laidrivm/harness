/**
 * The pre-push hook's draft check, `bun bun/push-draft.ts "$@"`: refuses a
 * push that updates a branch on github.com while that branch has an open pull
 * request that is not a draft, and one whose pull requests cannot be read —
 * an unread state is never a draft. The branch comes from each ref-update
 * record's remote ref, never the local one: `git push origin feat/x:release`
 * updates `release`. A deletion, a tag and any other host pass unread, and no
 * git is spawned: inside a hook git's own environment is set.
 */
import { record } from "./gate-ledger.ts";
import { readPullRequests, readyOne, remoteRepository } from "./pull-requests.ts";

/** The host of a URL or of git's scp form `user@host:path`; a local path has none. */
const host = (url: string) =>
	/^[a-z][a-z\d+.-]*:\/\/(?:[^@/]*@)?([^/:]*)/i.exec(url)?.[1] ?? /^(?:[^@/:]*@)?([^/:]+):/.exec(url)?.[1];

const url = process.argv[3] ?? "";
const repo = host(url)?.toLowerCase() === "github.com" ? remoteRepository(url) : undefined;

/** Writes the reason, records it with the sha the push would land, and stops the push. */
function refuse(id: string, reason: string, sha: string): never {
	process.stderr.write(`push-draft: ${reason}\n`);
	record("push-draft", "block", id, { cwd: process.cwd() }, sha);
	process.exit(1);
}

// Each record: <local ref> <local sha> <remote ref> <remote sha>. Empty when there is nothing to push.
for (const line of (await Bun.stdin.text()).split("\n")) {
	const [, sha = "", ref = ""] = line.split(" ");
	const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : "";
	// An all-zero local sha is a deletion, which lands nothing for review.
	if (!repo || !branch || /^0+$/.test(sha)) continue;
	const pulls = readPullRequests(branch, repo);
	if (!pulls) refuse("unread", `cannot read ${repo.owner}/${repo.repo}'s pull requests for ${branch}; check \`gh auth status\``, sha);
	const ready = readyOne(pulls);
	if (ready)
		refuse(
			"ready",
			`#${ready.number} on ${branch} is not a draft, so a push into it is refused; run \`gh pr ready ${ready.number} --undo\` first, then push`,
			sha,
		);
}
