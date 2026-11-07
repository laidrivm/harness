/**
 * `env` less every variable `git rev-parse --local-env-vars` names. A session or a run started under a git hook
 * inherits its `GIT_DIR` and `GIT_WORK_TREE`, which outrank both `-C` and a directory's own `.git`, so a git given
 * them reads another repository. The list is git's own and reads no repository, so it is asked in this process's
 * environment with only `env`'s `PATH`, where one is set: the git found there is the one `env`'s callers then run.
 * A probe that fails throws rather than strip nothing, which would pass every variable on.
 */
export function unlocal(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const probe = Bun.spawnSync(["git", "rev-parse", "--local-env-vars"], {
		env: { ...process.env, PATH: env.PATH || process.env.PATH },
	});
	if (!probe.success) throw new Error(`git rev-parse --local-env-vars exited ${probe.exitCode}`);
	const local = new Set(probe.stdout.toString().split("\n"));
	return Object.fromEntries(Object.entries(env).filter(([key]) => !local.has(key)));
}
