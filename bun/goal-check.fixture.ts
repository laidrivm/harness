/**
 * What the goal check's test files need to drive it: `goal-check.ts` spawned
 * as a goal's condition or a launcher runs it, in a repository built for each
 * case on a branch named `feature`. The environment is built from what the case
 * needs: `XDG_STATE_HOME` a directory of its own, and `PATH` holding only `git`
 * and a stub `gh`, so no case reads the user's ledger or reaches GitHub.
 *
 * Its own module because the cases split across two files, under the 300-line
 * cap. `afterAll` is not registered here: each test file registers
 * `diff-budget.fixture.ts`'s `cleanup` itself.
 */
import {
	appendFileSync,
	chmodSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { emptyDir, git, repo } from "./diff-budget.fixture.ts";
import { RUNNER_STEPS } from "./gate-ledger.ts";

const check = join(import.meta.dir, "goal-check.ts");
export const CHANGE = "openspec/changes/demo";

export const out = (dir: string, ...args: string[]) =>
	Bun.spawnSync(["git", ...args], { cwd: dir }).stdout.toString().trim();
export const head = (dir: string) => out(dir, "rev-parse", "HEAD");

/**
 * What the stub `gh` answers, after failing its first `fails` calls. `hang`
 * makes those calls sleep 30 s instead of exiting 1, and `stubborn` makes the
 * sleep ignore `SIGTERM`, since an ignored signal stays ignored across `exec`.
 * `delay` is the seconds a call sleeps before it answers.
 */
type Gh = {
	answer: string;
	code: number;
	fails?: number;
	hang?: boolean;
	stubborn?: boolean;
	delay?: number;
} | null;

/**
 * `PATH` for the check: `git`, and a `gh` answering only the check's query.
 * The stub appends a line to `calls` beside it on every call, so it can fail
 * a set number of times and a case can count the tries.
 */
function bin(gh: Gh): string {
	const dir = emptyDir("goal-check-bin-");
	symlinkSync(Bun.which("git") ?? "git", join(dir, "git"));
	if (!gh) return dir;
	const query = "api repos/o/demo/pulls?head=o:feature&state=all&per_page=100";
	const calls = join(dir, "calls");
	// `PATH` holds no `sleep`, hence the absolute path.
	const fail = gh.hang ? `${gh.stubborn ? "trap '' TERM; " : ""}exec /bin/sleep 30` : "exit 1";
	writeFileSync(
		join(dir, "gh"),
		// Shell builtins alone count the calls: `PATH` holds no `wc`.
		`#!/bin/sh\necho >> "${calls}"\nn=0; while read -r _; do n=$((n + 1)); done < "${calls}"\nif [ $n -le ${gh.fails ?? 0} ]; then ${fail}; fi\n${gh.delay ? `/bin/sleep ${gh.delay}\n` : ""}if [ "$*" = "${query}" ]; then printf '%s' '${gh.answer}'; exit ${gh.code}; fi\nexit 9\n`,
	);
	chmodSync(join(dir, "gh"), 0o755);
	return dir;
}

/**
 * A pull request of `o/demo` as the REST endpoint lists it, from the state the
 * read translates it to; an undefined state is left out, and reads `CLOSED`.
 */
export const pr = (sha: string, state?: string) => ({
	state: state === undefined ? undefined : state === "OPEN" ? "open" : "closed",
	merged_at: state === "MERGED" ? "2026-10-20T00:00:00Z" : null,
	head: { sha, repo: { id: 1, full_name: "o/demo" } },
	base: { repo: { id: 1, full_name: "o/demo" } },
});

/** A `gh` that answers at once with these pull requests. */
export const prs = (...list: object[]) => ({ answer: JSON.stringify(list), code: 0 });

/** An open pull request whose head is the repository's `HEAD`. */
const prAt = (dir: string) => prs(pr(head(dir), "OPEN"));

/**
 * Appends ledger lines; a string is written as it stands, a torn line say,
 * and an array as its lines, so a run's records go in as `runRecord` gives them.
 */
export function ledger(state: string, ...lines: (object | string)[]): void {
	mkdirSync(join(state, "harness"), { recursive: true });
	for (const line of lines.flat())
		appendFileSync(
			join(state, "harness", "gates.jsonl"),
			`${typeof line === "string" ? line : JSON.stringify(line)}\n`,
		);
}

/** The runner's records of `commit` in `dir`'s checkout, one per step, each ending in `decision`. */
export const runRecord = (
	dir: string,
	decision = "pass",
	commit = head(dir),
) =>
	RUNNER_STEPS.map((rule) => ({
		gate: "pre-pr",
		decision,
		rule,
		project: out(dir, "rev-parse", "--show-toplevel"),
		commit,
	}));

/** A state directory whose ledger holds the given lines. */
export function stateWith(...lines: (object | string)[]): string {
	const state = emptyDir("goal-check-state-");
	if (lines.length) ledger(state, ...lines);
	return state;
}

/**
 * The check run in `dir`. By default the ledger holds a passing run record of
 * `HEAD` and `gh` answers with an open pull request at `HEAD`, so a case
 * changes only the condition it is about. The check retries `gh` with no
 * pause, so the tries are the ones that ship and no case sleeps; `calls` is
 * how many it made.
 */
export function run(
	dir: string,
	args: string[],
	opts: { gh?: Gh; state?: string; env?: Record<string, string> } = {},
) {
	const state = opts.state ?? stateWith(runRecord(dir));
	// The read names its repository from `origin`, which the stub answers for;
	// a directory outside any repository stays as the case made it.
	const ok = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: dir }).exitCode === 0;
	if (ok("rev-parse", "--git-dir") && !ok("remote", "get-url", "origin"))
		git(dir, "remote", "add", "origin", "https://github.com/o/demo.git");
	const path = bin(opts.gh === undefined ? prAt(dir) : opts.gh);
	const call = Bun.spawnSync([process.execPath, check, ...args], {
		cwd: dir,
		env: {
			PATH: path,
			HOME: emptyDir("goal-check-home-"),
			XDG_STATE_HOME: state,
			CLAUDE_CODE_SESSION_ID: "s-1",
			GOAL_CHECK_RETRY_MS: "0",
			...opts.env,
		},
	});
	const text = call.stdout.toString().trim();
	let calls = 0;
	try {
		calls = readFileSync(join(path, "calls"), "utf8").split("\n").length - 1;
	} catch {
		// No stub `gh`, or the check never called it.
	}
	return { code: call.exitCode, last: text.split("\n").at(-1) ?? "", state, calls };
}

/** One gate's records in a state directory's ledger, the goal check's by default. */
export function records(state: string, gate = "goal"): Record<string, unknown>[] {
	try {
		return readFileSync(join(state, "harness", "gates.jsonl"), "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line))
			.filter((r) => r.gate === gate);
	} catch {
		return [];
	}
}

export const proposal = () =>
	repo({}, { [`${CHANGE}/proposal.md`]: "# demo\n" });
export const tasks = (text: string) =>
	repo({}, { [`${CHANGE}/tasks.md`]: text });
export const archived = (keep = false) =>
	repo(
		{ [`${CHANGE}/proposal.md`]: "# demo\n" },
		{
			[`${CHANGE}/proposal.md`]: keep ? "# demo, kept\n" : null,
			"openspec/changes/archive/2026-10-13-demo/proposal.md": "# demo\n",
		},
	);
export const TWO = "## 1. First\n\n- [ ] 1.1 a\n\n## 2. Second\n\n- [x] 2.1 b\n";
export const THREE = `${TWO}\n## 3. Third\n\n- [x] 3.1 c\n`;
