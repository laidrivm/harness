/**
 * The calls and check runs the `work.ts finish` cases where the checkout
 * tracks `.coderabbit.yaml` share, over `work-finish.fixture.ts`. `afterAll`
 * is not registered here: each test file registers its own.
 */
import { head } from "./goal-check.fixture.ts";
import { BRANCH, CARD, checkout, finish, type Gh, pull } from "./work-finish.fixture.ts";

export const READ = `api repos/o/demo/pulls?head=o:${BRANCH}&state=all&per_page=100`;
export const READY = "pr ready 7 -R o/demo";
export const DRAFT = [pull(7, "OPEN", true)];
export const OPENING = ["finish", "--card", CARD, "--title", "Demo", "--body-file", "body.md"];

/** One check run of CodeRabbit's app. */
export const run = (status: string, conclusion: string | null, title: string) => ({
	name: "CodeRabbit",
	status,
	conclusion,
	started_at: "2026-10-31T09:55:22Z",
	output: { title },
	app: { slug: "coderabbitai" },
});
export const SKIPPED = run("completed", "skipped", "Review skipped");
export const RUNNING = run("in_progress", null, "Review in progress");
export const DONE = run("completed", "success", "Finished");
export const LIMITED = run("completed", "neutral", "Review rate limited");

/** The check-run read of `cwd`'s `HEAD`, as the stub logs it. */
export const runs = (cwd: string) =>
	`api repos/o/demo/commits/${head(cwd)}/check-runs?filter=all&per_page=100 --paginate --jq .check_runs[]`;
export const times = (n: number, call: string) => Array<string>(n).fill(call);
export const short = (cwd: string) => head(cwd).slice(0, 7);

export const COMMENTS = "api repos/o/demo/issues/7/comments?per_page=100 --paginate --jq .[] | {created_at, body}";
export const ASK = "pr comment 7 -R o/demo --body @coderabbitai review";

/** `finish` on draft #7 in a checkout tracking `.coderabbit.yaml`, the check runs answering `answers` in turn, and the rest of the stub `more`. */
export async function watched(answers: (object[] | number)[], more: Gh = {}) {
	const cwd = checkout(true);
	return { cwd, ...(await finish({ cwd, gh: { before: DRAFT, runs: answers, ...more } })) };
}
