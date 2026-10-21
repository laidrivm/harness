/**
 * What the sweep's two test files need: `bun/pr-sweep.ts` run with a stub
 * `gh` first on `PATH`. The stub answers each call from the case's table,
 * keyed by the call's whole argument string, logs every call and the
 * `GH_TOKEN` it saw, and exits 9 on
 * a call the table lacks, so an unexpected call shows in `calls` and fails.
 *
 * The stub is a shell `case`, not a bun script: a case makes a dozen calls,
 * and a bun start per call is what loads the machine under parallel suites.
 * `afterAll` is not registered here: each test file registers
 * `diff-budget.fixture.ts`'s `cleanup` itself.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir } from "./diff-budget.fixture.ts";

const script = join(import.meta.dir, "pr-sweep.ts");

/** What the stub prints for one call; an object is printed as JSON. */
export type Answer = { out?: string | object; err?: string; code?: number; sleep?: number };
export type Table = Record<string, Answer>;

export const R = "o/r";
export const PIN = "c".repeat(40);
export const LOGIN = "api user --jq .login";
export const LIST =
	"pr list --repo o/r --state open --limit 1000 --json number,headRefName,headRefOid,baseRefName,author,isCrossRepository,isDraft,mergeable,statusCheckRollup";
export const NOT_FOUND: Answer = { err: "gh: Not Found (HTTP 404)", code: 1 };

export const sha = (n: number) => n.toString(16).padStart(40, "0");
export const file = (text: string) => ({ content: Buffer.from(text).toString("base64"), encoding: "base64" });

/** A check run as the rollup lists it. */
export const run = (name: string, conclusion: string, startedAt: string | null = "2026-10-20T10:00:00Z", status = "COMPLETED") => ({
	__typename: "CheckRun",
	name,
	workflowName: "CI",
	status,
	conclusion,
	startedAt,
});
/** A commit status as the rollup lists it. */
export const status = (context: string, state: string) => ({ __typename: "StatusContext", context, state });

/** An open, mergeable agent pull request by the credential's login, its one check green. */
export const pull = (n: number, over: object = {}) => ({
	number: n,
	headRefName: `feat/demo-${n}`,
	headRefOid: sha(n),
	baseRefName: "main",
	author: { login: "laidrivm", is_bot: false },
	isCrossRepository: false,
	isDraft: false,
	mergeable: "MERGEABLE",
	statusCheckRollup: [run("test", "SUCCESS")],
	...over,
});

export const compare = (base: string, head: string) => `api repos/o/r/compare/${base}...${head}`;
export const pkg = (n: number) => `api repos/o/r/contents/package.json?ref=${sha(n)}`;
export const commit = (n: number) => `api repos/o/r/commits/${sha(n)}`;
export const marks = (n: number) => `api repos/o/r/commits/${sha(n)}/status`;
export const mark = (n: number, description: string) =>
	`api -X POST repos/o/r/statuses/${sha(n)} -f state=success -f context=harness/sweep -f description=${description}`;

/** What a green head that pins no harness and is no merge answers, up to its mark. */
export const green = (n: number, description = "handed off: description"): Table => ({
	[compare("main", sha(n))]: { out: { behind_by: 0 } },
	[pkg(n)]: { out: file(JSON.stringify({ devDependencies: { harness: "github:laidrivm/harness#x" } })) },
	[commit(n)]: { out: { parents: [{ sha: "p" }] } },
	[mark(n, description)]: {},
});

/** The listing and the login, around the rest of the case's table. */
export const listing = (pulls: object[], rest: Table = {}): Table => ({
	[LOGIN]: { out: "laidrivm\n" },
	[LIST]: { out: pulls },
	...rest,
});

/** The stub `gh` for `table`, and what the sweep is spawned with. */
function prepare(table: Table, args: string[], env: Record<string, string>) {
	const dir = emptyDir("pr-sweep-");
	const bin = join(dir, "bin");
	const tmp = join(dir, "tmp");
	mkdirSync(bin);
	mkdirSync(tmp);
	const arms = Object.entries(table).map(([key, answer], i) => {
		const out = typeof answer.out === "string" ? answer.out : answer.out === undefined ? "" : JSON.stringify(answer.out);
		writeFileSync(join(dir, `${i}.out`), out);
		writeFileSync(join(dir, `${i}.err`), answer.err ?? "");
		const wait = answer.sleep ? `/bin/sleep ${answer.sleep}; ` : "";
		return `'${key}') ${wait}cat '${dir}/${i}.out'; cat '${dir}/${i}.err' >&2; exit ${answer.code ?? 0};;`;
	});
	writeFileSync(
		join(bin, "gh"),
		`#!/bin/sh\nprintf '%s\\n' "$*" >> '${dir}/calls'\nprintf '%s\\n' "\${GH_TOKEN-}" >> '${dir}/tokens'\ncase "$*" in\n${arms.join("\n")}\n*) exit 9;;\nesac\n`,
	);
	chmodSync(join(bin, "gh"), 0o755);
	return { dir, tmp, argv: ["bun", script, ...args], env: { PATH: `${bin}:${process.env.PATH}`, HOME: dir, TMPDIR: tmp, ...env } };
}

/** A file's lines, or none where no call wrote it. */
const logged = (file: string) => {
	try {
		return readFileSync(file, "utf8").replace(/\n$/, "").split("\n");
	} catch {
		return [];
	}
};

/** What a run left; `tokens` is the `GH_TOKEN` each call saw, in `calls`' order. */
function result(dir: string, tmp: string, code: number | null, out: string, err: string) {
	return {
		code,
		out,
		lines: out.trim() ? out.trim().split("\n").map((l) => JSON.parse(l)) : [],
		err,
		calls: logged(join(dir, "calls")),
		tokens: logged(join(dir, "tokens")),
		left: readdirSync(tmp),
	};
}

/** Runs the sweep against `table`; `lines` are its stdout lines parsed. */
export function sweep(table: Table, args: string[] = [R], env: Record<string, string> = {}) {
	const { dir, tmp, argv, env: full } = prepare(table, args, env);
	const p = Bun.spawnSync(argv, { env: full });
	return result(dir, tmp, p.exitCode, p.stdout.toString(), p.stderr.toString());
}

/** `sweep` without blocking, for a case whose stand-in API answers from the test's own process. */
export async function sweepAsync(table: Table, env: Record<string, string>) {
	const { dir, tmp, argv, env: full } = prepare(table, [R], env);
	const child = Bun.spawn(argv, { env: full, stdout: "pipe", stderr: "pipe" });
	const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
	return result(dir, tmp, await child.exited, out, err);
}
