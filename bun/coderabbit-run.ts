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
 * reported as a success. Exported for the `coderabbit` skill's step 1, which
 * reads the commit status today and is to read this rule (#358).
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

/** How a `gh` call that failed ended. */
export function exited(run: { exitCode: number | null; exitedDueToTimeout?: boolean; signalCode?: string | null }) {
	if (run.exitedDueToTimeout) return "gh was killed at its limit";
	return run.exitCode === null ? `gh was killed by ${run.signalCode ?? "a signal"}` : `gh exited ${run.exitCode}`;
}

/** The environment a `gh` call runs in: never coloured or pretty-printed, which would split `--jq`'s one object a line. */
export function plain() {
	const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1", CLICOLOR_FORCE: "0" };
	delete env.GH_FORCE_TTY;
	return env;
}

/**
 * `gh api <query> --paginate --jq <jq>` as the objects it prints, one a line
 * across every page, or the unread state saying why not. Killed at `limit()`,
 * as every `gh` read is.
 */
export function objects(query: string, jq: string): Record<string, unknown>[] | { name: "unread"; why: string } {
	let run: ReturnType<typeof Bun.spawnSync>;
	try {
		run = Bun.spawnSync(["gh", "api", query, "--paginate", "--jq", jq], { env: plain(), timeout: limit(), killSignal: "SIGKILL" });
	} catch (error) {
		return { name: "unread", why: `gh could not start: ${(error as Error).message}` };
	}
	const said = run.stdout?.toString() ?? "";
	const first = (run.stderr?.toString() || said).trim().split("\n")[0];
	if (run.exitCode !== 0) return { name: "unread", why: `${exited(run)}${first ? `: ${first}` : ""}` };
	try {
		return said
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const parsed: unknown = JSON.parse(line);
				if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
				return parsed as Record<string, unknown>;
			});
	} catch {
		return { name: "unread", why: "gh's output is not one JSON object a line" };
	}
}

/** Every check run on `sha` in `repo`, or the unread state saying why not. */
export const read = (repo: string, sha: string): Run[] | { name: "unread"; why: string } =>
	// `filter=all`: the default `latest` keeps one run per name, and which of a skip and a review is latest is CodeRabbit's order.
	objects(`repos/${repo}/commits/${sha}/check-runs?filter=all&per_page=100`, ".check_runs[]");

/** The earliest `started_at` of CodeRabbit's runs in `runs`, in ms, standing for when the commit arrived; `Infinity` for none. */
export const arrived = (runs: Run[]) => Math.min(...own(runs).map((run) => Date.parse(String(run.started_at))).filter(Number.isFinite));

/** The poll interval in ms: `HARNESS_CODERABBIT_POLL_MS` when it is a positive whole number, 5 s otherwise. */
export const interval = () => positive("HARNESS_CODERABBIT_POLL_MS", 5000);
