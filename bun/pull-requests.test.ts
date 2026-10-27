import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { type Pull, readyOne } from "./pull-requests.ts";

/**
 * `readPullRequests` spawned in a fabricated repository, with a `gh` stub on
 * `PATH` that logs its arguments and answers what the case sets. Bracketed
 * numbers are the proposal-stage `/zombies` ideas of `cloud-sessions`.
 */

afterAll(cleanup);

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
};

/** The read's result, `"failed"` for undefined, and the stub's calls; `tokens` is the `GH_TOKEN` each `gh` call saw. */
function read(c: Case = {}) {
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
	writeFileSync(entry, `import { readPullRequests } from ${JSON.stringify(module)};\nconsole.log(JSON.stringify(readPullRequests(process.argv[2], JSON.parse(process.argv[3]) ?? undefined) ?? "failed"));\n`);
	// HOME and no system config: the user's own `insteadOf` rewrites stay out.
	const env = { PATH: bin, HOME: emptyDir("pull-requests-home-"), GIT_CONFIG_NOSYSTEM: "1", ...(mint ? { HARNESS_GITHUB_APP_MINT: `${mint} -n` } : {}) };
	const p = Bun.spawnSync([process.execPath, entry, c.branch ?? "feat/x", JSON.stringify(c.repo ?? null)], { cwd: dir, env });
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
const el = (number: number, state: string, merged_at: unknown = null, full_name = "o/r", id = 1) => ({
	number,
	state,
	merged_at,
	head: { sha: `s${number}`, repo: { id, full_name } },
	base: { repo: { id: 1, full_name: "o/r" } },
});
const answer = (...list: unknown[]) => JSON.stringify(list);
const QUERY = "api repos/o/r/pulls?head=o:feat%2Fx&state=all&per_page=100";

describe("the read and its translation", () => {
	test("an empty list is a list, after one call [1]", () => {
		expect(read()).toEqual({ result: [], calls: [QUERY], tokens: [] });
	});

	// spec: orchestrator/a-private-repository-s-pull-requests
	test("with the key holder's mint command, the read alone holds a pull_requests=read token", () => {
		expect(read({ mint: ["ghs_read", 0] })).toEqual({ result: [], calls: ["mint -n o/r pull_requests=read", QUERY], tokens: ["ghs_read"] });
	});

	// spec: orchestrator/a-private-repository-s-pull-requests
	test("a mint that fails fails the read, with no gh call", () => {
		expect(read({ mint: ["", 1] })).toEqual({ result: "failed", calls: ["mint -n o/r pull_requests=read"], tokens: [] });
	});

	// spec: stage-goal/an-open-pull-request stage-goal/a-merged-pull-request stage-goal/a-pull-request-closed-unmerged
	test.each([
		["open", el(1, "open"), "OPEN", "[3]"],
		["closed with merged_at", el(2, "closed", "2026-10-20T00:00:00Z"), "MERGED", "[4]"],
		["closed with merged_at null", el(3, "closed"), "CLOSED", "[5]"],
		["closed with merged_at empty", el(4, "closed", ""), "CLOSED", "[8]"],
		["closed with no merged_at", { ...el(5, "closed"), merged_at: undefined }, "CLOSED", "[8]"],
		["an upper-case OPEN", el(6, "OPEN"), "CLOSED", "[9]"],
		["an unknown state", el(7, "reopened"), "CLOSED", "[9]"],
	])("%s reads %s %s", (_, pr, state) => {
		const { number, head } = pr as ReturnType<typeof el>;
		expect(read({ answer: answer(pr) }).result).toEqual([{ number, state, headRefOid: head.sha, draft: false }]);
	});

	test.each([
		["a draft", true, true],
		["a ready pull request", false, false],
		["a draft field that is no boolean", "true", false],
	])("%s reads draft %p as %p", (_, draft, expected) => {
		expect(read({ answer: answer({ ...el(3, "open"), draft }) }).result).toEqual([{ number: 3, state: "OPEN", headRefOid: "s3", draft: expected }]);
	});

	// spec: stage-goal/an-open-pull-request
	test("the API's order is kept, a mixed list element by element [6, 7]", () => {
		const list = [el(9, "closed"), el(8, "open"), el(7, "closed", "2026-10-19T00:00:00Z")];
		expect(read({ answer: answer(...list) }).result.map((p: { state: string }) => p.state)).toEqual(["CLOSED", "OPEN", "MERGED"]);
	});

	// spec: stage-goal/where-graphql-is-refused
	test("one REST call ending in per_page=100, no --paginate, no gh pr or graphql [10, 19]", () => {
		const { calls } = read();
		expect(calls).toEqual([QUERY]);
		expect(calls.join(" ")).not.toMatch(/--paginate|graphql|^pr /);
	});

	// spec: stage-goal/a-branch-name-the-query-string-would-split
	test("a branch holding &, # and / is encoded [11]", () => {
		expect(read({ branch: "a&b#c/d" }).calls).toEqual(["api repos/o/r/pulls?head=o:a%26b%23c%2Fd&state=all&per_page=100"]);
	});
});

describe("the repository origin names", () => {
	// spec: stage-goal/origin-in-each-form
	test.each([
		["HTTPS", "https://github.com/o/r.git", "[12]"],
		["scp", "git@github.com:o/r", "[13]"],
		["a proxy", "http://local_proxy@127.0.0.1:41623/git/o/r", "[14]"],
		["a local path", "/srv/git/o/r.git", "[15]"],
		["a trailing slash", "https://github.com/o/r/", "[15]"],
	])("%s origin names o/r %s", (_, origin) => {
		expect(read({ origin }).calls).toEqual([QUERY]);
	});

	// spec: stage-goal/no-owner-and-name-to-read
	test.each([
		["no origin", null, "[2]"],
		["one segment", "https://github.com/r", "[16]"],
		["a segment holding a space", "/srv/o p/r", "[17]"],
		["a segment holding %", "https://github.com/o/r%20x", "[17]"],
		["a repository of dots alone, .git stripped", "https://github.com/o/....git", "[17, review of #190]"],
		["a repository of dots alone", "https://github.com/o/...", "[17, review of #190]"],
		["an owner of dots alone", "https://github.com/.../r", "[17, review of #190]"],
	])("%s fails with no gh call %s", (_, origin) => {
		expect(read({ origin })).toEqual({ result: "failed", calls: [], tokens: [] });
	});

	// spec: stage-goal/origin-in-each-form
	test("an insteadOf rewrite is followed [18]", () => {
		const config: [string, string][] = [["url.https://proxy.example/git/x/other.insteadOf", "https://github.com/o/r"]];
		expect(read({ config }).calls).toEqual(["api repos/x/other/pulls?head=x:feat%2Fx&state=all&per_page=100"]);
	});

	// spec: stage-goal/a-fork-in-the-same-owner
	test("a non-object, a gone head repository and another repository are left out; the name is not compared [20]", () => {
		const gone = { ...el(2, "open"), head: { sha: "s2", repo: null } };
		const noBase = { ...el(6, "open"), base: { repo: null } };
		const list = [5, null, gone, noBase, el(3, "open", null, "o/r", 2), el(4, "open", null, "O/R")];
		expect(read({ answer: answer(...list) }).result).toEqual([{ number: 4, state: "OPEN", headRefOid: "s4", draft: false }]);
	});

	// spec: stage-goal/a-renamed-repository
	test("a repository renamed since origin was set keeps its own pull requests (review of #190)", () => {
		const renamed = { ...el(7, "open", null, "o/renamed"), base: { repo: { id: 1, full_name: "o/renamed" } } };
		expect(read({ answer: answer(renamed) }).result).toEqual([{ number: 7, state: "OPEN", headRefOid: "s7", draft: false }]);
	});

	// spec: stage-goal/a-fork-s-branch-of-the-same-name
	test("the head filter names origin's owner alone", () => {
		expect(read().calls[0]).toContain("head=o:feat%2Fx&");
	});
});

describe("a read that fails", () => {
	test.each([
		["a JSON object", { answer: "{}" }, "[21]"],
		["a 403 exit", { answer: '{"message":"Forbidden"}', code: 1 }, "[22]"],
		["output that is not JSON", { answer: "not json" }, "[24]"],
	])("%s fails %s", (_, c) => {
		expect(read(c).result).toBe("failed");
	});
});

describe("a repository handed to the read", () => {
	test("reads that repository and spawns no git, with none on PATH and no origin", () => {
		const { result, calls } = read({ origin: null, repo: { owner: "x", repo: "y" } });
		expect([result, calls]).toEqual([[], ["api repos/x/y/pulls?head=x:feat%2Fx&state=all&per_page=100"]]);
	});
});

describe("readyOne()", () => {
	const pull = (number: number, state: Pull["state"], draft: boolean): Pull => ({ number, state, headRefOid: `s${number}`, draft });

	test("answers the open pull request that is not a draft", () => {
		expect(readyOne([pull(3, "MERGED", false), pull(7, "OPEN", false)])).toEqual(pull(7, "OPEN", false));
	});

	test.each([
		["a draft", [pull(7, "OPEN", true)]],
		["a merged one", [pull(7, "MERGED", false)]],
		["a closed one", [pull(7, "CLOSED", false)]],
		["an empty list", []],
	])("answers none for %s", (_, pulls) => {
		expect(readyOne(pulls)).toBeUndefined();
	});
});
