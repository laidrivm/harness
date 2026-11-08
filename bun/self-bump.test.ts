/**
 * `.github/workflows/self-bump.yml` against `test.yml`, read as parsed YAML:
 * the workflow runs `bump.ts self` after the `Test` workflow, and a renamed
 * `Test` would otherwise stop every bump without a sound.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Job = { name?: string; if?: string; steps?: { id?: string; run?: string }[] };
type Workflow = {
	name?: string;
	on: { workflow_run?: { workflows?: string[]; types?: string[]; branches?: string[] }; workflow_dispatch?: unknown };
	jobs: Record<string, Job>;
};

const workflow = (file: string) =>
	Bun.YAML.parse(readFileSync(join(import.meta.dir, "../.github/workflows", file), "utf8")) as Workflow;

describe("self-bump.yml", () => {
	// spec: harness-updates/a-green-main-the-pin-lags-gets-a-bump-pull-request
	test("runs after Test completes on main alone, and on dispatch", () => {
		const { on } = workflow("self-bump.yml");
		expect(on.workflow_run).toEqual({
			workflows: [workflow("test.yml").name as string],
			types: ["completed"],
			branches: ["main"],
		});
		expect("workflow_dispatch" in on).toBe(true);
	});

	// spec: harness-updates/a-head-not-yet-green-proposes-nothing
	test("each job runs on a successful push run of Test, or a dispatch from main", () => {
		const jobs = Object.values(workflow("self-bump.yml").jobs);
		expect(jobs.length).toBeGreaterThan(0);
		for (const job of jobs)
			expect((job.if ?? "").replace(/\s+/g, " ")).toBe(
				"(github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
			);
	});

	// A step id or output key that matches nothing reads as a quiet run, and no bump is ever proposed.
	// spec: harness-updates/a-green-main-the-pin-lags-gets-a-bump-pull-request
	test("reads only the outputs bump.ts self writes, from the step that runs it", () => {
		const text = readFileSync(join(import.meta.dir, "../.github/workflows/self-bump.yml"), "utf8");
		const steps = Object.values(workflow("self-bump.yml").jobs).flatMap((job) => job.steps ?? []);
		expect(steps.find((step) => step.id === "bump")?.run).toBe("bun bun/bump.ts self");
		const read = new Set([...text.matchAll(/steps\.bump\.outputs\.(\w+)/g)].map((match) => match[1]));
		// The keys `bumpSelf` returns, which bump-self.test.ts pins as the script's GITHUB_OUTPUT lines.
		expect([...read].sort()).toEqual(["behind", "old", "sha"]);
	});

	// A `workflow_run` job's check run lands on main's head, where one named
	// `test` would become the run `green()` reads for every consumer's bump.
	test("names no job test", () => {
		const names = Object.entries(workflow("self-bump.yml").jobs).map(([key, job]) => job.name ?? key);
		expect(names).not.toContain("test");
	});
});
