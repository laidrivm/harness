import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { bash, clone, env, host as fabricated, OPEN, running, skip, stop, tick } from "./pass.fixture.ts";

/** `pass.sh`'s pause notice (`pause-notice` task 2.1): the command `PASS_NOTIFY` names, run where the stop file is written. */

afterAll(cleanup);

/**
 * A notice command that appends, per call, its words and the stop file's line
 * to `<itself>.calls`, prints a line and exits `status`. It is named with a
 * word of its own after the script, so the split is what reaches it, and run
 * by `sh`, which is dash on CI's Linux.
 */
function notifier(status = 0) {
	const file = join(emptyDir("orchestrator-notify-"), "notify.sh");
	writeFileSync(file, `#!/bin/sh\nprintf '%s\\t' "$@" >>"$0.calls"\nhead -n 1 "$2" >>"$0.calls"\necho 'pause: a fake notice'\nexit ${status}\n`);
	return {
		extra: { PASS_NOTIFY: `sh ${file} --word` },
		calls: () => (existsSync(`${file}.calls`) ? readFileSync(`${file}.calls`, "utf8").trim().split("\n").map((l) => l.split("\t")) : []),
	};
}

describe.skipIf(skip)(`pass.sh's notice${skip ? " — skipped: flock is not on PATH; CI's ubuntu-latest runs these" : ""}`, () => {
	// spec: orchestrator/a-step-s-pass-exits-1
	test("a pass exiting 1 runs the command once, after the stop file is written, with it and the log, and the wrapper still exits 1", () => {
		const h = host("repo", 1);
		const n = notifier();
		const r = tick(h, "repo", n.extra);
		const [log] = readdirSync(join(h.state, "passes"));
		expect([r.code, r.last]).toEqual([1, OPEN]);
		expect(n.calls()).toEqual([["--word", stop(h, "repo"), join(h.state, "passes", log), readFileSync(stop(h, "repo"), "utf8").trim()]]);
		expect(r.out).toContain("pause: a fake notice\n");
	});

	// spec: orchestrator/the-ticks-that-follow
	test("the next tick exits 3 and runs the command not at all", () => {
		const h = host("repo", 1);
		const n = notifier();
		tick(h, "repo", n.extra);
		expect(tick(h, "repo", n.extra).code).toBe(3);
		expect(n.calls()).toHaveLength(1);
	});

	// spec: orchestrator/a-host-that-cannot-start-the-pass
	test("a halt before the pass, a missing token, runs the command with the stop file alone", () => {
		const h = host("repo", 0);
		rmSync(join(h.secrets, "claude_oauth_token"));
		const n = notifier();
		const r = tick(h, "repo", n.extra);
		const line = readFileSync(stop(h, "repo"), "utf8").trim();
		expect(r.code).toBe(1);
		expect(line).toContain("claude_oauth_token");
		expect(n.calls()).toEqual([["--word", stop(h, "repo"), line]]);
	});

	// spec: orchestrator/notion-refuses-a-call
	test("a command exiting 1 leaves the wrapper's status and the stop file as a pause with no notice has them", () => {
		const h = host("repo", 137);
		const n = notifier(1);
		const r = tick(h, "repo", n.extra);
		expect(r.code).toBe(137);
		expect(readFileSync(stop(h, "repo"), "utf8")).toMatch(new RegExp(`^\\d{8}T\\d{6}Z exit 137: ${OPEN}\\n$`));
		expect(n.calls()).toHaveLength(1);
	});

	test("with PASS_NOTIFY unset a pause runs nothing", () => {
		const h = host("repo", 1);
		const n = notifier();
		expect(tick(h, "repo").code).toBe(1);
		expect(n.calls()).toEqual([]);
	});

	// spec: orchestrator/a-pass-stopped-by-hand
	test("a pass stopped with stop.sh runs the command not at all", async () => {
		const h = host("repo", 1, true);
		const n = notifier();
		const p = await running(h, "repo", true, n.extra);
		const r = Bun.spawnSync([bash, join(import.meta.dir, "stop.sh"), "repo"], { cwd: h.root, env: env(h) });
		expect(r.exitCode).toBe(0);
		expect(await p.exited).not.toBe(0);
		expect(readFileSync(stop(h, "repo"), "utf8").trim()).toBe("stopped by hand");
		expect(n.calls()).toEqual([]);
	}, 20_000);
});

/** A host with one clone, `name`, whose runner exits `status`, holding when `hold`. */
function host(name: string, status: number, hold = false) {
	const h = fabricated();
	clone(h, name, { status, hold });
	return h;
}
