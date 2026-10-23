/**
 * The runner's side of the key holder's mint (`github-app-mint.ts`): the one
 * call both `github-app.ts` and `readPullRequests()` make. `command` is
 * `HARNESS_GITHUB_APP_MINT`, its words split on spaces as `HARNESS_AS_AGENT`'s
 * are; it is asked for one repository, and its one line of stdout is the
 * answer, so the token reaches no process's arguments.
 */
export function minted(command: string, repository: string, args: string[]): string {
	const words = command.split(" ").filter(Boolean);
	let run: ReturnType<typeof Bun.spawnSync>;
	try {
		// Bounded and killed, so a mint that hangs fails the call rather than holding the pass.
		run = Bun.spawnSync([...words, repository, ...args], { stdin: "ignore", timeout: 30_000, killSignal: "SIGKILL" });
	} catch {
		throw new Error(`the mint command ${words[0]} could not be started`);
	}
	const out = run.stdout?.toString().trim() ?? "";
	if (run.exitCode === 0 && out) return out;
	const why = run.stderr?.toString().trim().split("\n").at(-1);
	throw new Error(`the mint command ${words[0]} exited ${run.exitCode ?? "on a signal"}${why ? `: ${why}` : ""}`);
}
