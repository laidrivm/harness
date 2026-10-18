import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { check } from "./autonomy.ts";
import { root } from "./root.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const DOC = "# Autonomy\n\n### `agent`\n\n### `card`\n\n### `user`\n";
const RULES = "# Rules\n\nSee [autonomy.md](autonomy.md).\n";

/** A throwaway tree whose `core/` holds the three classes, the link, and `files`. */
function tree(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(join(tmpdir(), "autonomy-"));
	made.push(dir);
	const all = { "autonomy.md": DOC, "rules.md": RULES, ...files };
	for (const [path, text] of Object.entries(all)) {
		const full = join(dir, "core", path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text);
	}
	return dir;
}

describe("the marker vocabulary", () => {
	test("a file with no marker adds nothing", () => {
		expect(check(tree({ "plain.md": "# Plain\n\nWait for the user.\n" }))).toEqual([]);
	});

	test("a doc defining no class fails, naming the doc", () => {
		expect(check(tree({ "autonomy.md": "# Autonomy\n" }))).toEqual([
			"core/autonomy.md: defines agent, card and user, found none",
		]);
	});

	test("one marker naming a defined class passes", () => {
		const dir = tree({ "flow.md": "Open it (unattended: agent — open it).\n" });
		expect(check(dir)).toEqual([]);
	});

	test("two markers on one line are both validated", () => {
		const dir = tree({
			"flow.md": "A (unattended: card — x) and B (unattended: usr — y).\n",
		});
		expect(check(dir)).toEqual(["core/flow.md: (unattended: usr) names no defined class"]);
	});

	test("a marker in a skill under core/skills/ is scanned", () => {
		const dir = tree({ "skills/warm/SKILL.md": "Stop (unattended: wait — x).\n" });
		expect(check(dir)).toEqual([
			"core/skills/warm/SKILL.md: (unattended: wait) names no defined class",
		]);
	});

	test("of several markers, only the unknown one is reported", () => {
		const dir = tree({
			"flow.md": "(unattended: agent — a)\n(unattended: bot — b)\n(unattended: user — c)\n",
		});
		expect(check(dir)).toEqual(["core/flow.md: (unattended: bot) names no defined class"]);
	});

	// spec: agent-autonomy/a-marker-that-wraps-across-a-line
	test("a marker wrapped after the colon is read as one", () => {
		const dir = tree({ "flow.md": "Open it (unattended:\nagnet — open it).\n" });
		expect(check(dir)).toEqual(["core/flow.md: (unattended: agnet) names no defined class"]);
	});

	test("a class in upper case fails", () => {
		const dir = tree({ "flow.md": "(unattended: Agent — x)\n" });
		expect(check(dir)).toEqual(["core/flow.md: (unattended: Agent) names no defined class"]);
	});

	test("a marker with no class fails", () => {
		const dir = tree({ "flow.md": "(unattended: — x)\n" });
		expect(check(dir)).toEqual(["core/flow.md: (unattended: ) names no defined class"]);
	});

	test("a heading naming agent-run does not define agent", () => {
		const dir = tree({
			"autonomy.md": "# A\n\n### `agent-run`\n\n### `card`\n\n### `user`\n",
			"flow.md": "(unattended: agent — x)\n",
		});
		expect(check(dir)).toEqual([
			"core/autonomy.md: defines agent, card and user, found agent-run, card, user",
			"core/flow.md: (unattended: agent) names no defined class",
		]);
	});

	test("a hyphenated fourth heading beside the three fails", () => {
		const dir = tree({ "autonomy.md": `${DOC}\n### \`agent-run\`\n` });
		expect(check(dir)).toEqual([
			"core/autonomy.md: defines agent, card and user, found agent, agent-run, card, user",
		]);
	});

	test("a fourth class heading fails", () => {
		const dir = tree({ "autonomy.md": `${DOC}\n### \`bot\`\n` });
		expect(check(dir)).toEqual([
			"core/autonomy.md: defines agent, card and user, found agent, bot, card, user",
		]);
	});

	test("a core/ without the doc defines no class", () => {
		const dir = tree();
		rmSync(join(dir, "core", "autonomy.md"));
		expect(check(dir)).toEqual([
			"core/autonomy.md: defines agent, card and user, found none",
		]);
	});

	test("a core/ without rules.md links no doc", () => {
		const dir = tree();
		rmSync(join(dir, "core", "rules.md"));
		expect(check(dir)).toEqual(["core/rules.md: links no autonomy.md"]);
	});

	test("a link to a section of the doc counts as linking it", () => {
		const rules = "# Rules\n\nSee [the classes](autonomy.md#the-classes).\n";
		expect(check(tree({ "rules.md": rules }))).toEqual([]);
	});

	test("rules.md without the link fails", () => {
		expect(check(tree({ "rules.md": "# Rules\n" }))).toEqual([
			"core/rules.md: links no autonomy.md",
		]);
	});

	// spec: agent-autonomy/a-marker-names-an-unknown-class
	test("a misspelt class fails, naming the file", () => {
		const dir = tree({ "flow.md": "(unattended: agnet — x)\n" });
		expect(check(dir)).toEqual(["core/flow.md: (unattended: agnet) names no defined class"]);
	});
});

/** A skill whose frontmatter is `front` and whose body is `body`. */
const skill = (front: string, body: string) => `---\nname: x\n${front}\n---\n\n# X\n\n${body}\n`;
const FLAG = "disable-model-invocation: true";
const UNMARKED = "core/skills/x/SKILL.md: carries disable-model-invocation with no (unattended: user step";

describe("flagged skills", () => {
	test("a skill with no frontmatter adds nothing", () => {
		expect(check(tree({ "skills/x/SKILL.md": "# X\n\nWait for the user.\n" }))).toEqual([]);
	});

	test("a flagged skill holding a user marker passes", () => {
		const dir = tree({ "skills/x/SKILL.md": skill(FLAG, "Merge it (unattended: user — x).") });
		expect(check(dir)).toEqual([]);
	});

	// spec: agent-permissions/a-flag-with-no-step-that-stays-with-the-user
	test("a flagged skill whose only markers are card fails, naming the file", () => {
		const dir = tree({
			"skills/x/SKILL.md": skill(FLAG, "Ask (unattended: card — x).\nWait (unattended: card — y)."),
		});
		expect(check(dir)).toEqual([UNMARKED]);
	});

	test("a flag set to false needs no marker", () => {
		const dir = tree({ "skills/x/SKILL.md": skill("disable-model-invocation: false", "Wait.") });
		expect(check(dir)).toEqual([]);
	});

	test("a flag written as the string true is a flag", () => {
		const dir = tree({ "skills/x/SKILL.md": skill('disable-model-invocation: "true"', "Wait.") });
		expect(check(dir)).toEqual([UNMARKED]);
	});

	test("a user marker wrapped after the colon counts", () => {
		const dir = tree({ "skills/x/SKILL.md": skill(FLAG, "Merge it (unattended:\nuser — x).") });
		expect(check(dir)).toEqual([]);
	});

	test("a user marker in the skill's references does not count", () => {
		const dir = tree({
			"skills/x/SKILL.md": skill(FLAG, "Wait."),
			"skills/x/references/a.md": "Merge it (unattended: user — x).\n",
		});
		expect(check(dir)).toEqual([UNMARKED]);
	});

	test("a user marker in another skill does not count", () => {
		const dir = tree({
			"skills/x/SKILL.md": skill(FLAG, "Wait."),
			"skills/y/SKILL.md": skill(FLAG, "Merge it (unattended: user — x)."),
		});
		expect(check(dir)).toEqual([UNMARKED]);
	});

	test("a flag with an empty value is a flag", () => {
		const dir = tree({ "skills/x/SKILL.md": skill("disable-model-invocation:", "Wait.") });
		expect(check(dir)).toEqual([UNMARKED]);
	});

	test("frontmatter with CRLF line endings is read", () => {
		const dir = tree({ "skills/x/SKILL.md": skill(FLAG, "Wait.").replace(/\n/g, "\r\n") });
		expect(check(dir)).toEqual([UNMARKED]);
	});

	test("a thematic break later in the body is not frontmatter", () => {
		const body = `# X\n\n---\n${FLAG}\n---\n\nWait.\n`;
		expect(check(tree({ "skills/x/SKILL.md": body }))).toEqual([]);
	});

	test("a SKILL.md below a skill's directory is not read for the flag", () => {
		const dir = tree({ "skills/x/sub/SKILL.md": skill(FLAG, "Wait.") });
		expect(check(dir)).toEqual([]);
	});

	test("frontmatter that is not YAML fails, naming the file", () => {
		const dir = tree({ "skills/x/SKILL.md": skill("tools: [Read", "Wait.") });
		expect(check(dir)).toEqual(["core/skills/x/SKILL.md: frontmatter is not YAML"]);
	});
});

describe("the repository", () => {
	const read = (path: string) => readFileSync(join(root, path), "utf8");

	test("every marker under core/ names a defined class, and rules.md links the doc", () => {
		expect(check(root)).toEqual([]);
	});

	test("the agent class lists each Major or Critical left open by its fields", () => {
		const doc = read("core/autonomy.md");
		const heading = "### `agent`";
		const start = doc.indexOf(heading);
		const rest = doc.slice(start + heading.length);
		const end = rest.search(/^#{2,3} /m);
		const section = (end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, " ");
		expect(start).toBeGreaterThan(-1);
		for (const field of [
			"severity",
			"file and line",
			"what it says",
			"reason dismissal is proposed",
			"still open",
		])
			expect(section).toContain(field);
	});

	test("the doc holds the declaration as a line of its own", () => {
		expect(read("core/autonomy.md")).toMatch(/^This session runs unattended\.$/m);
	});
});
