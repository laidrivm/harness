/**
 * What the sync-settings test files build a case out of: a consumer whose
 * files carry a previous harness version's values, the state a bump leaves
 * behind. Its own module because the cases split across two files and both
 * fabricate the same consumer.
 *
 * `afterAll` is not registered here: each test file registers `cleanup`
 * itself, as `spec-coverage.fixture.ts` explains for the same shape.
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MARK } from "./bootstrap.ts";

const made: string[] = [];

/** Removes every consumer fabricated so far. */
export const cleanup = () => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
};

export const SETTINGS = ".claude/settings.json";

/** A git repository holding `files`, so the policy check can list it. */
export function consumer(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-sync-settings-"));
	made.push(dir);
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	return dir;
}

export const read = (dir: string, path: string) =>
	readFileSync(join(dir, path), "utf8");
export const parsed = (dir: string) => JSON.parse(read(dir, SETTINGS));

/** A previous version's hook: another script, carrying the harness's mark. */
export const old = (script: string) =>
	`g="$CLAUDE_PROJECT_DIR/node_modules/harness/bun/${script}"; bun "$g" ${MARK}`;

/** Settings as a previous harness version left them, plus `extra`. */
export const stale = (extra: Record<string, unknown> = {}) => ({
	permissions: {
		deny: ["Bash(npx *)", "Bash(npm *)", "Edit(.npmrc)"],
		ask: ["Bash(bun add *)", "Edit(bunfig.toml)"],
		allow: ["Bash(bun test *)"],
	},
	hooks: {
		PreToolUse: [
			{ matcher: "Bash", hooks: [{ type: "command", command: old("g.ts") }] },
		],
		UserPromptSubmit: [
			{ hooks: [{ type: "command", command: old("turn-gate.ts mark") }] },
		],
		Stop: [{ hooks: [{ type: "command", command: old("turn-gate.ts stop") }] }],
	},
	...extra,
});

export const STALE_BUNFIG =
	"[install]\nexact = true\nminimumReleaseAge = 86400\nminimumReleaseAgeExcludes = []\n";
export const CANONICAL =
	"[install]\nexact = true\nminimumReleaseAge = 259200\nminimumReleaseAgeExcludes = []\n";
