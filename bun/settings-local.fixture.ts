/**
 * What the sweep's test files build a case out of: a fabricated repository with
 * a tracked `.claude/settings.json` and, where the case wants one, an untracked
 * `.claude/settings.local.json` beside it. Its own module because the cases
 * split across files by what they exercise and every one of them fabricates the
 * same repository.
 *
 * `afterAll` is not registered here: each test file registers `cleanup`
 * itself, as `settings.fixture.ts` does for the same shape.
 */
import { join } from "node:path";
import { consumer, policy } from "./settings.fixture.ts";
import { sweep } from "./settings-local.ts";

export { cleanup } from "./settings.fixture.ts";

export const LOCAL = ".claude/settings.local.json";

const script = join(import.meta.dir, "settings-local.ts");

export type Lists = { deny?: string[]; ask?: string[]; allow?: string[] };

/**
 * A repository whose tracked file holds `tracked` as its permission lists and
 * whose local file holds `local` — an allow list, raw text, or nothing.
 */
export function repo(tracked: Lists, local?: string[] | string): string {
	const config = policy();
	config.permissions = { deny: [], ask: [], allow: [], ...tracked };
	const files: Record<string, string> = {};
	if (local !== undefined)
		files[LOCAL] =
			typeof local === "string"
				? local
				: JSON.stringify({ permissions: { allow: local } });
	return consumer(config, files);
}

/**
 * The sweep run as the command, from inside `dir`. The environment carries
 * only `PATH`, and the fabricated directory holds no `.env` for bun to fill the
 * rest from.
 */
export function run(dir: string) {
	const call = Bun.spawnSync(["bun", script], {
		cwd: dir,
		env: { PATH: process.env.PATH },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		out: call.stdout.toString(),
		err: call.stderr.toString(),
	};
}

/** What the sweep reports for one local entry against `tracked`. */
export const report = (tracked: Lists, entry: string) =>
	sweep(repo(tracked, [entry]))?.reported ?? [];

/** The line the sweep reports for a gap. */
export const gap = (entry: string) =>
	`gap: ${entry} — promote it to .claude/settings.json or drop it`;
