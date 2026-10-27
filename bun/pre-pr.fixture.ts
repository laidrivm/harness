/**
 * What the runner's test files share: `pre-pr.ts` spawned as an agent runs it,
 * and the records it left. Each run builds its environment from what it needs
 * — `XDG_STATE_HOME` always a directory of its own — and runs in a fabricated
 * repository holding no `.env`, so nothing reaches the user's own ledger.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir, MANIFEST } from "./diff-budget.fixture.ts";

export const runner = join(import.meta.dir, "pre-pr.ts");

type Env = Record<string, string | undefined>;

export function run(dir: string, env: Env = {}, args: string[] = []) {
	const state = emptyDir("pre-pr-state-");
	const call = Bun.spawnSync(["bun", runner, ...args], {
		cwd: dir,
		env: {
			PATH: process.env.PATH,
			HOME: emptyDir("pre-pr-home-"),
			XDG_STATE_HOME: state,
			PR_BODY: "",
			...env,
		},
	});
	return {
		code: call.exitCode,
		out: call.stdout.toString(),
		err: call.stderr.toString(),
		state,
	};
}

export const ledger = (state: string) => join(state, "harness", "gates.jsonl");

export function records(state: string): Record<string, unknown>[] {
	let text = "";
	try {
		text = readFileSync(ledger(state), "utf8");
	} catch {
		return [];
	}
	return text
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export const head = (dir: string) =>
	Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir })
		.stdout.toString()
		.trim();

/** The fabricated manifest with `harness.bumpTest` set to `command`, or left out. */
export function checks(command?: string): string {
	const { harness } = JSON.parse(MANIFEST);
	return JSON.stringify({ harness: { ...harness, bumpTest: command } });
}
