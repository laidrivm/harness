/**
 * `env` less every variable `git rev-parse --local-env-vars` names. A session or a run started under a git hook
 * inherits its `GIT_DIR` and `GIT_WORK_TREE`, which outrank both `-C` and a directory's own `.git`, so a git given
 * them reads another repository. The list is git's own and reads no repository, so it is asked in this process's
 * environment whatever `env` holds.
 */
export function unlocal(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const local = new Set(Bun.spawnSync(["git", "rev-parse", "--local-env-vars"]).stdout.toString().split("\n"));
	return Object.fromEntries(Object.entries(env).filter(([key]) => !local.has(key)));
}
