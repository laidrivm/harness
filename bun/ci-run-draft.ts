/**
 * The CI flow's half of the draft rule in `core/git-and-prs.md`: the pull
 * request is a draft while the runner works on it, and ready once that work
 * ends — right after the push when one comes — unless the session left a
 * question to the user on the card, which keeps it a draft
 * (`ci-flow-draft`'s design).
 */
import type { Outcome } from "./ci-run.ts";
import { limit } from "./pull-requests.ts";

/**
 * `gh pr ready` on #`n` in `repo` as the runner, with the App's token in `GH_TOKEN` when one is minted;
 * `--undo` marks it draft. An empty `repo` is the working directory's, as the board loop's runner reads it.
 * Killed at `pull-requests.ts`'s limit, as its read is, so a `gh` that never answers cannot hold the pass.
 */
export const ready = (repo: string, n: number, ...undo: string[]) =>
	Bun.spawnSync(["gh", "pr", "ready", String(n), ...(repo ? ["-R", repo] : []), ...undo], { env: process.env, timeout: limit(), killSignal: "SIGKILL" }).exitCode === 0;

/**
 * Runs `work` with #`n` a draft. `work` answers its outcome and whether a
 * question to the user is open, which leaves the draft as it is. A draft that
 * cannot be made does not stop the work: its attempt is already spent.
 */
export async function draftWhile(repo: string, n: number, work: () => Promise<[Outcome, boolean]>): Promise<Outcome> {
	ready(repo, n, "--undo");
	let done: [Outcome, boolean];
	try {
		done = await work();
	} catch (e) {
		// No push will come from a flow that threw.
		if (ready(repo, n)) throw e;
		throw new Error(`${e instanceof Error ? e.message : String(e)}; #${n} could not be marked ready`);
	}
	const [outcome, asked] = done;
	if (asked || ready(repo, n)) return outcome;
	return ["failed", `${outcome[1]}; #${n} could not be marked ready`];
}
