/**
 * A branch's pull requests, read through `gh pr list`: the one copy of that
 * read, which the goal check and the board loop's runner both make. A read
 * that has not answered within its time limit is killed and fails, so neither
 * caller waits on a `gh` that neither answers nor exits.
 */

/** The limit in ms: `HARNESS_GH_TIMEOUT_MS` when it is a positive whole number, 30 s otherwise. */
export function limit(): number {
	const env = process.env.HARNESS_GH_TIMEOUT_MS ?? "";
	// Never 0: `spawnSync` reads a timeout of 0 as no limit at all.
	return /^[1-9]\d*$/.test(env) ? Number(env) : 30_000;
}

/**
 * The branch's pull requests in every state with the `--json` fields named,
 * or undefined for a read that failed: a non-zero or missing exit status, a
 * spawn that throws, or output that is not a JSON array.
 */
export function readPullRequests<T>(branch: string, fields: string): T[] | undefined {
	// gh lists 30 by default, newest first: closed ones could hide an older match.
	const query = ["gh", "pr", "list", "--head", branch, "--state", "all", "--limit", "1000"];
	try {
		// SIGKILL: a `gh` that ignores the default SIGTERM holds `spawnSync` past
		// the limit. A killed read exits with no status, so it fails below.
		const run = Bun.spawnSync([...query, "--json", fields], { timeout: limit(), killSignal: "SIGKILL" });
		const listed = run.exitCode === 0 && JSON.parse(run.stdout.toString());
		return Array.isArray(listed) ? listed : undefined;
	} catch {
		// A spawn that throws or output that is not JSON fails the read.
		return undefined;
	}
}
