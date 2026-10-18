/**
 * The vocabulary of the unattended classes. Every `(unattended: <class>` marker
 * in a Markdown file under `core/` must name a class that `core/autonomy.md`
 * defines as a `` ### `<class>` `` heading. The doc must define exactly the
 * three classes, and `core/rules.md` must link it, because a consumer reaches
 * the doc only through that link. A skill at `core/skills/<name>/SKILL.md` whose
 * frontmatter carries `disable-model-invocation` must hold an `(unattended: user`
 * marker in that file, since the flag is what keeps the step with the user. The
 * check reads the class and the flag and nothing else; whether a marker's text
 * fits its step is left to review.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const THREE = ["agent", "card", "user"];

// The class runs to the first space, newline, dash or parenthesis. `\s*` lets a
// marker wrap after the colon, and an empty class is still reported.
const MARKER = /\(unattended:\s*([^\s)—]*)/g;
// Any backticked name, so a fourth heading such as `agent-run` is counted and
// refused, never silently left out of the set.
const HEADING = /^### `([^`]+)`\s*$/gm;
const LINK = /\]\(autonomy\.md(#[^)]*)?\)/;
// Claude Code reads a skill's metadata from the `---` block that opens the file.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
const SKILL = /^skills\/[^/]+\/SKILL\.md$/;
const FLAG = "disable-model-invocation";

/** Whether a skill's text carries the flag; throws when its frontmatter is not YAML. */
function flagged(text: string): boolean {
	const block = FRONTMATTER.exec(text);
	if (!block) return false;
	const meta: unknown = Bun.YAML.parse(block[1]);
	// Present and not `false` is set: `"true"` and an empty value both count.
	return typeof meta === "object" && meta !== null && FLAG in meta
		&& (meta as Record<string, unknown>)[FLAG] !== false;
}

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
	for (const file of markdown(core)) {
		const text = readFileSync(file, "utf8");
		const names = [...text.matchAll(MARKER)].map((m) => m[1]);
		for (const name of names)
			if (!defined.includes(name))
				problems.push(
					`${relative(root, file)}: (unattended: ${name}) names no defined class`,
				);
		if (!SKILL.test(relative(core, file).split(sep).join("/"))) continue;
		let flag: boolean;
		try {
			flag = flagged(text);
		} catch {
			problems.push(`${relative(root, file)}: frontmatter is not YAML`);
			continue;
		}
		if (flag && !names.includes("user"))
			problems.push(
				`${relative(root, file)}: carries ${FLAG} with no (unattended: user step`,
			);
	}
	return problems;
}
