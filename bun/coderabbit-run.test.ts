/**
 * `coderabbit-run.ts`: the pure state of a commit's check runs, and the read
 * that lists them, spawned with a `gh` stub on `PATH`.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { interval, type Run, state } from "./coderabbit-run.ts";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";

afterAll(cleanup);

/** One check run as `check-runs` lists it, CodeRabbit's unless `slug` says otherwise. */
const run = (status: string, conclusion: string | null, title: string, slug = "coderabbitai", name = "CodeRabbit"): Run => ({
	name,
	status,
	conclusion,
	started_at: "2026-10-31T09:55:22Z",
	output: { title },
	app: { slug },
});
const SKIPPED = run("completed", "skipped", "Review skipped");
const RUNNING = run("in_progress", null, "Review in progress");
const DONE = run("completed", "success", "Finished");
const LIMITED = run("completed", "neutral", "Review rate limited");

describe("state", () => {
	test("an empty list, and one holding only another app's runs, give no run", () => {
		expect(state([]).name).toBe("no run");
		expect(state([run("completed", "success", "Build", "github-actions", "test")]).name).toBe("no run");
	});

	// spec: work-finish/a-run-another-app-posted
	test("a run named CodeRabbit that another app posted is ignored", () => {
		expect(state([run("completed", "success", "Finished", "impostor")]).name).toBe("no run");
		expect(state([SKIPPED, run("completed", "success", "Finished", "impostor")]).name).toBe("skipped");
	});

	// spec: work-finish/a-skipped-run-and-a-review-in-progress
	test("skipped plus in progress, and succeeded plus in progress, give reviewing", () => {
		expect(state([SKIPPED, RUNNING]).name).toBe("reviewing");
		expect(state([DONE, RUNNING]).name).toBe("reviewing");
	});

	// spec: work-finish/a-skip-and-a-rate-limit
	test("skipped plus a neutral Review rate limited gives rate limited", () => {
		expect(state([SKIPPED, LIMITED]).name).toBe("rate limited");
	});

	test("rate limited plus succeeded gives reviewed, in either order", () => {
		expect(state([LIMITED, DONE]).name).toBe("reviewed");
		expect(state([DONE, LIMITED]).name).toBe("reviewed");
	});

	test("a neutral run with another title gives that conclusion and title", () => {
		expect(state([SKIPPED, run("completed", "neutral", "Review paused")])).toEqual({ name: "other", conclusion: "neutral", title: "Review paused" });
	});

	// spec: work-finish/only-a-skip
	// spec: work-finish/a-skip-reported-as-a-success
	test("skipped alone, and a success titled Review skipped, give skipped", () => {
		expect(state([SKIPPED]).name).toBe("skipped");
		expect(state([run("completed", "success", "Review skipped: draft pull request")]).name).toBe("skipped");
	});

	test("a success with no output at all is a review", () => {
		expect(state([{ ...DONE, output: null }]).name).toBe("reviewed");
	});
});

/** `read("o/demo", "abc")` spawned with a `gh` stub printing `out` and exiting `code`, or spinning when `hang`; its result and the stub's calls. */
function read(out: string, code = 0, hang = false) {
	const bin = emptyDir("coderabbit-run-bin-");
	const log = join(bin, "calls");
	writeFileSync(join(bin, "answer"), out);
	// Builtins alone: `PATH` holds nothing else, so a hang spins rather than sleeps.
	const spin = hang ? "while :; do :; done\n" : "";
	writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n${spin}while IFS= read -r l; do printf '%s\\n' "$l"; done < '${bin}/answer'\nexit ${code}\n`);
	chmodSync(join(bin, "gh"), 0o755);
	const entry = join(bin, "entry.ts");
	writeFileSync(entry, `import { read } from ${JSON.stringify(join(import.meta.dir, "coderabbit-run.ts"))};\nconsole.log(JSON.stringify(read("o/demo", "abc")));\n`);
	const p = Bun.spawnSync([process.execPath, entry], { env: { PATH: bin, HARNESS_GH_TIMEOUT_MS: "300" }, timeout: 10_000 });
	return { result: JSON.parse(p.stdout.toString() || '"crashed"'), calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

describe("read", () => {
	test("calls the check-runs list of every page, one run a line, and a run on the second page counts", () => {
		const { result, calls } = read(`${JSON.stringify(SKIPPED)}\n${JSON.stringify(DONE)}\n`);
		expect(calls).toEqual(["api repos/o/demo/commits/abc/check-runs?filter=all&per_page=100 --paginate --jq .check_runs[]"]);
		expect(result).toEqual([SKIPPED, DONE]);
		expect(state(result).name).toBe("reviewed");
	});

	test("no runs at all is an empty list", () => {
		expect(read("").result).toEqual([]);
	});

	test("an exit that is not 0 is unread, with the exit and what gh said", () => {
		expect(read("HTTP 502\n", 1).result).toEqual({ name: "unread", why: "gh exited 1: HTTP 502" });
	});

	test("an output that is not JSON, and a line that is JSON but no object, are unread, saying so", () => {
		for (const out of ["<html>\n", "null\n", `[${JSON.stringify(DONE)}]\n`])
			expect(read(out).result).toEqual({ name: "unread", why: "gh's output is not one JSON object a line" });
	});

	test("a read killed at the limit is unread, saying so", () => {
		expect(read("", 0, true).result).toEqual({ name: "unread", why: "gh was killed at its limit" });
	});
});

describe("interval", () => {
	const saved = process.env.HARNESS_CODERABBIT_POLL_MS;
	afterEach(() => {
		if (saved === undefined) delete process.env.HARNESS_CODERABBIT_POLL_MS;
		else process.env.HARNESS_CODERABBIT_POLL_MS = saved;
	});

	test("unset, 0, -5 and x give 5000; 7 gives 7", () => {
		delete process.env.HARNESS_CODERABBIT_POLL_MS;
		const got = [interval()];
		for (const value of ["0", "-5", "x", "7"]) {
			process.env.HARNESS_CODERABBIT_POLL_MS = value;
			got.push(interval());
		}
		expect(got).toEqual([5000, 5000, 5000, 5000, 7]);
	});
});
