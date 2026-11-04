/**
 * The values a gate runs with, read from the consumer's `package.json` under
 * `"harness"`. A gate carries none of them in its own source: what is mutated,
 * which root files are allowed, which suppressions are approved — each is a
 * project's own, and this package is shared.
 *
 * A key that is absent fails, naming it. A default would make a forgotten value
 * read as a decision, and nothing downstream could tell the two apart. The one
 * exception is `reviewers`: its absence means no external reviewer, since the
 * harness also runs without one (the user's answer 2 b, 2026-11-03).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Config = {
	/** How many of the mutants Stryker reports survive. */
	mutationFloor: { surviving: number; why: string };
	/** How many acceptance criteria no test cites. */
	uncitedFloor: { count: number; why: string };
	/** Every file allowed at the root, and why it is there. */
	rootFiles: Record<string, string>;
	/** Approved suppressions by `<path> <marker>`: how many, and why. */
	suppressions: Record<string, { count: number; why: string }>;
	/** Pathspecs the diff budget does not count. */
	diffBudgetExclude: string[];
	/** The shell command a bump runs as the consumer's unit tests. */
	bumpTest: string;
	/** The name of the board whose cards this tree decides — never its address. */
	board: string;
	/** The check-run names of the reviewers `work.ts finish` waits for; `CodeRabbit` the only one understood. */
	reviewers: string[];
};

/** `file` parsed, or a throw naming it: the parser's own message names a position and no file. */
function manifest(file: string): { harness?: Partial<Config> } | null {
	const text = readFileSync(file, "utf8");
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`${file} is not JSON — ${String(error)}`);
	}
}

/** `key` from the `"harness"` object of `root`'s `package.json`. */
export function read<K extends keyof Config>(root: string, key: K): Config[K] {
	const file = join(root, "package.json");
	const value = manifest(file)?.harness?.[key];
	// `null` too: JSON can only spell an absent value that way, and the gate
	// would otherwise read a field of it and throw something nobody can act on.
	if (value === undefined || value === null)
		throw new Error(`${file} has no "harness.${key}" — the gate reads it there`);
	return value as Config[K];
}

/**
 * The project's checks command, `harness.bumpTest` — its unit tests at the
 * least, and here every gate `.githooks/gates.sh` runs — which a bump and
 * the pre-PR runner run as `sh -c <value>`. Throws naming the key when it is
 * absent or blank: `sh -c ""` exits 0, a pass with no test run at all.
 */
export function bumpTest(root: string): string {
	const value = read(root, "bumpTest");
	if (typeof value !== "string" || value.trim() === "") throw new Error("package.json: harness.bumpTest is blank");
	return value;
}

/** The name CodeRabbit's app gives its check run: the one reviewer `harness.reviewers` may name, and the run `coderabbit-run.ts` reads. */
export const CODERABBIT = "CodeRabbit";

/**
 * `harness.reviewers` of `root`'s `package.json`: `[]` with no file, no key or
 * `null`, so no reviewer is waited for. Throws naming the file when it does not
 * parse, `harness.reviewers` when the value is not a list of names, and the
 * name `finish` cannot read the state of otherwise.
 */
export function reviewers(root: string): string[] {
	const file = join(root, "package.json");
	const value: unknown = existsSync(file) ? manifest(file)?.harness?.reviewers : undefined;
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || !value.every((name) => typeof name === "string"))
		throw new Error(`package.json: harness.reviewers is ${JSON.stringify(value)}, not a list of check-run names`);
	const unknown = value.filter((name) => name !== CODERABBIT);
	if (unknown.length)
		throw new Error(
			`package.json: harness.reviewers names ${unknown.map((name) => JSON.stringify(name)).join(", ")}; CodeRabbit is the only one understood`,
		);
	return value;
}

/** The `name` of `top`'s `package.json`, or `undefined`. */
export function named(top: string): string | undefined {
	try {
		const name = JSON.parse(readFileSync(join(top, "package.json"), "utf8"))?.name;
		return typeof name === "string" && name ? name : undefined;
	} catch {
		return undefined;
	}
}

/**
 * A card's `pointer` split into this repository's cross-repository prefix,
 * its name, a colon and a space (task-board, *A card for another repository's
 * change points across*), and the path after it; no prefix where it has none.
 */
export function across(top: string, pointer: string): { prefix: string; path: string } {
	const name = named(top);
	const prefix = name && pointer.startsWith(`${name}: `) ? `${name}: ` : "";
	return { prefix, path: pointer.slice(prefix.length) };
}
