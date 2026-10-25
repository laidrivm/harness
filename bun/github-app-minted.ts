import { TEMPFAIL, Transient } from "./transient.ts";

/**
 * The runner's side of the key holder's mint (`github-app-mint.ts`): the one
 * call both `github-app.ts` and `readPullRequests()` make. `command` is
 * `HARNESS_GITHUB_APP_MINT`, its words split on spaces as `HARNESS_AS_AGENT`'s
 * are; it is asked for one repository, and its one line of stdout is the
 * answer, so the token reaches no process's arguments. It throws a
 * `Transient` when the mint exits `TEMPFAIL` or its limit killed it.
 */
export function minted(command: string, repository: string, args: string[], timeout = 30_000): string {
	const words = command.split(" ").filter(Boolean);
	let run: ReturnType<typeof Bun.spawnSync>;
	try {
		// Bounded and killed, so a mint that hangs fails the call rather than holding the pass.
		run = Bun.spawnSync([...words, repository, ...args], { stdin: "ignore", timeout, killSignal: "SIGKILL" });
	} catch {
		throw new Error(`the mint command ${words[0]} could not be started`);
	}
	const out = run.stdout?.toString().trim() ?? "";
	if (run.exitCode === 0 && out) return out;
	const why = run.stderr?.toString().trim().split("\n").at(-1);
	// Any other signal (the OOM killer, an external stop) is no transient failure.
	const transient = run.exitCode === TEMPFAIL || run.exitedDueToTimeout === true;
	throw new (transient ? Transient : Error)(`the mint command ${words[0]} exited ${run.exitCode ?? "on a signal"}${why ? `: ${why}` : ""}`);
}
