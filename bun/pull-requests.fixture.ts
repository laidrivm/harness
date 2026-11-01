/**
 * `readPullRequests` and `readPullRequest` spawned in a fabricated
 * repository, with a `gh` stub on `PATH` that logs its arguments and answers
 * what the case sets, for `pull-requests.test.ts`. `afterAll` is not
 * registered here: the test file registers `diff-budget.fixture.ts`'s
 * `cleanup` itself.
 */
import { chmodSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir, git } from "./diff-budget.fixture.ts";

const module = join(import.meta.dir, "pull-requests.ts");

type Case = {
	origin?: string | null;
	answer?: string;
	code?: number;
	branch?: string;
	config?: [string, string][];
	/** A mint command stub: what it prints and its exit status. */
	mint?: [string, number];
	/** The repository handed to the read; the child then has no `git` on `PATH`. */
	repo?: { owner: string; repo: string };
	/** The pull request's number as the `Pointer` holds it: the read is then `readPullRequest`'s. */
	number?: string;
};

/** The read's result, `"failed"` for undefined, and the stub's calls; `tokens` is the `GH_TOKEN` each `gh` call saw. */
export function read(c: Case = {}) {
	const dir = emptyDir("pull-requests-repo-");
	git(dir, "init", "-q");
	if (c.origin !== null) git(dir, "remote", "add", "origin", c.origin ?? "https://github.com/o/r.git");
	for (const [key, value] of c.config ?? []) git(dir, "config", key, value);
	const bin = emptyDir("pull-requests-bin-");
	if (!c.repo) symlinkSync(Bun.which("git") ?? "git", join(bin, "git"));
	const log = join(bin, "calls");
	const tokens = join(bin, "tokens");
	writeFileSync(
		join(bin, "gh"),
		`#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nprintf '%s\\n' "\${GH_TOKEN-}" >> '${tokens}'\nprintf '%s' '${c.answer ?? "[]"}'\nexit ${c.code ?? 0}\n`,
	);
	chmodSync(join(bin, "gh"), 0o755);
	const mint = c.mint && join(bin, "mint");
	if (mint && c.mint) writeFileSync(mint, `#!/bin/sh\nprintf 'mint %s\\n' "$*" >> '${log}'\nprintf '%s' '${c.mint[0]}'\nexit ${c.mint[1]}\n`, { mode: 0o755 });
	const entry = join(bin, "entry.ts");
	const reader = c.number === undefined ? "readPullRequests" : "readPullRequest";
	writeFileSync(entry, `import { ${reader} } from ${JSON.stringify(module)};\nconsole.log(JSON.stringify(${reader}(process.argv[2], JSON.parse(process.argv[3]) ?? undefined) ?? "failed"));\n`);
	// HOME and no system config: the user's own `insteadOf` rewrites stay out.
	const env = { PATH: bin, HOME: emptyDir("pull-requests-home-"), GIT_CONFIG_NOSYSTEM: "1", ...(mint ? { HARNESS_GITHUB_APP_MINT: `${mint} -n` } : {}) };
	const p = Bun.spawnSync([process.execPath, entry, c.number ?? c.branch ?? "feat/x", JSON.stringify(c.repo ?? null)], { cwd: dir, env });
	const lines = (file: string) => {
		try {
			return readFileSync(file, "utf8").split("\n").filter(Boolean);
		} catch {
			// The read never called `gh`.
			return [];
		}
	};
	return { result: JSON.parse(p.stdout.toString() || '"crashed"'), calls: lines(log), tokens: lines(tokens) };
}

/** A pull request as the REST endpoint lists it. */
export const el = (number: number, state: string, merged_at: unknown = null, full_name = "o/r", id = 1) => ({
	number,
	state,
	merged_at,
	head: { sha: `s${number}`, repo: { id, full_name } },
	base: { repo: { id: 1, full_name: "o/r" } },
});
export const answer = (...list: unknown[]) => JSON.stringify(list);
export const QUERY = "api repos/o/r/pulls?head=o:feat%2Fx&state=all&per_page=100";
