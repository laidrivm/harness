#!/usr/bin/env bun
/**
 * The consumer's entry point: every check the harness owes a project, run over
 * the repository the command is run in — `bun node_modules/harness/bun/check.ts`
 * from its root. `bun test` collects nothing under `node_modules/`, so the
 * harness's own suite never runs there; this is what does.
 *
 * Each check returns its problems as lines rather than throwing, so one run
 * reports all of them. A check that cannot read its input at all — a key
 * absent from `harness`, a tree git cannot list — throws, and the run fails on
 * that before anything could read as clean.
 */
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { read } from "./config.ts";
import { oversize } from "./file-size.ts";
import { ranges } from "./manifest-ranges.ts";
import { scan } from "./no-suppressions.ts";
import { stray } from "./repo-layout.ts";
import { check as citations, gauge, uncited } from "./spec-coverage.ts";

/** What git tracks under `dir` in `root`, with the mode it records for each. */
function tracked(root: string, dir: string): { mode: string; path: string }[] {
	const ls = Bun.spawnSync(["git", "ls-files", "-s", "-z", "--", dir], {
		cwd: root,
	});
	if (ls.exitCode !== 0) throw new Error(ls.stderr.toString());
	return ls.stdout
		.toString()
		.split("\0")
		.filter(Boolean)
		.map((entry) => ({
			mode: entry.slice(0, entry.indexOf(" ")),
			path: entry.slice(entry.indexOf("\t") + 1),
		}));
}

/** Where a skill link must point: the installed package, and nowhere else. */
const PACKAGE_SKILLS = "node_modules/harness/core/skills/";

/**
 * Every tracked entry under `.claude/skills/` that is not a link into the
 * installed package, points elsewhere, or does not resolve to a skill. Untracked
 * files there are not read: a clone does not have them.
 */
export function links(root: string): string[] {
	const problems: string[] = [];
	for (const { mode, path } of tracked(root, ".claude/skills")) {
		if (mode !== "120000") {
			problems.push(`${path}: tracked, and not a link into the harness`);
			continue;
		}
		const target = readlinkSync(join(root, path));
		const resolved = normalize(join(dirname(path), target));
		if (!resolved.startsWith(PACKAGE_SKILLS))
			problems.push(`${path}: links to ${target}, outside ${PACKAGE_SKILLS}`);
		else if (!existsSync(join(root, resolved, "SKILL.md")))
			problems.push(`${path}: links to ${target}, which holds no SKILL.md`);
	}
	return problems;
}

/** The harness's repository, which no workflow may reach except by the pin. */
const HARNESS_REPO = "laidrivm/harness";

type Step = { uses?: string; with?: { repository?: string } };
type Workflow = { jobs?: Record<string, { uses?: string; steps?: Step[] }> };

/**
 * Every workflow that checks out the harness repository or calls a reusable
 * workflow from it. Either would run a second commit of it beside the one
 * `bun.lock` pins, so CI and a session could disagree about what a gate is.
 */
export function workflows(root: string): string[] {
	const problems: string[] = [];
	for (const { path } of tracked(root, ".github/workflows")) {
		if (!/\.ya?ml$/.test(path)) continue;
		const text = readFileSync(join(root, path), "utf8");
		const jobs = (Bun.YAML.parse(text) as Workflow | null)?.jobs ?? {};
		for (const [name, job] of Object.entries(jobs)) {
			if (job?.uses?.startsWith(`${HARNESS_REPO}/`))
				problems.push(`${path}: job ${name} calls ${job.uses}`);
			for (const step of job?.steps ?? [])
				if (
					step?.uses?.startsWith("actions/checkout") &&
					step.with?.repository === HARNESS_REPO
				)
					problems.push(`${path}: job ${name} checks out ${HARNESS_REPO}`);
		}
	}
	return problems;
}

/** The manifest's own version rules, the harness pin among them. */
export function pin(root: string): string[] {
	return ranges(readFileSync(join(root, "package.json"), "utf8"));
}

/** The gates whose values the consumer's `harness` key holds. */
export function gates(root: string): string[] {
	const { count, why } = read(root, "uncitedFloor");
	return [
		...stray(root),
		...scan(root).map(({ path, line, marker }) => `${path}:${line}: ${marker}`),
		...oversize(root).map(
			({ path, count, cap }) =>
				`${path}: ${count} lines, over the cap of ${cap}`,
		),
		...citations(root).problems,
		...gauge(uncited(root), count, why),
	];
}

/** Every problem the checks find in `root`. */
export function run(root: string): string[] {
	return [...pin(root), ...links(root), ...workflows(root), ...gates(root)];
}

if (import.meta.main) {
	const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
	if (top.exitCode !== 0) throw new Error(top.stderr.toString());
	const problems = run(top.stdout.toString().replace(/\n$/, ""));
	for (const problem of problems) console.error(problem);
	if (problems.length) process.exit(1);
}
