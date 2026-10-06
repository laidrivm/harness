#!/usr/bin/env bun
/**
 * The consumer's copy of the harness rules: `core/rules.md` and the docs beside
 * it, written into a tracked `harness/` directory at the consumer's root —
 * `bun node_modules/harness/bun/sync.ts` from there. A copy because the review
 * bot reads no file outside the repository, and a clone reads the rules before
 * it installs anything; `drift` is what keeps it a cache rather than a fork.
 *
 * The layout is the same on both sides, so a link between the rules and a doc
 * resolves in the package and in the copy alike.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";

/** What a consumer copies: this package's own `core/`. */
export const CORE = join(import.meta.dir, "..", "core");

/** The files directly in `dir`; the skills beside the rules are directories. */
const files = (dir: string, only = /./) =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter((entry) => entry.isFile() && only.test(entry.name))
				.map((entry) => entry.name)
				.sort()
		: [];

const MARKDOWN = /\.md$/;

/**
 * `core`'s Markdown files, or a throw when it holds no rulebook: an absent or
 * empty source would read as "ship nothing", so `sync` would empty the copy
 * and `drift` would then call the two identical.
 */
function source(core: string): string[] {
	const want = files(core, MARKDOWN);
	if (!want.includes("rules.md"))
		throw new Error(
			`${core} holds no rules.md — the package is not installed whole`,
		);
	return want;
}

/**
 * Every file of the copy at `copy` that differs from `core`, is missing from
 * it, or is not in `core` at all, each named. Compared byte for byte: a copy
 * edited by hand is an edit to a harness rule, which belongs in the harness.
 */
export function drift(core: string, copy: string): string[] {
	const want = source(core);
	const have = files(copy);
	const run = "run bun node_modules/harness/bun/sync.ts";
	return [
		...want.flatMap((name) => {
			if (!have.includes(name))
				return [`harness/${name}: missing from the copy — ${run}`];
			const same = readFileSync(join(core, name)).equals(
				readFileSync(join(copy, name)),
			);
			return same
				? []
				: [`harness/${name}: differs from the pinned package — ${run}`];
		}),
		...have
			.filter((name) => !want.includes(name))
			.map((name) => `harness/${name}: not in the pinned package — ${run}`),
	];
}

/** Makes `copy` hold exactly `core`'s Markdown files, byte for byte. */
export function sync(core: string, copy: string): void {
	const want = source(core);
	mkdirSync(copy, { recursive: true });
	for (const name of files(copy))
		if (!want.includes(name)) rmSync(join(copy, name));
	for (const name of want) copyFileSync(join(core, name), join(copy, name));
}

if (import.meta.main) {
	const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
	if (top.exitCode !== 0) throw new Error(top.stderr.toString());
	sync(CORE, join(top.stdout.toString().replace(/\n$/, ""), "harness"));
}
