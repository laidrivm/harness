/**
 * What the bump's test files share: a local stand-in for the two GitHub API
 * paths `greenHead` reads, and git run with a throwaway identity.
 *
 * Its own module because `bump-verify.test.ts` and `bump-self.test.ts` both
 * drive `greenHead` through it — a second copy would drift in what it serves
 * while both files still passed. Each test file starts and stops its own
 * server, since a lifecycle hook belongs to the file it runs for.
 */

export type CheckRun = { conclusion: string | null; app?: { slug: string } };

/** A passed run as the harness's own CI posts it. */
export const GREEN: CheckRun = {
	conclusion: "success",
	app: { slug: "github-actions" },
};

/**
 * What the stand-in serves, mutated by each case: `main`'s head, that
 * commit's `test` runs, whether every answer fails, and the authorization
 * header of each request seen.
 */
export type Served = {
	head: string;
	runs: CheckRun[];
	broken: boolean;
	seen: (string | null)[];
};

/** Starts the stand-in, answering from `state` as it stands at each request. */
export function serve(state: Served): ReturnType<typeof Bun.serve> {
	return Bun.serve({
		port: 0,
		fetch(request) {
			const path = new URL(request.url).pathname;
			state.seen.push(request.headers.get("authorization"));
			if (state.broken) return new Response("down", { status: 500 });
			if (path === "/repos/laidrivm/harness/commits/main")
				return Response.json({ sha: state.head });
			if (path === `/repos/laidrivm/harness/commits/${state.head}/check-runs`)
				return Response.json({ check_runs: state.runs });
			return new Response("not found", { status: 404 });
		},
	});
}

/** git in `dir` with a throwaway identity, its trimmed stdout. */
export const git = (dir: string, ...args: string[]) =>
	Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
		cwd: dir,
	})
		.stdout.toString()
		.trim();
