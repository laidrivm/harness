/**
 * `work.ts resolve --pr <n> --head <sha> --comment <id> …`: resolves the
 * review bot's threads a session fixed, on the current branch's open pull
 * request while its head is `--head`
 * (`openspec/changes/archive/2026-11-01-coderabbit-resolve-fixed-threads/design.md`, *`resolve`
 * places every id before it changes anything*). Every refusal comes before the
 * first mutation; the mutations run in the order given and stop at the first
 * failure, a rerun skipping what is resolved. The `resolveReviewThread`
 * mutation runs in this process under `gh`'s identity, as `finish`'s push
 * does, so the command guard, which refuses a raw one, is not changed.
 */
import { exited, plain } from "./coderabbit-run.ts";
import { gh, originRepository, readPullRequests } from "./pull-requests.ts";

/** GraphQL's spelling of the bot's login, compared whole: a prefix would pass `coderabbitai-x`, which anyone can register. */
const BOT = "coderabbitai";

/** `comments(first:1)`: only a thread's first comment is placed; `fullDatabaseId`, since `databaseId` is a 32-bit Int GitHub's ids already pass. */
const THREADS =
	"query($o:String!,$r:String!,$n:Int!,$endCursor:String){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{id isResolved comments(first:1){nodes{fullDatabaseId author{login}}}}}}}}";
const RESOLVE = "mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}";

type Thread = { id?: unknown; isResolved?: unknown; comments?: { nodes?: { fullDatabaseId?: unknown; author?: { login?: unknown } | null }[] } };

/** `gh api graphql args`: whether it exited 0, its output, and the first line it said otherwise. */
const graphql = (...args: string[]) => {
	// `plain()`: a forced TTY or colour would print JSON no parse here reads, and a resolve that succeeded would read as failed.
	const run = gh(["api", "graphql", ...args], plain());
	return { ok: run.exitCode === 0, out: run.stdout.toString(), said: run.stderr.toString().trim().split("\n")[0] || exited(run) };
};

/** Every review thread of `n`, across `--paginate --slurp`'s pages, or undefined for a read that failed. */
function threads(owner: string, repo: string, n: string): Thread[] | undefined {
	// `--slurp`: without it each page prints as its own JSON object, and one parse fails past 100 threads.
	// `-f` for the names: `-F` would send a repository named `2048` or `true` as a number or a boolean.
	const run = graphql("--paginate", "--slurp", "-f", `o=${owner}`, "-f", `r=${repo}`, "-F", `n=${n}`, "-f", `query=${THREADS}`);
	try {
		const pages = run.ok && JSON.parse(run.out);
		if (!Array.isArray(pages)) return undefined;
		const nodes = pages.map((p) => p?.data?.repository?.pullRequest?.reviewThreads?.nodes);
		return nodes.every(Array.isArray) ? nodes.flat() : undefined;
	} catch {
		return undefined;
	}
}

/** The lines `resolve` prints, one per id it skips or attempts, or one refusal, and its exit code: 0 when every named thread ends resolved, 1 otherwise. */
export async function resolve(pr: string, head: string, ids: string[]): Promise<{ lines: string[]; code: number }> {
	const refuse = (why: string) => ({ lines: [`resolve: refused — ${why}`], code: 1 });
	// The pull-request read would mint the App's token, while the mutation runs as `gh`'s identity.
	if (process.env.HARNESS_GITHUB_APP_MINT) return refuse("HARNESS_GITHUB_APP_MINT is set, so the pull request would be read as the App and resolved as gh's identity");
	const symbolic = Bun.spawnSync(["git", "symbolic-ref", "--short", "-q", "HEAD"]);
	const branch = symbolic.exitCode === 0 ? symbolic.stdout.toString().replace(/\n$/, "") : "";
	if (!branch) return refuse("HEAD names no branch");
	const repo = originRepository();
	const unread = refuse(`cannot read the pull requests of ${branch}; check \`gh auth status\``);
	const read = () => repo && readPullRequests(branch, repo)?.filter((p) => p.state === "OPEN");
	const pulls = read();
	if (!repo || !pulls) return unread;
	let target = pulls.find((p) => String(p.number) === pr);
	if (!target) return refuse(`#${pr} is not an open pull request of ${branch}; ${pulls.length ? `its open ones: ${pulls.map((p) => `#${p.number}`).join(", ")}` : "it has none"}`);
	if (target.headRefOid !== head) {
		const seen = String(target.headRefOid);
		// Once, 2 s later: GitHub's API can lag a push (the user's decision 10).
		await Bun.sleep(2000);
		const again = read();
		// A failed read is no proof of another head, so it says so rather than send the session to review `seen`.
		if (!again) return refuse(`#${pr}'s head read ${seen}, not ${head}, and could not be read again; check \`gh auth status\``);
		target = again.find((p) => String(p.number) === pr);
		if (!target) return refuse(`#${pr} is no longer an open pull request of ${branch}`);
		if (target.headRefOid !== head) return refuse(`#${pr}'s head is ${String(target.headRefOid)}, not ${head}`);
	}

	const all = threads(repo.owner, repo.repo, pr);
	if (!all) return refuse(`cannot read the review threads of #${pr}`);
	const placed = ids.map((id) => {
		const found = all.find((t) => String(t?.comments?.nodes?.[0]?.fullDatabaseId) === id);
		const usable = found?.comments?.nodes?.[0]?.author?.login === BOT && typeof found.id === "string" && found.id !== "";
		return { id, thread: usable ? found : undefined };
	});
	const unplaced = placed.filter((p) => !p.thread).map((p) => p.id);
	if (unplaced.length) return refuse(`${unplaced.join(", ")} open${unplaced.length === 1 ? "s" : ""} no thread of ${BOT}'s on #${pr}`);

	const lines: string[] = [];
	for (const { id, thread } of placed) {
		if (thread?.isResolved === true) {
			lines.push(`resolve: ${id} already resolved, skipped`);
			continue;
		}
		const run = graphql("-f", `query=${RESOLVE}`, "-f", `t=${String(thread?.id)}`);
		let done = false;
		try {
			done = run.ok && JSON.parse(run.out)?.data?.resolveReviewThread?.thread?.isResolved === true;
		} catch {
			// Output that is not JSON is no resolve.
		}
		if (!done) return { lines: [...lines, `resolve: ${id} failed — ${run.ok ? "the thread does not read resolved" : run.said}`], code: 1 };
		lines.push(`resolve: ${id} resolved`);
	}
	return { lines, code: 0 };
}
