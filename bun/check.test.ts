/**
 * The consumer checks that are this module's own: the skill links and the
 * workflows. Each case fabricates a consumer, because what a real one holds is
 * the consumer's to assert, from its own tree.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { links, workflows } from "./check.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** The link a consumer tracks for `name`, as `bun install` resolves it. */
const intoPackage = (name: string) =>
	`../../node_modules/harness/core/skills/${name}`;

/**
 * A consumer repository holding `files` and `symlinks`, all tracked, beside an
 * installed package carrying `installed` skills, which git does not track.
 */
function consumer({
	files = {},
	symlinks = {},
	installed = ["triage"],
}: {
	files?: Record<string, string>;
	symlinks?: Record<string, string>;
	installed?: string[];
}): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-check-"));
	made.push(dir);
	const write = (path: string, text: string) => {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	};
	for (const [path, text] of Object.entries(files)) write(path, text);
	for (const [path, target] of Object.entries(symlinks)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		symlinkSync(target, join(dir, path));
	}
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
	for (const name of installed)
		write(`node_modules/harness/core/skills/${name}/SKILL.md`, `# ${name}\n`);
	return dir;
}

describe("a skill link", () => {
	test("into the installed package, holding a SKILL.md, passes", () => {
		const dir = consumer({
			symlinks: { ".claude/skills/triage": intoPackage("triage") },
		});
		expect(links(dir)).toEqual([]);
	});

	test("into a sibling checkout fails, naming the entry and its target", () => {
		const dir = consumer({
			symlinks: { ".claude/skills/triage": "../../../skills/triage" },
		});
		expect(links(dir)).toEqual([
			".claude/skills/triage: links to ../../../skills/triage, outside node_modules/harness/core/skills/",
		]);
	});

	test("to a skill the package no longer carries fails, naming it", () => {
		const dir = consumer({
			symlinks: { ".claude/skills/review-order": intoPackage("review-order") },
		});
		expect(links(dir)).toEqual([
			`.claude/skills/review-order: links to ${intoPackage("review-order")}, which holds no SKILL.md`,
		]);
	});

	test("a tracked file that is not a link fails, naming it", () => {
		const dir = consumer({ files: { ".claude/skills/local/SKILL.md": "x\n" } });
		expect(links(dir)).toEqual([
			".claude/skills/local/SKILL.md: tracked, and not a link into the harness",
		]);
	});

	test("an untracked entry is not read", () => {
		// A clone does not have it, so it can neither pass nor fail one.
		const dir = consumer({});
		symlinkSync("../../../skills/triage", join(dir, ".claude-untracked"));
		mkdirSync(join(dir, ".claude/skills"), { recursive: true });
		symlinkSync("../../../skills/zombies", join(dir, ".claude/skills/zombies"));
		expect(links(dir)).toEqual([]);
	});
});

describe("a workflow", () => {
	const workflow = (steps: string, job = "") =>
		`on: push\njobs:\n  check:\n${job}    runs-on: ubuntu-latest\n    steps:\n${steps}`;

	test("checking out the harness repository fails, naming the workflow", () => {
		const dir = consumer({
			files: {
				".github/workflows/lint.yml": workflow(
					"      - uses: actions/checkout@0000000000000000000000000000000000000000\n        with:\n          repository: laidrivm/harness\n",
				),
			},
		});
		expect(workflows(dir)).toEqual([
			".github/workflows/lint.yml: job check checks out laidrivm/harness",
		]);
	});

	test("calling a reusable workflow from the harness fails, naming it", () => {
		const dir = consumer({
			files: {
				".github/workflows/gates.yml":
					"on: push\njobs:\n  gates:\n    uses: laidrivm/harness/.github/workflows/gates.yml@main\n",
			},
		});
		expect(workflows(dir)).toEqual([
			".github/workflows/gates.yml: job gates calls laidrivm/harness/.github/workflows/gates.yml@main",
		]);
	});

	test("running the gates from the installed package passes", () => {
		const dir = consumer({
			files: {
				".github/workflows/lint.yml": workflow(
					"      - uses: actions/checkout@0000000000000000000000000000000000000000\n      - run: bun install --frozen-lockfile\n      - run: bun node_modules/harness/bun/check.ts\n",
				),
			},
		});
		expect(workflows(dir)).toEqual([]);
	});
});
