/**
 * A branch's pull requests, read through GitHub's REST endpoint with
 * `gh api`: the one copy of that read, which the goal check and the board
 * loop's runner both make, and no GraphQL, which a cloud session's proxy
 * refuses. A read that has not answered within its time limit is killed and
 * fails, so neither caller waits on a `gh` that neither answers nor exits.
 * Where `HARNESS_GITHUB_APP_MINT` names the key holder's mint, the read alone
 * holds a token it minted, so a private repository's pull requests are read.
 */
import { minted } from "./github-app-minted.ts";

/** The limit in ms: `HARNESS_GH_TIMEOUT_MS` when it is a positive whole number, 30 s otherwise. */
export function limit(): number {
	const env = process.env.HARNESS_GH_TIMEOUT_MS ?? "";
	// Never 0: `spawnSync` reads a timeout of 0 as no limit at all.
	return /^[1-9]\d*$/.test(env) ? Number(env) : 30_000;
}

/**
 * The owner and name a remote URL's last two path segments give, on any host,
 * or undefined when it has no two segments of GitHub's name characters. The
 * scp form `user@host:o/r` counts its colon as a separator.
 */
export function remoteRepository(url: string) {
	const path = /^[a-z][a-z\d+.-]*:\/\/[^/]*(\/.*)$/i.exec(url)?.[1] ?? /^[^/:]+:(.*)$/.exec(url)?.[1] ?? url;
	const parts = path.replace(/\/+$/, "").replace(/\.git$/, "").split("/");
	const [owner, repo] = parts.slice(-2);
	// A segment of dots alone would move the API call's path out of the repository's, or name none.
	const name = (s?: string) => s !== undefined && /^[\w.-]+$/.test(s) && !/^\.+$/.test(s);
	return parts.length >= 2 && name(owner) && name(repo) ? { owner, repo } : undefined;
}

export type Pull = { number: unknown; state: "OPEN" | "MERGED" | "CLOSED"; headRefOid: unknown; draft: boolean };

type Repo = { id?: unknown } | null;
type Listed = { number?: unknown; state?: unknown; merged_at?: unknown; draft?: unknown; head?: { sha?: unknown; repo?: Repo }; base?: { repo?: Repo } } | null;

/**
 * The branch's pull requests in every state, newest first, or undefined for a
 * read that failed: no `origin` naming an owner and name, a non-zero or
 * missing exit status, a spawn that throws, or output that is not a JSON array.
 */
export function readPullRequests(branch: string): Pull[] | undefined {
	try {
		// `get-url` applies `insteadOf`, so the URL is the one git itself uses.
		const url = Bun.spawnSync(["git", "remote", "get-url", "origin"], { timeout: limit() });
		const found = url.exitCode === 0 ? remoteRepository(url.stdout.toString().trim()) : undefined;
		if (!found) return undefined;
		const full = `${found.owner}/${found.repo}`;
		// shortcut: the head filter uses origin's owner, so an owner transfer origin has not caught up with finds nothing; upgrade by reading the owner from `gh api repos/<full>` if one happens.
		// shortcut: one page of 100, the newest; page with --paginate if a branch ever holds more pull requests than that.
		const query = `repos/${full}/pulls?head=${found.owner}:${encodeURIComponent(branch)}&state=all&per_page=100`;
		// A mint that fails throws, failing the read: never an unauthenticated read that misses a private repository's.
		const mint = process.env.HARNESS_GITHUB_APP_MINT;
		const env = mint ? { ...process.env, GH_TOKEN: minted(mint, full, ["pull_requests=read"]) } : process.env;
		// SIGKILL: a `gh` that ignores the default SIGTERM holds `spawnSync` past
		// the limit. A killed read exits with no status, so it fails below.
		const run = Bun.spawnSync(["gh", "api", query], { env, timeout: limit(), killSignal: "SIGKILL" });
		const listed: unknown = run.exitCode === 0 && JSON.parse(run.stdout.toString());
		if (!Array.isArray(listed)) return undefined;
		// `head` filters by owner alone: a fork in the same owner passes it, and a gone head reads `null`.
		// Compared by id, not name: after a rename the API names the repository by its new name while origin may keep the old one.
		const own = (pr: Listed) => {
			const id = pr?.head?.repo?.id;
			return typeof id === "number" && id === pr?.base?.repo?.id;
		};
		return (listed as Listed[]).filter(own).map((pr) => ({
			number: pr?.number,
			state: pr?.state === "open" ? "OPEN" : pr?.state === "closed" && pr.merged_at ? "MERGED" : "CLOSED",
			headRefOid: pr?.head?.sha,
			draft: pr?.draft === true,
		}));
	} catch {
		// A spawn that throws or output that is not JSON fails the read.
		return undefined;
	}
}
