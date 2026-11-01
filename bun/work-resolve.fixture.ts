/**
 * `bun bun/work.ts resolve` run as a session runs it, in `work-finish.fixture.ts`'s
 * checkout on `feature`, whose `origin` names `o/demo`, with a `PATH` of a
 * logging `git` and a `gh` stub that answers each call by its arguments: the
 * pull-request read in turn, the threads query, each mutation by its place.
 * Both are bun scripts, so a call is logged with the time it was made.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir } from "./diff-budget.fixture.ts";
import { pr } from "./goal-check.fixture.ts";
import { checkout } from "./work-finish.fixture.ts";

export const A = "a".repeat(40);
export const B = "b".repeat(40);

/** Pull request `n` of `o/demo`, open, as REST lists it, its head at `sha`. */
export const open = (n: number, sha = A) => ({ ...pr(sha, "OPEN"), number: n, draft: true });

/** A review thread whose first comment is `id`, by `login` (`null`: a deleted author), with `replies` after it. */
export const thread = (id: string, { login = "coderabbitai" as string | null, resolved = false, outdated = false, replies = [] as string[] } = {}) => ({
	id: `T_${id}`,
	isResolved: resolved,
	isOutdated: outdated,
	comments: { nodes: [id, ...replies].map((fullDatabaseId) => ({ fullDatabaseId, author: login === null ? null : { login } })) },
});

/** One page of the threads query, as `gh api graphql --paginate` prints each. */
export const page = (...nodes: object[]) => ({
	data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } },
});

/**
 * The stub's answers: `pulls` is the pull-request list of each read in turn,
 * the last repeating, and `pullsCode` each read's exit code; `pages` the
 * threads read's pages, which `--slurp` prints as one array, and `threadsCode`
 * its exit code; `fail` the places, from 0, of the mutations that fail.
 */
export type Gh = { pulls?: object[][]; pullsCode?: number[]; pages?: object[]; threadsCode?: number; fail?: number[] };

export type Call = { git?: string[]; gh?: string[]; at: number };

const stub = (dir: string, name: string, body: string) => {
	const path = join(dir, name);
	writeFileSync(path, `#!${process.execPath}\n${body}`);
	chmodSync(path, 0o755);
};

function bin(gh: Gh) {
	const dir = emptyDir("work-resolve-bin-");
	const real = Bun.which("git");
	if (!real) throw new Error("no git on PATH");
	const log = join(dir, "calls");
	writeFileSync(join(dir, "gh.json"), JSON.stringify(gh));
	const append = `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify({ KIND: process.argv.slice(2), at: Date.now() }) + "\\n");`;
	stub(dir, "git", `${append.replace("KIND", "git")}\nprocess.exit(Bun.spawnSync([${JSON.stringify(real)}, ...process.argv.slice(2)], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exitCode ?? 1);\n`);
	stub(
		dir,
		"gh",
		[
			`const fs = require("node:fs");`,
			`const args = process.argv.slice(2);`,
			`const kind = (a) => a[0] !== "api" ? "other" : a[1].startsWith("repos/") ? "pulls" : a.some((s) => s.startsWith("query=mutation")) ? "mutation" : a[1] === "graphql" ? "threads" : "other";`,
			`const prior = fs.existsSync(${JSON.stringify(log)}) ? fs.readFileSync(${JSON.stringify(log)}, "utf8").split("\\n").filter(Boolean).map(JSON.parse).filter((c) => c.gh && kind(c.gh) === kind(args)).length : 0;`,
			append.replace("KIND", "gh"),
			`const gh = JSON.parse(fs.readFileSync(${JSON.stringify(join(dir, "gh.json"))}, "utf8"));`,
			`const fail = (code) => { console.error("GraphQL: stub failure"); process.exit(code); };`,
			`if (kind(args) === "pulls") { const code = gh.pullsCode?.[prior] ?? 0; if (code) fail(code); const list = gh.pulls ?? [[]]; console.log(JSON.stringify(list[Math.min(prior, list.length - 1)])); }`,
			`else if (kind(args) === "threads") { if (gh.threadsCode) fail(gh.threadsCode); console.log(JSON.stringify(gh.pages ?? [])); }`,
			`else if (kind(args) === "mutation") { if (gh.fail?.includes(prior)) fail(1); console.log('{"data":{"resolveReviewThread":{"thread":{"isResolved":true}}}}'); }`,
			`else process.exit(9);`,
			"",
		].join("\n"),
	);
	return { dir, calls: (): Call[] => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []) };
}

export type Resolve = { args?: string[]; cwd?: string; gh?: Gh; env?: Record<string, string> };

/** `bun bun/work.ts resolve --pr 7 --head A --comment 11`, or `args`, and what it did. */
export async function resolve({ args = ["resolve", "--pr", "7", "--head", A, "--comment", "11"], cwd = checkout(), gh = {}, env }: Resolve = {}) {
	const path = bin(gh);
	const home = emptyDir("work-resolve-home-");
	const child = Bun.spawn([process.execPath, join(import.meta.dir, "work.ts"), ...args], {
		cwd,
		env: { PATH: path.dir, HOME: home, XDG_CONFIG_HOME: home, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	const calls = path.calls();
	const gh_ = calls.filter((c) => c.gh);
	const kind = (a: string[]) => (a[1].startsWith("repos/") ? "pulls" : a.some((s) => s.startsWith("query=mutation")) ? "mutation" : "threads");
	return {
		out,
		err,
		code,
		lines: out.trim().split("\n").filter(Boolean),
		calls,
		reads: gh_.filter((c) => kind(c.gh as string[]) === "pulls"),
		threads: gh_.filter((c) => kind(c.gh as string[]) === "threads"),
		/** The thread id each mutation named. */
		mutations: gh_.filter((c) => kind(c.gh as string[]) === "mutation").map((c) => (c.gh as string[]).find((s) => s.startsWith("t="))?.slice(2)),
	};
}
