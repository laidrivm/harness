import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_REVIEW, JUDGEMENT, PROJECT_CHECKS, required, TRIAGE, WARM, ZOMBIES } from "./pre-pr-steps.ts";

/**
 * `required` alone, over the paths a diff lists and whether the branch's pull
 * request is open. Bracketed numbers are the proposal-stage `/zombies` ideas.
 */

const DOCS = [PROJECT_CHECKS, TRIAGE, CODE_REVIEW];
const CODE = [PROJECT_CHECKS, ZOMBIES, TRIAGE, CODE_REVIEW];
const EVERY = [PROJECT_CHECKS, ZOMBIES, WARM, TRIAGE, CODE_REVIEW];

describe("a branch with no pull request open", () => {
	// spec: pre-pr-runner/nothing-past-the-base
	test("no changed path names the documentation branch's steps [1]", () => {
		expect(required([], false)).toEqual(DOCS);
	});

	// spec: pre-pr-runner/a-diff-it-cannot-read
	test("a diff it cannot read names every step, `warm` included [2]", () => {
		expect(required(undefined, false)).toEqual(EVERY);
	});

	// spec: pre-pr-runner/markdown-alone
	test("one `.md` path names the project checks, `triage` and `code-review` [3]", () => {
		expect(required(["README.md"], false)).toEqual(DOCS);
	});

	test("one `.ts` path adds `zombies` and not `warm` [4]", () => {
		expect(required(["bun/a.ts"], false)).toEqual(CODE);
	});

	// spec: pre-pr-runner/a-proposal-with-one-source-file
	test("`openspec/` files plus one `.ts` file name `zombies` [5]", () => {
		expect(required(["openspec/changes/x/tasks.md", "openspec/changes/x/.openspec.yaml", "bun/a.ts"], false)).toEqual(CODE);
	});

	test("`.md` files in nested directories stay documentation [6]", () => {
		expect(required(["core/skills/warm/SKILL.md", "a/b/c/d.md"], false)).toEqual(DOCS);
	});

	test("the ids come out in one order whatever the order of the paths [7]", () => {
		const paths = ["bun.lock", "a.md", "b.ts", "openspec/x.yaml"];
		expect(required([...paths].reverse(), false)).toEqual(required(paths, false));
		expect(required(paths, false)).toEqual(EVERY);
	});

	test.each([
		["README.MD [8]"],
		["openspec-notes.txt [9]"],
		["notes.md.ts [10]"],
	])("%s is code", (path) => {
		expect(required([path.split(" ")[0]], false)).toEqual(CODE);
	});

	test.each([["package.json.bak [11]"], ["bun.lockb [12]"]])("%s brings no `warm`", (path) => {
		expect(required([path.split(" ")[0]], false)).toEqual(CODE);
	});

	// spec: pre-pr-runner/a-lockfile-alone
	test("`bun.lock` alone brings `warm`", () => {
		expect(required(["bun.lock"], false)).toEqual(EVERY);
	});

	// spec: pre-pr-runner/a-nested-manifest
	test("`packages/a/package.json` brings `warm` [13]", () => {
		expect(required(["packages/a/package.json"], false)).toEqual(EVERY);
	});

	test("a `package.json` under `openspec/` alone stays documentation, with no `warm` [14]", () => {
		expect(required(["openspec/changes/x/package.json"], false)).toEqual(DOCS);
	});

	// spec: pre-pr-runner/config-alone
	test.each([[".coderabbit.yaml"], [".github/workflows/test.yml"], [".claude/settings.json"]])(
		"`%s` alone names the code branch's steps",
		(path) => {
			expect(required([path], false)).toEqual(CODE);
		},
	);
});

describe("a branch whose pull request is open", () => {
	// spec: pre-pr-runner/a-code-branch-with-its-pull-request-open pre-pr-runner/an-open-pull-request-over-a-diff-it-cannot-read
	test.each([
		["a code branch", ["bun/a.ts", "bun.lock"]],
		["a documentation branch", ["README.md"]],
		["a diff it cannot read", undefined],
	])("%s names the project checks alone", (_, paths) => {
		expect(required(paths, true)).toEqual([PROJECT_CHECKS]);
	});
});

describe("the ids", () => {
	// The `Skill` hook records the skill's name; unattended, a call no entry allows is refused and leaves no record.
	test.each(JUDGEMENT.map((id) => [id]))("`%s` is a skill the harness's settings allow by that name", (id) => {
		const allow = JSON.parse(readFileSync(join(import.meta.dir, "..", ".claude", "settings.json"), "utf8")).permissions.allow;
		expect(allow).toContain(`Skill(${id})`);
	});

	// A missing skill would leave its step with no record ever matching it. `code-review` is built in,
	// with no `SKILL.md` here: the case above pins its `Skill(code-review)` entry instead.
	test.each(JUDGEMENT.filter((id) => id !== CODE_REVIEW).map((id) => [id]))("`%s` names a skill of that name [15]", (id) => {
		const skill = readFileSync(join(import.meta.dir, "..", "core", "skills", id, "SKILL.md"), "utf8");
		expect(skill.match(/^name:\s*(\S+)\s*$/m)?.[1]).toBe(id);
	});
});
