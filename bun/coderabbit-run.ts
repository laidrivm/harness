/**
 * CodeRabbit's state of a commit, named from every check run its app posted
 * on it, never from a comment's text (`finish-review-arrives`'s design, *One
 * module reads the check runs*): precedence over all runs, so the order
 * GitHub lists them in decides nothing.
 */
import { limit, positive } from "./pull-requests.ts";

/** A check run as `commits/<sha>/check-runs` lists it, only the fields read here. */
export type Run = {
	name?: unknown;
	status?: unknown;
	conclusion?: unknown;
	started_at?: unknown;
	output?: { title?: unknown } | null;
	app?: { slug?: unknown } | null;
};

export type State =
	| { name: "reviewing" | "reviewed" | "rate limited" | "skipped" | "no run" }
	| { name: "other"; conclusion: string; title: string }
	| { name: "unread"; why: string };

/**
 * What counts as CodeRabbit's review of a commit: a run that ended in
 * `conclusion` with a title not opening `skippedTitle`, since a skip is also
 * reported as a success. The `coderabbit` skill's step 1 reads the same rule.
 */
export const REVIEWED = { conclusion: "success", skippedTitle: "Review skipped" } as const;

const title = (run: Run) => String(run.output?.title ?? "");

/** The runs CodeRabbit's own app posted: another app's run named `CodeRabbit` stands in for nothing. */
export const own = (runs: Run[]) => runs.filter((run) => run.name === "CodeRabbit" && run.app?.slug === "coderabbitai");

/** The state `runs` give, by the spec's precedence. */
export function state(runs: Run[]): State {
	const mine = own(runs);
	const skipped = (run: Run) => run.conclusion === "skipped" || title(run).startsWith(REVIEWED.skippedTitle);
	if (mine.some((run) => run.status !== "completed")) return { name: "reviewing" };
	if (mine.some((run) => run.conclusion === REVIEWED.conclusion && !title(run).startsWith(REVIEWED.skippedTitle))) return { name: "reviewed" };
	if (mine.some((run) => run.conclusion === "neutral" && title(run) === "Review rate limited")) return { name: "rate limited" };
	const other = mine.find((run) => !skipped(run));
	if (other) return { name: "other", conclusion: String(other.conclusion), title: title(other) };
	return mine.length ? { name: "skipped" } : { name: "no run" };
}

/** Every check run on `sha` in `repo`, across every page, or the unread state saying why not. Killed at `limit()`, as every `gh` read is. */
export function read(repo: string, sha: string): Run[] | { name: "unread"; why: string } {
	const query = `repos/${repo}/commits/${sha}/check-runs?filter=all&per_page=100`;
	let run: ReturnType<typeof Bun.spawnSync>;
	try {
		// `filter=all`: the default `latest` keeps one run per name, and which of a skip and a review is latest is CodeRabbit's order.
		run = Bun.spawnSync(["gh", "api", query, "--paginate", "--jq", ".check_runs[]"], { timeout: limit(), killSignal: "SIGKILL" });
	} catch (error) {
		return { name: "unread", why: `gh could not start: ${(error as Error).message}` };
	}
	const said = run.stdout?.toString() ?? "";
	// A run killed at the limit has no exit code.
	const first = (run.stderr?.toString() || said).trim().split("\n")[0];
	if (run.exitCode !== 0) return { name: "unread", why: `gh exited ${run.exitCode ?? "killed at its limit"}${first ? `: ${first}` : ""}` };
	try {
		return said
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const parsed: unknown = JSON.parse(line);
				if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
				return parsed as Run;
			});
	} catch {
		return { name: "unread", why: "gh's output is not one JSON object a line" };
	}
}

/** The poll interval in ms: `HARNESS_CODERABBIT_POLL_MS` when it is a positive whole number, 5 s otherwise. */
export const interval = () => positive("HARNESS_CODERABBIT_POLL_MS", 5000);
