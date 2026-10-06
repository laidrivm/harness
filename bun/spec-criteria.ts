/**
 * What acceptance criteria exist. A criterion is identified by
 * `<capability>/<slug of its scenario heading>`, derived rather than stored,
 * so renaming a heading renames the criterion and the citation that named the
 * old one stops resolving.
 *
 * Its own module rather than `spec-coverage.ts`'s: that file answers which
 * criteria are covered, and the two halves together are over the file cap.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Criterion = { id: string; requirement: string; source: string };

/** The scenario heading, lowercased, every other run of characters a hyphen. */
const slug = (heading: string) =>
	heading
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

/**
 * The criteria one spec file declares. Each keeps its requirement heading,
 * which is what the ambiguity message names when one slug matches two.
 */
function parse(file: string, capability: string): Criterion[] {
	const found: Criterion[] = [];
	let requirement = "";
	// A fenced block quoting a `#### Scenario:` line illustrates the format
	// rather than declaring a criterion. No spec file carries a fence today;
	// the first one to explain this identifier scheme will.
	let fenced = false;
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (line.startsWith("```")) fenced = !fenced;
		else if (fenced) continue;
		else if (line.startsWith("### Requirement:"))
			requirement = line.slice(16).trim();
		else if (line.startsWith("#### Scenario:"))
			found.push({
				id: `${capability}/${slug(line.slice(14))}`,
				requirement,
				source: file,
			});
	}
	return found;
}

/** Subdirectory names of `path`, none when it does not exist. */
function subdirs(path: string): string[] {
	if (!lstatSync(path, { throwIfNoEntry: false })?.isDirectory()) return [];
	return readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

/** Every criterion in `<specs>/<capability>/spec.md`, for one such directory. */
const under = (specs: string): Criterion[] =>
	subdirs(specs).flatMap((capability) => {
		const file = join(specs, capability, "spec.md");
		return lstatSync(file, { throwIfNoEntry: false })?.isFile()
			? parse(file, capability)
			: [];
	});

/** The set the count is taken over. */
export const counted = (root: string) => under(join(root, "openspec/specs"));

/**
 * The criteria a citation may name: the counted set plus every active change's
 * delta spec. The asymmetry is what lets a change dogfood the check — its
 * tests cite criteria still in its own delta, valid but not yet counted, and
 * archiving moves criterion and citation into the count together. An archived
 * change sits one directory deeper and so is not read here; its criteria
 * reached `openspec/specs/` when it was archived.
 */
export const validated = (root: string): Criterion[] => [
	...counted(root),
	...subdirs(join(root, "openspec/changes")).flatMap((change) =>
		under(join(root, "openspec/changes", change, "specs")),
	),
];
