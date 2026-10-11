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

function git(cwd: string, args: string[]): string {
	const run = Bun.spawnSync(["git", ...args], { cwd });
	if (run.exitCode !== 0)
		throw new Error(`git ${args[0]}: ${run.stderr.toString().trim()}`);
	return run.stdout.toString().trim();
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
	const step = (name: string, argv: string[]) => {
		const code = deps.run(argv, root);
		if (code !== 0)
			throw new Error(`the bump to ${head} failed at ${name}, exit ${code}`);
	};
	step("install", ["bun", "install", "--ignore-scripts"]);
	step("sync", ["bun", "node_modules/harness/bun/sync.ts"]);
	step("check", ["bun", "node_modules/harness/bun/check.ts"]);
	const written = WRITES.filter((path) => existsSync(join(root, path)));
	git(root, ["add", "-A", "--", ...written]);
	const tree = git(root, ["write-tree"]);
	step("bumpTest", ["sh", "-c", bumpTest]);
	return { sha: head, tree };
}

const spawn: Run = (argv, cwd) =>
	Bun.spawnSync(argv, { cwd, stdio: ["inherit", "inherit", "inherit"] })
		.exitCode;

if (import.meta.main) {
	const [command] = Bun.argv.slice(2);
	if (command !== "verify") {
		console.error("usage: bump.ts verify");
		process.exit(2);
	}
	try {
		const { sha, tree } = await verify(git(".", ["rev-parse", "--show-toplevel"]), {
			api: process.env.GITHUB_API_URL ?? "https://api.github.com",
			token: process.env.GITHUB_TOKEN,
			run: spawn,
		});
		const lines = `sha=${sha}\ntree=${tree}\n`;
		const output = process.env.GITHUB_OUTPUT;
		if (output) appendFileSync(output, lines);
		else process.stdout.write(lines);
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
}
