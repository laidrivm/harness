/**
 * `.github/workflows/self-bump.yml` against `test.yml`, read as parsed YAML:
 * the workflow runs `bump.ts self` after the `Test` workflow, and a renamed
 * `Test` would otherwise stop every bump without a sound.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Job = { name?: string; if?: string };
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
		for (const job of jobs) {
			const condition = (job.if ?? "").replace(/\s+/g, " ");
			expect(condition).toContain("github.event.workflow_run.conclusion == 'success'");
			expect(condition).toContain("github.event.workflow_run.event == 'push'");
			expect(condition).toContain("github.event_name == 'workflow_dispatch'");
			expect(condition).toContain("github.ref == 'refs/heads/main'");
		}
	});

	// A `workflow_run` job's check run lands on main's head, where one named
	// `test` would become the run `green()` reads for every consumer's bump.
	test("names no job test", () => {
		const names = Object.entries(workflow("self-bump.yml").jobs).map(([key, job]) => job.name ?? key);
		expect(names).not.toContain("test");
	});
});
