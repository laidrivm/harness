#!/usr/bin/env bun
/**
 * A consumer's daily bump of its harness pin, run by its own CI as
 * `bun node_modules/harness/bun/bump.ts verify` from its root.
 *
 * `verify` runs in a job whose token cannot write: it moves the pin to the
 * harness's `main` once that commit's `test` run succeeded, then gates on the
 * new harness's sync and check and the consumer's own `bumpTest`, and reports
 * the target and the tree it checked. It pushes nothing. A head not yet green,
 * or already pinned, is a quiet day: exit 0 and no target.
 *
 * `land <sha> <tree>` runs in a second job, which may push: from a fresh
 * checkout it redoes the edit, running bun and the harness's own sync but no
 * consumer dependency, and pushes to `main` only the tree `verify` reported.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { movePin, pinOf } from "./bump-pin.ts";
import { read } from "./config.ts";

/** Runs `argv` in `cwd` and returns its exit code. */
type Run = (argv: string[], cwd: string) => number;
export type Deps = { api: string; token?: string; run: Run };

/**
 * Every path a bump writes, and so all it stages. Never `git add -A` whole:
 * a test run's leftovers would enter the tree, which the landing job never
 * produces, and every tree comparison would then fail.
 */
const WRITES = [
	"package.json",
	"bun.lock",
	"harness",
	".claude/settings.json",
	"bunfig.toml",
];

/**
 * The two steps both jobs run. No lifecycle script runs, so the only package
 * code that executes is the harness's own sync.
 */
const INSTALL = ["bun", "install", "--ignore-scripts"];
const SYNC = ["bun", "node_modules/harness/bun/sync.ts"];

async function get(deps: Deps, path: string): Promise<unknown> {
	const response = await fetch(`${deps.api}/repos/laidrivm/harness/${path}`, {
		headers: {
			accept: "application/vnd.github+json",
			...(deps.token ? { authorization: `Bearer ${deps.token}` } : {}),
		},
	});
	if (!response.ok)
		throw new Error(`GitHub ${path}: ${response.status} ${response.statusText}`);
	return response.json();
}

/**
 * The check run a harness commit must pass before a consumer adopts it: the
 * job in the harness's `.github/workflows/test.yml`. A run that is missing
 * reads as a quiet day, not a failure, so renaming that job would stop every
 * consumer's bumps without a sound. `bump-verify.test.ts` fails instead.
 */
export const CHECK = "test";

/** The harness's `main` head, when its latest `CHECK` run succeeded. */
async function greenHead(deps: Deps): Promise<string | undefined> {
	const { sha } = (await get(deps, "commits/main")) as { sha: string };
	const { check_runs } = (await get(
		deps,
		`commits/${sha}/check-runs?check_name=${CHECK}&filter=latest`,
	)) as { check_runs: { conclusion: string | null; app?: { slug?: string } }[] };
	// The name alone could be any app's; the harness's run is GitHub Actions'.
	const green = check_runs.some(
		(run) => run.conclusion === "success" && run.app?.slug === "github-actions",
	);
	return green ? sha : undefined;
}

function git(cwd: string, args: string[], env?: Record<string, string>): string {
	const run = Bun.spawnSync(["git", ...args], { cwd, env: env && { ...process.env, ...env } });
	// Named by its subcommand, past any `-c key=value` before it.
	const name = args.find((arg) => !arg.startsWith("-") && !arg.includes("="));
	if (run.exitCode !== 0)
		throw new Error(`git ${name}: ${run.stderr.toString().trim()}`);
	return run.stdout.toString().trim();
}

/** A step of the bump to `head`: its command must exit 0, or the bump stops. */
const stepper =
	(root: string, head: string, run: Run) => (name: string, argv: string[]) => {
		const code = run(argv, root);
		if (code !== 0)
			throw new Error(`the bump to ${head} failed at ${name}, exit ${code}`);
	};

/** Stages what the bump wrote and returns that tree's id. */
function stage(root: string): string {
	const written = WRITES.filter((path) => existsSync(join(root, path)));
	git(root, ["add", "-A", "--", ...written]);
	return git(root, ["write-tree"]);
}

/**
 * Checks the harness's newest green commit against the consumer at `root`,
 * returning it and the tree checked, or empty strings on a quiet day. Throws
 * naming the step that failed.
 *
 * The tree is taken after sync and check and before `bumpTest`, so it holds
 * exactly what the bump wrote: whatever the consumer's tests leave behind,
 * under any path, cannot enter it, and `land` reproduces it without them.
 */
export async function verify(
	root: string,
	deps: Deps,
): Promise<{ sha: string; tree: string }> {
	const bumpTest = read(root, "bumpTest");
	// `sh -c ""` exits 0, which would pass every bump with no test run at all.
	if (typeof bumpTest !== "string" || bumpTest.trim() === "")
		throw new Error("package.json: harness.bumpTest is blank");
	const manifest = join(root, "package.json");
	const text = readFileSync(manifest, "utf8");
	const pin = pinOf(text);
	const head = await greenHead(deps);
	if (head === undefined || head === pin) return { sha: "", tree: "" };
	writeFileSync(manifest, movePin(text, head));
	const step = stepper(root, head, deps.run);
	step("install", INSTALL);
	step("sync", SYNC);
	step("check", ["bun", "node_modules/harness/bun/check.ts"]);
	const tree = stage(root);
	step("bumpTest", ["sh", "-c", bumpTest]);
	return { sha: head, tree };
}

/**
 * Redoes `verify`'s edit to `sha` in the fresh checkout at `root` and pushes
 * it to `main`, but only when the result is `tree`, the one `verify` checked.
 * A `main` that moved since the checkout rejects the push, and the next day's
 * run starts from it.
 */
export function land(
	root: string,
	sha: string,
	tree: string,
	deps: { run: Run },
): void {
	if (!/^[0-9a-f]{40}$/.test(tree))
		throw new Error(`${tree} is not a full tree id`);
	const manifest = join(root, "package.json");
	const text = readFileSync(manifest, "utf8");
	const old = pinOf(text);
	writeFileSync(manifest, movePin(text, sha));
	const step = stepper(root, sha, deps.run);
	step("install", INSTALL);
	step("sync", SYNC);
	const reproduced = stage(root);
	if (reproduced !== tree)
		throw new Error(
			`the bump to ${sha} reproduced tree ${reproduced}, not the checked ${tree}`,
		);
	// By environment, not `-c user.*`: an inherited GIT_AUTHOR_* or GIT_COMMITTER_* outranks config.
	const name = "github-actions[bot]";
	const email = "41898282+github-actions[bot]@users.noreply.github.com";
	git(root, ["commit", "-qm", `Bump harness ${old.slice(0, 7)}..${sha.slice(0, 7)}`], {
		GIT_AUTHOR_NAME: name,
		GIT_AUTHOR_EMAIL: email,
		GIT_COMMITTER_NAME: name,
		GIT_COMMITTER_EMAIL: email,
	});
	git(root, ["push", "origin", "HEAD:main"]);
}

const spawn: Run = (argv, cwd) =>
	Bun.spawnSync(argv, { cwd, stdio: ["inherit", "inherit", "inherit"] })
		.exitCode;

if (import.meta.main) {
	const [command, sha, tree] = Bun.argv.slice(2);
	const landing = command === "land" && sha && tree;
	if (command !== "verify" && !landing) {
		console.error("usage: bump.ts verify | bump.ts land <sha> <tree>");
		process.exit(2);
	}
	try {
		const root = git(".", ["rev-parse", "--show-toplevel"]);
		if (landing) land(root, sha, tree, { run: spawn });
		else {
			const result = await verify(root, {
				api: process.env.GITHUB_API_URL ?? "https://api.github.com",
				token: process.env.GITHUB_TOKEN,
				run: spawn,
			});
			const lines = `sha=${result.sha}\ntree=${result.tree}\n`;
			const output = process.env.GITHUB_OUTPUT;
			if (output) appendFileSync(output, lines);
			else process.stdout.write(lines);
		}
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
}
