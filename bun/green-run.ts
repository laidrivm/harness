#!/usr/bin/env bun
/**
 * Whether a harness commit's `test` runs make it green, as both the bump
 * (`bump.ts`) and the deploy (`orchestrator/deploy.sh`) decide it.
 *
 * Both read `commits/<sha>/check-runs?check_name=test&filter=latest`, whose
 * `latest` keeps the newest run per check suite, not per commit: a commit
 * that a second workflow run tested lists one run in each suite. So the
 * newest `github-actions` run decides, by the largest `id`, since ids grow
 * with creation; an older suite's success never outvotes it.
 *
 * Run as a script, it reads a JSON array of the page bodies read so far, at
 * least one, on standard input and exits 0 for green, 1 for not, 2 for input
 * it cannot read and 3 for another page wanted. It imports nothing, so
 * `deploy.sh` runs it under the runner image's bun with no `node_modules`.
 */

export type Run = { id: number; conclusion: string | null; app?: { slug?: string } | null };

/** Whether the newest `github-actions` run concluded `success`; no such run is not green. */
export function green(runs: Run[]): boolean {
	const ours = runs.filter((run) => run.app?.slug === "github-actions");
	if (ours.length === 0) return false;
	return ours.reduce((newest, run) => (run.id > newest.id ? run : newest)).conclusion === "success";
}

/**
 * The runs of the page bodies read so far, or `more` while they hold fewer
 * than the first's `total_count`, which counts the filtered runs, not the
 * page's. Throws on a body it cannot read, and on a last page with no runs
 * while the count is short, so a read that pages until this answers ends.
 */
export function collect(pages: unknown[]): Run[] | "more" {
	if (pages.length === 0) return "more";
	const runs: Run[] = [];
	let total = 0;
	for (const [i, page] of pages.entries()) {
		const body = page as { total_count?: unknown; check_runs?: unknown };
		if (typeof body?.total_count !== "number") throw new Error(`page ${i + 1} names no total_count`);
		if (!Array.isArray(body.check_runs)) throw new Error(`page ${i + 1} lists no check_runs`);
		if (!body.check_runs.every((run) => typeof run?.id === "number"))
			throw new Error(`page ${i + 1} lists a run with no id`);
		if (i === 0) total = body.total_count;
		runs.push(...body.check_runs);
	}
	if (runs.length >= total) return runs;
	if ((pages.at(-1) as { check_runs: unknown[] }).check_runs.length === 0)
		throw new Error(`a page with no runs after ${runs.length} of ${total}`);
	return "more";
}

if (import.meta.main) {
	let runs: Run[] | "more";
	try {
		const pages: unknown = JSON.parse(await Bun.stdin.text());
		// The caller pipes the pages it read, so none means a body that added none, and `more` would page forever.
		if (!Array.isArray(pages) || pages.length === 0) throw new Error("standard input is no array of pages");
		runs = collect(pages);
	} catch (error) {
		console.error(`green-run: ${(error as Error).message}`);
		process.exit(2);
	}
	process.exit(runs === "more" ? 3 : green(runs) ? 0 : 1);
}
