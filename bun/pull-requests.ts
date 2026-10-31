/**
 * Pull requests read through GitHub's REST endpoint with `gh api`, and no
 * GraphQL, which a cloud session's proxy refuses: a branch's, which the goal
 * check, the board loop's runner and `push-draft` read, and one by its number,
 * which `work.ts status` reads for a card whose `Pointer` names it. Both go
 * through one call: a read that has not answered within its time limit is
 * killed and fails, so no caller waits on a `gh` that neither answers nor
 * exits, and where `HARNESS_GITHUB_APP_MINT` names the key holder's mint, the
 * read alone holds a token it minted, so a private repository's are read.
 */
import { minted } from "./github-app-minted.ts";

/** The limit in ms: `HARNESS_GH_TIMEOUT_MS` when it is a positive whole number, 30 s otherwise. */
export function limit(): number {
	const env = process.env.HARNESS_GH_TIMEOUT_MS ?? "";
	// Never 0: `spawnSync` reads a timeout of 0 as no limit at all.
	return /^[1-9]\d*$/.test(env) ? Number(env) : 30_000;
}

/** A remote URL's authority and path, in the URL form or git's scp form `user@host:path`; a local path has neither. */
const URL_FORM = /^[a-z][a-z\d+.-]*:\/\/([^/]*)(\/.*)$/i;
const SCP_FORM = /^([^/:]+):(.*)$/;

/** A remote URL's host, lower-cased, without user or port, or undefined for a local path. */
export function remoteHost(url: string) {
	const authority = URL_FORM.exec(url)?.[1] ?? SCP_FORM.exec(url)?.[1];
	return authority?.replace(/^.*@/, "").replace(/:\d*$/, "").toLowerCase();
}

/**
 * The owner and name a remote URL's last two path segments give, on any host,
 * or undefined when it has no two segments of GitHub's name characters. The
 * scp form `user@host:o/r` counts its colon as a separator.
 */
export function remoteRepository(url: string) {
	const path = URL_FORM.exec(url)?.[2] ?? SCP_FORM.exec(url)?.[2] ?? url;
	const parts = path.replace(/\/+$/, "").replace(/\.git$/, "").split("/");
	const [owner, repo] = parts.slice(-2);
	// A segment of dots alone would move the API call's path out of the repository's, or name none.
	const name = (s?: string) => s !== undefined && /^[\w.-]+$/.test(s) && !/^\.+$/.test(s);
	return parts.length >= 2 && name(owner) && name(repo) ? { owner, repo } : undefined;
}

export type Pull = { number: unknown; state: "OPEN" | "MERGED" | "CLOSED"; headRefOid: unknown; draft: boolean };

type Repo = { id?: unknown } | null;
type Listed = { number?: unknown; state?: unknown; merged_at?: unknown; draft?: unknown; head?: { sha?: unknown; repo?: Repo }; base?: { ref?: unknown; repo?: Repo } } | null;

/**
 * `gh api query` for the repository `full`, its output parsed, or false for a
 * non-zero or missing exit status. Throws where the mint, the spawn or the
 * parse does, which each reader turns into a failed read.
 */
function api(full: string, query: string): unknown {
	// A mint that fails throws, failing the read: never an unauthenticated read that misses a private repository's.
	const mint = process.env.HARNESS_GITHUB_APP_MINT;
	const env = mint ? { ...process.env, GH_TOKEN: minted(mint, full, ["pull_requests=read"]) } : process.env;
	// SIGKILL: a `gh` that ignores the default SIGTERM holds `spawnSync` past
	// the limit. A killed read exits with no status, so it fails here.
	const run = Bun.spawnSync(["gh", "api", query], { env, timeout: limit(), killSignal: "SIGKILL" });
	return run.exitCode === 0 && JSON.parse(run.stdout.toString());
}

/** `Pull`'s state for a REST answer: `merged_at` alone tells a merged pull request from a closed one, which both read `closed`. */
const stateOf = (pr: Listed): Pull["state"] => (pr?.state === "open" ? "OPEN" : pr?.state === "closed" && pr.merged_at ? "MERGED" : "CLOSED");

/** The owner and name `origin` names, the repository every read here is of, or undefined. Throws where git cannot start. */
export function originRepository() {
	// `get-url` applies `insteadOf`, so the URL is the one git itself uses.
	const url = Bun.spawnSync(["git", "remote", "get-url", "origin"], { timeout: limit() });
	return url.exitCode === 0 ? remoteRepository(url.stdout.toString().trim()) : undefined;
}

/**
 * The branch's pull requests in every state, newest first, or undefined for a
 * read that failed: no `origin` naming an owner and name, a non-zero or
 * missing exit status, a spawn that throws, or output that is not a JSON array.
 * `repo` names the repository to read, so no git is spawned — inside a hook
 * git's own environment is set; given none, `origin` names it.
 */
export function readPullRequests(branch: string, repo?: { owner: string; repo: string }): Pull[] | undefined {
	try {
		const found = repo ?? originRepository();
		if (!found) return undefined;
		const full = `${found.owner}/${found.repo}`;
		// shortcut: the head filter uses origin's owner, so an owner transfer origin has not caught up with finds nothing; upgrade by reading the owner from `gh api repos/<full>` if one happens.
		// shortcut: one page of 100, the newest; page with --paginate if a branch ever holds more pull requests than that.
		const query = `repos/${full}/pulls?head=${found.owner}:${encodeURIComponent(branch)}&state=all&per_page=100`;
		const listed = api(full, query);
		if (!Array.isArray(listed)) return undefined;
		// `head` filters by owner alone: a fork in the same owner passes it, and a gone head reads `null`.
		// Compared by id, not name: after a rename the API names the repository by its new name while origin may keep the old one.
		const own = (pr: Listed) => {
			const id = pr?.head?.repo?.id;
			return typeof id === "number" && id === pr?.base?.repo?.id;
		};
		return (listed as Listed[]).filter(own).map((pr) => ({
			number: pr?.number,
			state: stateOf(pr),
			headRefOid: pr?.head?.sha,
			draft: pr?.draft === true,
		}));
	} catch {
		// A spawn that throws or output that is not JSON fails the read.
		return undefined;
	}
}

/**
 * Pull request `n` of the repository `repo` names, or `origin` given none: its
 * state and its base branch as read, or undefined for a read that failed —
 * the reasons `readPullRequests` fails for, `n` not a positive whole number
 * with no leading zero, or an answer that is not that pull request, as an
 * error body `gh` printed with exit 0 is not.
 */
export function readPullRequest(n: string, repo?: { owner: string; repo: string }): { state: Pull["state"]; base: unknown } | undefined {
	// `n` goes into the API path, so only the digits the Pointer's pattern admits reach it, as the string, never `Number()`'s rounding.
	if (!/^[1-9]\d*$/.test(n)) return undefined;
	try {
		const found = repo ?? originRepository();
		if (!found) return undefined;
		const pr = api(`${found.owner}/${found.repo}`, `repos/${found.owner}/${found.repo}/pulls/${n}`) as Listed;
		if (typeof pr?.number !== "number" || String(pr.number) !== n || (pr.state !== "open" && pr.state !== "closed")) return undefined;
		return { state: stateOf(pr), base: pr.base?.ref };
	} catch {
		// A spawn that throws or output that is not JSON fails the read.
		return undefined;
	}
}

/** The open pull request that is not a draft, which no push may go into, or undefined. */
export const readyOne = (pulls: Pull[]) => pulls.find((pr) => pr.state === "OPEN" && !pr.draft);
