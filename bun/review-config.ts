/**
 * What the harness's review bot cannot reach: each doc the rulebook indexes
 * that no pattern under `.coderabbit.yaml`'s
 * `knowledge_base.code_guidelines.filePatterns` matches, and each pattern that
 * matches no tracked file. `local-review-loop` §*The review bot reads the
 * rulebook and the docs it indexes* fixes the contract.
 *
 * The harness's own pin, run by its suite. A consumer's copy sits under
 * `harness/`, and checking a consumer's config is a gate of its own, not this.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { Glob } from "bun";
import { tracked } from "./tracked.ts";

const CONFIG = ".coderabbit.yaml";
const KEY = "knowledge_base.code_guidelines.filePatterns";
const RULEBOOK = "core/rules.md";
// `CLAUDE.md` links the README for the package's layout; it holds no rule.
const EXEMPT = new Set(["README.md"]);

/**
 * The patterns the config names, or the one problem that stops them being
 * read. Read from the structure the bot parses, never from a line resembling
 * it.
 */
function patterns(root: string): string[] | string {
	const path = join(root, CONFIG);
	if (!existsSync(path)) return `${CONFIG}: absent`;
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(readFileSync(path, "utf8"));
	} catch (e) {
		return `${CONFIG}: does not parse — ${e instanceof Error ? e.message : String(e)}`;
	}
	let list: unknown = parsed;
	for (const key of KEY.split("."))
		list =
			list && typeof list === "object"
				? (list as Record<string, unknown>)[key]
				: undefined;
	if (list === undefined) return `${CONFIG}: ${KEY} is missing`;
	if (!Array.isArray(list)) return `${CONFIG}: ${KEY} is not a list`;
	if (list.length === 0) return `${CONFIG}: ${KEY} is empty`;
	const bad = list.flatMap((p, i) =>
		typeof p !== "string"
			? [`${KEY}[${i}] is not a string`]
			: p.trim() === ""
				? [`${KEY}[${i}] is blank`]
				: [],
	);
	return bad.length ? `${CONFIG}: ${bad.join("; ")}` : list;
}

/**
 * The markdown files `from` points at, named from the root: its relative
 * links, and — `CLAUDE.md` only — its `@` import lines. A link carrying a
 * scheme points off the tree and is no doc.
 */
function indexed(root: string, from: string): string[] {
	const path = join(root, from);
	if (!existsSync(path)) return [];
	const text = readFileSync(path, "utf8");
	// An inline link's destination runs to the first space, `#` or `)`, so an
	// optional title after it is ignored; a reference definition is a line of
	// its own, `[label]: destination`.
	const inline = /\]\(\s*([^)\s#]+\.md)(?:#[^)\s]*)?(?:\s+[^)]*)?\)/g;
	const reference = /^\s{0,3}\[[^\]]+\]:\s*([^\s#]+\.md)(?:#\S*)?(?:\s|$)/gm;
	const targets = [...text.matchAll(inline), ...text.matchAll(reference)]
		.map((m) => m[1] as string)
		.filter((t) => !/^[a-z][a-z0-9+.-]*:/i.test(t))
		.map((t) => normalize(join(dirname(from), t)));
	if (from === "CLAUDE.md")
		for (const m of text.matchAll(/^@(\S+\.md)\s*$/gm))
			targets.push(normalize(m[1] as string));
	return targets;
}

/** Every problem keeping the bot from the rulebook; empty when it reaches it. */
export function unreached(root: string): string[] {
	const named = patterns(root);
	if (typeof named === "string") return [named];
	// Paths, not files: a pattern ruling on a tracked path is reached whether or
	// not the work tree holds it.
	const { paths } = tracked(root);
	const globs = named.map((p) => new Glob(p));
	const docs = new Set([
		RULEBOOK,
		...indexed(root, "CLAUDE.md"),
		...indexed(root, RULEBOOK),
	]);
	// A glob matches a path string whether or not the file exists, so a doc
	// the tree lacks would otherwise read as reached.
	const absent = ["CLAUDE.md", ...docs].filter(
		(d) => !EXEMPT.has(d) && !paths.includes(d),
	);
	return [
		...named
			.filter((_, i) => !paths.some((f) => globs[i]?.match(f)))
			.map((p) => `${CONFIG}: pattern "${p}" matches no tracked file`),
		...absent.map((d) => `${d}: indexed by the rulebook but not tracked`),
		...[...docs]
			.filter((d) => !EXEMPT.has(d) && !absent.includes(d))
			.filter((d) => !globs.some((g) => g.match(d)))
			.map((d) => `${d}: no pattern under ${KEY} in ${CONFIG} matches it`),
	];
}
