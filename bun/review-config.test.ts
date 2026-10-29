/**
 * Fails when the harness's `.coderabbit.yaml` stops reaching its rulebook: a
 * doc the rulebook indexes outside every configured guideline pattern, a
 * pattern that matches no tracked file, or a config the check cannot read.
 * Each reads, to the review bot, as a rulebook with nothing in it. Also fails
 * when the config turns the bot's approval off or its draft reviews on.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { at, parsed, unreached } from "./review-config.ts";
import { root } from "./root.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A config naming `patterns`, written as JSON, which is valid YAML. */
function config(patterns: unknown): string {
	return JSON.stringify({
		knowledge_base: { code_guidelines: { filePatterns: patterns } },
	});
}

/** A rulebook every pattern below reaches, unless a case overrides it. */
const BASE: Record<string, string | null> = {
	"CLAUDE.md": "@core/rules.md\n",
	"core/rules.md": "# Rules\n",
	".coderabbit.yaml": config(["core/*.md"]),
};

/**
 * A throwaway repository holding `BASE` with `files` laid over it — `null`
 * removes a file — all tracked, then `untracked` written beside them.
 */
function fabricate(
	files: Record<string, string | null>,
	untracked: Record<string, string> = {},
): string {
	const dir = mkdtempSync(join(tmpdir(), "review-config-"));
	made.push(dir);
	const git = (...args: string[]) => {
		const run = Bun.spawnSync(["git", ...args], { cwd: dir });
		if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	};
	const write = (path: string, text: string) => {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	};
	git("init", "-b", "main");
	for (const [path, text] of Object.entries({ ...BASE, ...files }))
		if (text !== null) write(path, text);
	git("add", "-A");
	for (const [path, text] of Object.entries(untracked)) write(path, text);
	return dir;
}

describe("the repository as it stands", () => {
	test("its config reaches the rulebook and every doc it indexes", () => {
		expect(unreached(root)).toEqual([]);
	});
});

describe("the bot's approval", () => {
	// spec: local-review-loop/the-config-leaves-automatic-approvals-off local-review-loop/the-config-turns-draft-reviews-on
	test("Automatic Approvals is on and draft reviews are not", () => {
		const read = parsed(root);
		if (typeof read === "string") throw new Error(read);
		expect(at(read.config, "reviews.auto_approvals.enabled")).toBe(true);
		expect(at(read.config, "reviews.auto_review.drafts")).not.toBe(true);
		// The schema's legacy alias of `auto_approvals.enabled`: one switch, one key.
		expect(at(read.config, "reviews.request_changes_workflow")).toBeUndefined();
	});

	// spec: local-review-loop/a-pull-request-past-the-default-pause
	test("automatic reviews never pause", () => {
		const read = parsed(root);
		if (typeof read === "string") throw new Error(read);
		const key = "reviews.auto_review.auto_pause_after_reviewed_commits";
		expect(at(read.config, key)).toBe(0);
	});
});

describe("a doc out of reach", () => {
	// spec: local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach
	test("a doc CLAUDE.md links outside every pattern is named", () => {
		const dir = fabricate({
			"CLAUDE.md": "@core/rules.md\nSee [x](docs/x.md).\n",
			"docs/x.md": "# X\n",
		});
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("docs/x.md");
	});

	// spec: local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach
	test("the rulebook itself outside every pattern is named", () => {
		const dir = fabricate({
			"CLAUDE.md": "@core/rules.md\nSee [x](docs/x.md).\n",
			"docs/x.md": "# X\n",
			".coderabbit.yaml": config(["docs/*.md"]),
		});
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("core/rules.md");
	});

	// spec: local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach
	test("a doc only the rulebook links, outside every pattern, is named", () => {
		const dir = fabricate({
			"core/rules.md": "# Rules\nSee [v](../docs/v.md).\n",
			"docs/v.md": "# V\n",
		});
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("docs/v.md");
	});

	// spec: local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach
	test("a file CLAUDE.md imports outside every pattern is named", () => {
		const dir = fabricate({
			"CLAUDE.md": "@core/rules.md\n@docs/extra.md\n",
			"docs/extra.md": "# Extra\n",
		});
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("docs/extra.md");
	});

	// spec: local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach
	test("`core/*.md` does not reach a skill under core/skills/", () => {
		const dir = fabricate({
			"CLAUDE.md": "@core/rules.md\nSee [s](core/skills/x/SKILL.md).\n",
			"core/skills/x/SKILL.md": "# Skill\n",
		});
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("core/skills/x/SKILL.md");
	});

	// spec: local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach
	test.each([
		// Another doc keeps `core/*.md` live, so the rulebook is the one problem.
		[
			"the rulebook",
			{ "core/rules.md": null, "core/x.md": "# X\n" },
			"core/rules.md",
		],
		[
			"a doc CLAUDE.md links",
			{ "CLAUDE.md": "@core/rules.md\nSee [g](core/gone.md).\n" },
			"core/gone.md",
		],
		["CLAUDE.md", { "CLAUDE.md": null }, "CLAUDE.md"],
	])("%s absent from the tree is named", (_name, files, named) => {
		const problems = unreached(fabricate(files));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(named);
	});

	// spec: local-review-loop/a-doc-the-rulebook-indexes-falls-out-of-reach
	test.each([
		["a titled link", 'See [x](docs/x.md "X").\n'],
		["a reference definition", "See [x][x].\n\n[x]: docs/x.md\n"],
	])("a doc behind %s outside every pattern is named", (_name, link) => {
		const dir = fabricate({
			"CLAUDE.md": `@core/rules.md\n${link}`,
			"docs/x.md": "# X\n",
		});
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("docs/x.md");
	});

	test("a link carrying an anchor reaches the doc it names", () => {
		const dir = fabricate({
			"CLAUDE.md": "@core/rules.md\nSee [t](core/t.md#a-section).\n",
			"core/t.md": "# T\n",
		});
		expect(unreached(dir)).toEqual([]);
	});

	test("an external link is not taken as a doc", () => {
		const dir = fabricate({
			"CLAUDE.md": "@core/rules.md\nSee [w](https://example.com/w.md).\n",
		});
		expect(unreached(dir)).toEqual([]);
	});

	test("a README link is exempt and needs no pattern", () => {
		const dir = fabricate({
			"CLAUDE.md": "@core/rules.md\nLayout in [README.md](README.md).\n",
			"README.md": "# Package\n",
		});
		expect(unreached(dir)).toEqual([]);
	});
});

describe("a pattern that matches nothing", () => {
	// spec: local-review-loop/a-pattern-that-matches-nothing
	test("a dead pattern beside a live one is named alone", () => {
		const dir = fabricate({
			".coderabbit.yaml": config(["core/*.md", "lib/*.md"]),
		});
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("lib/*.md");
	});

	// spec: local-review-loop/a-pattern-that-matches-nothing
	test("a pattern matching only an untracked file matches nothing", () => {
		const dir = fabricate(
			{ ".coderabbit.yaml": config(["core/*.md", "notes/*.md"]) },
			{ "notes/a.md": "# Draft\n" },
		);
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("notes/*.md");
	});
});

describe("a config the check cannot read", () => {
	// spec: local-review-loop/a-config-the-test-cannot-read
	test.each([
		["is absent", null, "absent"],
		["is empty", "", "missing"],
		["names a single string", config("core/*.md"), "not a list"],
		["does not parse", "knowledge_base: [", "does not parse"],
		["has no filePatterns", "language: en-GB\n", "missing"],
		["has an empty list", config([]), "empty"],
		["has a blank entry", config(["core/*.md", "  "]), "filePatterns[1]"],
		["has a non-string entry", config(["core/*.md", { a: 1 }]), "filePatterns[1]"],
	])("a config that %s fails, saying so", (_name, text, says) => {
		const dir = fabricate({ ".coderabbit.yaml": text });
		const problems = unreached(dir);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(".coderabbit.yaml");
		expect(problems[0]).toContain(says);
	});
});
