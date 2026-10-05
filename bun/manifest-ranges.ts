/**
 * Every version in `package.json` names one version and not a set of them.
 *
 * `bunfig.toml`'s `[install] exact = true` states the policy and its reason —
 * a malicious release ships as a patch or minor bump, which a caret adopts
 * unread — but it governs only what `bun add` writes. A range typed into the
 * file by hand, or into `overrides`, which `bun add` never touches, passes
 * every gate this repository has. This is the gate it passes.
 *
 * A module of its own rather than the test that exercises it, the shape
 * `repo-layout.ts` and `file-size.ts` already have: what it answers is a
 * question about a manifest that does not exist yet, so it is a rule, and a
 * rule written inside its own test is one the fabricated inputs exist to
 * justify rather than to guard.
 */

/**
 * The fields holding shell commands rather than version specs, which is the
 * whole of what this scan exempts. Everything else is walked, `overrides` and
 * any field added later alike — a scan scoped by a list of the collections it
 * covers is one a new collection is silently outside of, and a dependency
 * field nobody thought to add to that list is exactly where an unread range
 * would sit.
 */
const EXEMPT = new Set(["scripts", "simple-git-hooks"]);

/**
 * Every way a spec names more than the one version it appears to: a widening
 * operator or comparator, a disjunction, a wildcard, a partial version — `6`
 * is every 6 and `6.16` every 6.16, which is the form that reads least like a
 * range and is the widest of them — and a hyphen span.
 *
 * Written as what a range is rather than as what a version is, because the
 * scan walks every field and most of them hold neither: `"module"`, `"d2ass"`
 * and `"./index.x.ts"` all have to pass, and a pattern asking what a version
 * looks like has to tell them apart from one. The cost is that a date would
 * read as a span; no field here holds one, and the report names the field.
 */
const RANGE =
	/^[\^~<>=]|\|\||^[x*]$|^\d+(\.\d+)?$|^\d+(\.\d+)*\.[x*]$|^\d[\d.]*\s*-\s*\d/i;

/**
 * A spec naming a Git repository, which names whatever its reference points at
 * when it is installed — a set, pinned or not, as a range is.
 *
 * ponytail: two forms pass. The bare `owner/repo` shorthand, which bun and npm
 * both read as GitHub, has the shape of a path without a `#`, and this scan
 * reads every field — `src/model.ts` must pass. An HTTPS tarball URL has the
 * shape of `homepage` or `repository.url`. A complete check would read
 * `bun.lock`, where every dependency's source is written out whole.
 */
const GIT =
	/^(github|gitlab|bitbucket|gist|git(\+[a-z]+)?):|^git@|\.git(#.*)?$|^[a-z0-9][\w.-]*\/[\w.-]+#/i;

/**
 * The one Git spec admitted, and for the `harness` entry alone: a full commit
 * hash, which `bun.lock` records and nothing can move under it.
 */
const HARNESS_PIN = /^github:laidrivm\/harness#[0-9a-f]{40}$/;

/** Every version in `manifest` that names a set, and an empty list when none. */
export function ranges(manifest: string): string[] {
	const found: string[] = [];

	const walk = (value: unknown, path: string, key: string) => {
		if (typeof value === "string") {
			// The key, not the path's tail: `my.harness` is a package of its own.
			if (key === "harness" && path !== key) {
				if (!HARNESS_PIN.test(value))
					found.push(
						`package.json: ${path} is ${value}, not github:laidrivm/harness#<40-hex commit>`,
					);
			} else if (RANGE.test(value) || GIT.test(value))
				found.push(`package.json: ${path} is ${value}, not one version`);
			return;
		}
		// `null` first: it is an object to `typeof`, and `Object.entries` throws
		// on it rather than returning nothing.
		if (value === null || typeof value !== "object") return;
		for (const [name, inner] of Object.entries(value))
			walk(inner, `${path}.${name}`, name);
	};

	const parsed = JSON.parse(manifest) as Record<string, unknown>;
	for (const [key, value] of Object.entries(parsed))
		if (!EXEMPT.has(key)) walk(value, key, key);

	return found;
}
