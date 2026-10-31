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
	// spec: work-finish/a-run-another-app-posted
	// spec: work-finish/a-skipped-run-and-a-review-in-progress
	// spec: work-finish/a-skip-and-a-rate-limit
	// spec: work-finish/only-a-skip
	// spec: work-finish/a-skip-reported-as-a-success
	test.each<[string, Run[], string]>([
		["an empty list", [], "no run"],
		["only another app's runs", [run("completed", "success", "Build", "github-actions", "test")], "no run"],
		["a run named CodeRabbit another app posted", [run("completed", "success", "Finished", "impostor")], "no run"],
		["a skip beside another app's CodeRabbit success", [SKIPPED, run("completed", "success", "Finished", "impostor")], "skipped"],
		["skipped plus in progress", [SKIPPED, RUNNING], "reviewing"],
		["succeeded plus in progress", [DONE, RUNNING], "reviewing"],
		["skipped plus a neutral Review rate limited", [SKIPPED, LIMITED], "rate limited"],
		["rate limited, then succeeded", [LIMITED, DONE], "reviewed"],
		["succeeded, then rate limited", [DONE, LIMITED], "reviewed"],
		["skipped alone", [SKIPPED], "skipped"],
		["a success titled Review skipped", [run("completed", "success", "Review skipped: draft pull request")], "skipped"],
		["a success with no output at all", [{ ...DONE, output: null }], "reviewed"],
	])("%s gives %p", (_, runs, name) => {
		expect(state(runs).name).toBe(name);
	});

	test("a neutral run with another title gives that conclusion and title", () => {
		expect(state([SKIPPED, run("completed", "neutral", "Review paused")])).toEqual({ name: "other", conclusion: "neutral", title: "Review paused" });
	});
});

/** `read("o/demo", "abc")` spawned with a `gh` stub printing `out` and exiting `code`, or spinning when `hang`; its result and the stub's calls. */
function read(out: string, code = 0, hang = false) {
	const bin = emptyDir("coderabbit-run-bin-");
	const log = join(bin, "calls");
	writeFileSync(join(bin, "answer"), out);
	// Builtins alone: `PATH` holds nothing else, so a hang spins rather than sleeps.
	const spin = hang ? "while :; do :; done\n" : "";
	const colour = `printf '%s %s %s\\n' "\${CLICOLOR_FORCE-unset}" "\${GH_FORCE_TTY-unset}" "\${NO_COLOR-unset}" > '${bin}/colour'\n`;
	writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n${colour}${spin}while IFS= read -r l; do printf '%s\\n' "$l"; done < '${bin}/answer'\nexit ${code}\n`);
	chmodSync(join(bin, "gh"), 0o755);
	const entry = join(bin, "entry.ts");
	writeFileSync(entry, `import { read } from ${JSON.stringify(join(import.meta.dir, "coderabbit-run.ts"))};\nconsole.log(JSON.stringify(read("o/demo", "abc")));\n`);
	// The session's own settings that make `gh` colour and pretty-print `--jq`'s output.
	const env = { PATH: bin, HARNESS_GH_TIMEOUT_MS: "300", CLICOLOR_FORCE: "1", GH_FORCE_TTY: "1" };
	const p = Bun.spawnSync([process.execPath, entry], { env, timeout: 10_000 });
	const lines = (file: string) => readFileSync(join(bin, file), "utf8").split("\n").filter(Boolean);
	return { result: JSON.parse(p.stdout.toString() || '"crashed"'), calls: lines("calls"), colour: lines("colour")[0] };
}

describe("read", () => {
	// `--paginate` with `--jq` prints each page's runs as lines of their own, so a second page's run is a later line.
	test("calls the check-runs list with --paginate, and a run on a later line, as a second page's is, counts", () => {
		const { result, calls } = read(`${JSON.stringify(SKIPPED)}\n${JSON.stringify(DONE)}\n`);
		expect(calls).toEqual(["api repos/o/demo/commits/abc/check-runs?filter=all&per_page=100 --paginate --jq .check_runs[]"]);
		expect(result).toEqual([SKIPPED, DONE]);
		expect(state(result).name).toBe("reviewed");
	});

	test("gh runs with colour off and no forced terminal, whatever the session sets", () => {
		expect(read("").colour).toBe("0 unset 1");
	});

	test("no runs at all is an empty list", () => {
		expect(read("").result).toEqual([]);
	});

	test("an exit that is not 0 is unread, with the exit and what gh said", () => {
		expect(read("HTTP 502\n", 1).result).toEqual({ name: "unread", why: "gh exited 1: HTTP 502" });
	});

	test.each([
		["not JSON", "<html>\n"],
		["JSON null", "null\n"],
		["a JSON array", `[${JSON.stringify(DONE)}]\n`],
	])("a line that is %s is unread, saying so", (_, out) => {
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

	test.each<[string | undefined, number]>([
		[undefined, 5000],
		["0", 5000],
		["-5", 5000],
		["x", 5000],
		["7", 7],
	])("HARNESS_CODERABBIT_POLL_MS %p gives %p", (value, expected) => {
		if (value === undefined) delete process.env.HARNESS_CODERABBIT_POLL_MS;
		else process.env.HARNESS_CODERABBIT_POLL_MS = value;
		expect(interval()).toBe(expected);
	});
});
