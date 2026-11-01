/**
 * The CI flow's session: the failed logs of the event's attempt written where
 * the session reads them, and a session run in the clone with its outcome read
 * against a schema. Split from `ci-run.ts`, which runs it, for its length; its
 * cases run through the flow in `ci-run-session.test.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LIMIT as HOUR } from "./board-loop.ts";
import { session } from "./board-loop-session.ts";
import { under } from "./ci-run-clone.ts";
import type { App } from "./github-app.ts";

export type Run = {
	id: number;
	conclusion: string | null;
	run_attempt: number;
	head_sha: string;
	head_branch: string;
	event: string;
	name?: string;
	html_url: string;
	head_repository?: { full_name?: string };
};

const OUTCOMES = ["fixed", "blocked", "flaky"];
const SCHEMA = JSON.stringify({
	type: "object",
	required: ["outcome", "summary"],
	additionalProperties: false,
	properties: { outcome: { enum: OUTCOMES }, summary: { type: "string" } },
});

/** The event's attempt's log file, never the run's latest: a re-run started since would hand over another attempt's logs. */
export const logOf = (run: Run) =>
	join(process.env.HARNESS_CI_LOGS || "/home/agent/ci-logs", `${run.id}-${run.run_attempt}.log`);

/** Writes the event's attempt's failed logs to `log` with the runner's `gh`; false when `gh` fails. */
export function logged(app: App, run: Run, log: string) {
	const repo = `${app.owner}/${app.repo}`;
	const view = Bun.spawnSync(
		["gh", "run", "view", String(run.id), "-R", repo, "--attempt", String(run.run_attempt), "--log-failed"],
		{
			env: process.env,
		},
	);
	if (view.exitCode !== 0) return false;
	mkdirSync(dirname(log), { recursive: true });
	// Readable by the session user's group, which the host gives the directory.
	writeFileSync(log, view.stdout, { mode: 0o640 });
	return true;
}

/** Runs a session in the clone and reads its outcome, or undefined for no answer that matches the schema. */
export async function answered(clone: string, prompt: string, as: Record<string, string>, extra: string[]) {
	// `session()` starts `claude` where the runner is. Moved only now, not spawned in the clone, so
	// `bun` itself never read a `bunfig.toml` a session can write; on the host the launcher enters it.
	if (!under(clone).length) process.chdir(clone);
	try {
		// `session()` asks for JSON output itself; the structured answer is in the whole object it printed.
		const flags = [...extra, "--json-schema", SCHEMA];
		const ended = await session(prompt, HOUR, process.kill, true, as, flags, under(clone));
		const answer = JSON.parse(ended.printed).structured_output as { outcome?: unknown; summary?: unknown } | undefined;
		return !ended.late && typeof answer?.summary === "string" ? OUTCOMES.find((o) => o === answer?.outcome) : undefined;
	} catch {
		// A session that cannot start reads as no answer, so the clone is still put back.
		return undefined;
	}
}
