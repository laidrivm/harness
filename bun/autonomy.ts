/**
 * The vocabulary of the unattended classes. Every `(unattended: <class>` marker
 * in a Markdown file under `core/` must name a class that `core/autonomy.md`
 * defines as a `` ### `<class>` `` heading. The doc must define exactly the
 * three classes, and `core/rules.md` must link it, because a consumer reaches
 * the doc only through that link. The check reads the class and nothing else;
 * whether a marker's text fits its step is left to review.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const THREE = ["agent", "card", "user"];

// The class runs to the first space, newline, dash or parenthesis. `\s*` lets a
// marker wrap after the colon, and an empty class is still reported.
const MARKER = /\(unattended:\s*([^\s)—]*)/g;
const HEADING = /^### `([a-z]+)`\s*$/gm;
const LINK = /\]\(autonomy\.md(#[^)]*)?\)/;

/** Every Markdown file under `dir`, at any depth. Nothing is exempt. */
function markdown(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => join(entry.parentPath, entry.name))
		.sort();
}

/** What is wrong with the marker vocabulary under `root`'s `core/`, one line each. */
export function check(root: string): string[] {
	const core = join(root, "core");
	const problems: string[] = [];
	const doc = join(core, "autonomy.md");
	const defined = existsSync(doc)
		? [...readFileSync(doc, "utf8").matchAll(HEADING)].map((m) => m[1]).sort()
		: [];
	if (defined.join() !== THREE.join())
		problems.push(
			`core/autonomy.md: defines agent, card and user, found ${defined.join(", ") || "none"}`,
		);
	const rules = join(core, "rules.md");
	if (!existsSync(rules) || !LINK.test(readFileSync(rules, "utf8")))
		problems.push("core/rules.md: links no autonomy.md");
	for (const file of markdown(core))
		for (const [, name] of readFileSync(file, "utf8").matchAll(MARKER))
			if (!defined.includes(name))
				problems.push(
					`${relative(root, file)}: (unattended: ${name}) names no defined class`,
				);
	return problems;
}
