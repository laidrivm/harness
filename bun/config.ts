/**
 * The values a gate runs with, read from the consumer's `package.json` under
 * `"harness"`. A gate carries none of them in its own source: what is mutated,
 * which root files are allowed, which suppressions are approved — each is a
 * project's own, and this package is shared.
 *
 * A key that is absent fails, naming it. A default would make a forgotten value
 * read as a decision, and nothing downstream could tell the two apart.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Config = {
	/** The module Stryker mutates, and how many of its mutants survive. */
	mutationFloor: { module: string; surviving: number; why: string };
	/** How many acceptance criteria no test cites. */
	uncitedFloor: { count: number; why: string };
	/** Every file allowed at the root, and why it is there. */
	rootFiles: Record<string, string>;
	/** Approved suppressions by `<path> <marker>`: how many, and why. */
	suppressions: Record<string, { count: number; why: string }>;
	/** Pathspecs the diff budget does not count. */
	diffBudgetExclude: string[];
};

/** `key` from the `"harness"` object of `root`'s `package.json`. */
export function read<K extends keyof Config>(root: string, key: K): Config[K] {
	const file = join(root, "package.json");
	const manifest = JSON.parse(readFileSync(file, "utf8")) as {
		harness?: Partial<Config>;
	};
	const value = manifest.harness?.[key];
	// `null` too: JSON can only spell an absent value that way, and the gate
	// would otherwise read a field of it and throw something nobody can act on.
	if (value === undefined || value === null)
		throw new Error(
			`${file} has no "harness.${key}" — the gate reads it there`,
		);
	return value as Config[K];
}
