/**
 * What `work.ts finish`'s three test files share: the command run as a session
 * runs it, in a checkout on `feature` whose `origin` is a bare repository at a
 * path ending `o/demo.git`, so `origin` names `o/demo`; a `gh` stub logging
 * every call; the ask settings and Notion stub of `work-take.fixture.ts`; and
 * a ledger holding the runner's records of `HEAD` from `goal-check.fixture.ts`
 * unless the case gives its own.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir, git, repo } from "./diff-budget.fixture.ts";
import { out as gitOut, pr, records, runRecord, stateWith } from "./goal-check.fixture.ts";
import { CARD, home, notion, type Stub, TOKEN } from "./work-take.fixture.ts";

export { CARD };
export const BRANCH = "feature";

/** A checkout on `feature` one commit past `main`, with `main` on its bare `origin`; `coderabbit` commits a `.coderabbit.yaml` in it. */
export function checkout(coderabbit = false): string {
	const dir = repo({}, { "a.txt": "a\n", ...(coderabbit ? { ".coderabbit.yaml": "reviews: {}\n" } : {}) });
	const bare = join(emptyDir("work-finish-origin-"), "o", "demo.git");
	mkdirSync(bare, { recursive: true });
	git(bare, "init", "-q", "--bare");
	git(dir, "remote", "add", "origin", bare);
	git(dir, "push", "-q", "origin", "main");
	return dir;
}

/** The commit `origin` holds on `feature`, or "" for none. */
export const remote = (dir: string) =>
	Bun.spawnSync(["git", "ls-remote", "origin", `refs/heads/${BRANCH}`], { cwd: dir }).stdout.toString().split("\t")[0];

/** A pull request of `o/demo` numbered `n`, as REST lists it, `draft` or not. */
export const pull = (n: number, state: string, draft: boolean) => ({ ...pr("x", state), number: n, draft });

/**
 * The stub's answers: `before` is the pull request list until `gh pr create`
 * runs, `after` from then on; `read`, `create` and `ready` are those calls'
 * exit codes. `runs` answers the check-run reads in turn, the last repeated:
 * a list of runs, printed one a line as `--jq` prints them, or an exit code
 * with no output.
 */
export type Gh = { before?: object[]; after?: object[]; read?: number; create?: number; ready?: number; runs?: (object[] | number)[] };

/** A `PATH` of git and a `gh` stub; `calls()` is every `gh` call, and `push` where the checkout's pre-push hook ran. */
function bin(gh: Gh) {
	const dir = emptyDir("work-finish-bin-");
	const found = Bun.which("git");
	if (!found) throw new Error("no git on PATH");
	symlinkSync(found, join(dir, "git"));
	const log = join(dir, "calls");
	writeFileSync(join(dir, "before"), JSON.stringify(gh.before ?? []));
	writeFileSync(join(dir, "after"), JSON.stringify(gh.after ?? []));
	const runs = gh.runs ?? [[]];
	runs.forEach((answer, i) => {
		writeFileSync(join(dir, `runs${i}`), typeof answer === "number" ? "" : answer.map((run) => `${JSON.stringify(run)}\n`).join(""));
		writeFileSync(join(dir, `code${i}`), `${typeof answer === "number" ? answer : 0}\n`);
	});
	writeFileSync(join(dir, "n"), "0\n");
	writeFileSync(
		join(dir, "gh"),
		[
			"#!/bin/sh",
			`printf '%s\\n' "$*" >> '${log}'`,
			'case "$1 $2" in',
			// Builtins alone: `PATH` holds no `cat` or `grep`.
			`"api repos/o/demo/commits/"*) read -r n < '${dir}/n'; if [ "$n" -lt ${runs.length - 1} ]; then echo $((n + 1)) > '${dir}/n'; fi; while IFS= read -r l; do printf '%s\\n' "$l"; done < "${dir}/runs$n"; read -r c < "${dir}/code$n"; exit "$c" ;;`,
			`"api "*) f='${dir}/before'; if [ -f '${dir}/made' ]; then f='${dir}/after'; fi; read -r j < "$f"; printf '%s' "$j"; exit ${gh.read ?? 0} ;;`,
			`"pr create") : > '${dir}/made'; exit ${gh.create ?? 0} ;;`,
			`"pr ready") exit ${gh.ready ?? 0} ;;`,
			"esac",
			"exit 9",
			"",
		].join("\n"),
	);
	chmodSync(join(dir, "gh"), 0o755);
	return { dir, log, calls: () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []) };
}

/** `hook` is the exit code of the checkout's pre-push hook, which logs `push` beside the `gh` calls; git runs it even for a push of nothing. */
export type Finish = { args?: string[]; cwd?: string; gh?: Gh; stub?: Stub; state?: string; config?: string; hook?: number; env?: Record<string, string> };

/** `bun bun/work.ts finish --card CARD`, or `args`, and what it did. */
export async function finish({ args = ["finish", "--card", CARD], cwd = checkout(), gh = {}, stub, state, config = home(), hook = 0, env }: Finish = {}) {
	const ledger = state ?? stateWith(runRecord(cwd));
	const path = bin(gh);
	// The checkout's top: a case may run from a subdirectory.
	const hooks = join(gitOut(cwd, "rev-parse", "--show-toplevel"), ".git", "hooks");
	mkdirSync(hooks, { recursive: true });
	writeFileSync(join(hooks, "pre-push"), `#!/bin/sh\nprintf 'push\\n' >> '${path.log}'\nexit ${hook}\n`);
	chmodSync(join(hooks, "pre-push"), 0o755);
	const api = notion(stub);
	const child = Bun.spawn([process.execPath, join(import.meta.dir, "work.ts"), ...args], {
		cwd,
		env: { PATH: path.dir, HOME: config, XDG_CONFIG_HOME: config, XDG_STATE_HOME: ledger, HARNESS_NOTION_API_URL: api.url, HARNESS_CODERABBIT_POLL_MS: "1", ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if ((out + err).includes(TOKEN)) throw new Error("the token was printed");
	const refusals = records(ledger, "finish").map(({ decision, rule, commit }) => ({ decision, rule, commit }));
	const last = out.trim().split("\n").at(-1) ?? "";
	return { out, err, code, last, calls: path.calls(), seen: api.seen.map((s) => s.call), refusals, cwd, remote: remote(cwd) };
}
