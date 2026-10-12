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
			"core/autonomy.md: defines agent, card and user, found card, user",
			"core/flow.md: (unattended: agent) names no defined class",
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
