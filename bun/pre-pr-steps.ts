/**
 * The steps of the pre-PR sequence a branch still requires, from the paths
 * its diff changes and whether its pull request is open: the one list the
 * runner prints and `work.ts finish` checks the gate ledger against.
 *
 * A step's id is the `rule` its ledger record carries: a judgement step's is
 * its skill's name, which the `Skill` hook writes, and the project checks'
 * is the runner's own.
 */
import { RUNNER_STEPS } from "./gate-ledger.ts";

export const PROJECT_CHECKS = RUNNER_STEPS[1];
export const ZOMBIES = "zombies";
export const WARM = "warm";
export const TRIAGE = "triage";
export const CODE_REVIEW = "code-review";
/** The judgement steps, in the sequence's order. */
export const JUDGEMENT = [ZOMBIES, WARM, TRIAGE, CODE_REVIEW] as const;

// Documentation is the enumerated side, so a path nobody foresaw reads as code,
// where a misread costs one `/zombies` run rather than a dropped review.
const documentation = (path: string) => path.endsWith(".md") || path.startsWith("openspec/");
const manifest = (path: string) => ["package.json", "bun.lock"].includes(path.split("/").at(-1) ?? "");

/**
 * The ids the branch requires, in the sequence's order. `paths` undefined is
 * a diff that could not be read, which requires every step — unless the pull
 * request is open, when the reviewer on it reviews the head whatever it holds.
 */
export function required(paths: string[] | undefined, open: boolean): string[] {
	if (open) return [PROJECT_CHECKS];
	const code = paths === undefined || !paths.every(documentation);
	const warm = code && (paths === undefined || paths.some(manifest));
	return [PROJECT_CHECKS, ...JUDGEMENT.filter((id) => (id === ZOMBIES ? code : id === WARM ? warm : true))];
}

/**
 * The paths changed between `base`'s merge base and `HEAD`, or undefined when
 * git cannot list them — never `[]`, which is a branch that changes nothing.
 * Each flag takes a git setting out of the answer: `--no-renames` lists a
 * move on both sides (`diff.renames`), `-z` prints a path unquoted
 * (`core.quotePath`), `--no-relative` lists the whole tree (`diff.relative`).
 */
export function changedPaths(base: string, cwd?: string): string[] | undefined {
	try {
		const run = Bun.spawnSync(
			["git", "diff", "--name-only", "-z", "--no-renames", "--no-relative", "--end-of-options", `${base}...HEAD`, "--"],
			{ cwd },
		);
		return run.exitCode === 0 ? run.stdout.toString().split("\0").filter(Boolean) : undefined;
	} catch {
		// git that cannot start lists nothing it could vouch for.
		return undefined;
	}
}
