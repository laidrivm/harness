import { afterAll, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { change, clone, run, type Stubs, trusting } from "./board-loop.fixture.ts";

/** A pass on the host: in a push clone of its own, every command in the session's clone through the launcher. */

afterAll(cleanup);

/** A session's clone and a push clone of the same `origin`. */
function pair(tree = change("demo")) {
	const { dir, origin } = clone(tree);
	const push = emptyDir("board-loop-push-");
	git(push, "clone", "-q", origin, ".");
	return { dir, push };
}

/** One pass in `push`, with the stand-in launcher and `dir` as the session's clone. */
const launched = (dir: string, push: string, s: Stubs = {}, claudeJson = trusting(dir)) =>
	run(push, [], s, { env: { HARNESS_AS_AGENT: "as-agent", HARNESS_CLONE: dir }, claudeJson });

/** Each stub call: who ran it, where, and the call itself. */
const calls = (where: string) =>
	where
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [who, cwd, ...call] = line.split(" ");
			return { who, cwd, call: call.join(" ") };
		});

describe("the session's clone", () => {
	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	// spec: orchestrator/a-hook-or-a-config-command-in-the-session-s-clone
	test("every command run in it, or naming it, was started through the launcher", () => {
		const { dir, push } = pair();
		const r = launched(dir, push);
		const paths = [dir, realpathSync(dir)];
		const touching = calls(r.where).filter(
			({ cwd, call }) => !call.startsWith("as-agent ") && paths.some((p) => cwd === p || call.includes(p)),
		);
		// The status, the fast-forward, the install and both sessions all ran there.
		for (const name of ["git status", "git merge --ff-only", "bun install", "claude -p /goal"])
			expect(touching.some(({ call }) => call.startsWith(name))).toBe(true);
		expect(touching.filter(({ who }) => who !== "agent")).toEqual([]);
	});

	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	test("the trust check reads the session's clone, so an untrusted push clone does not refuse", () => {
		const { dir, push } = pair();
		expect(launched(dir, push).text).not.toContain("not a trusted workspace");
		const untrusted = launched(dir, push, {}, trusting(push));
		expect(untrusted.last).toBe(
			`board-loop: refused — not a trusted workspace — run claude once in ${realpathSync(dir)}, accept the trust dialog and /exit`,
		);
		expect(untrusted.calls).not.toContain("claude -p");
	});

	test("a launcher with no session's clone named refuses before any command", () => {
		const { push } = pair();
		const r = run(push, [], {}, { env: { HARNESS_AS_AGENT: "as-agent" } });
		expect(r.last).toBe("board-loop: refused — HARNESS_AS_AGENT is set and HARNESS_CLONE names no clone");
		expect(r.calls).not.toContain("as-agent");
	});
});

describe("the harness the runner runs", () => {
	// spec: orchestrator/a-session-edits-the-harness-copy-in-its-clone
	test("an edited goal check in the session's clone is never run; the runner's own copy judges", () => {
		const { dir, push } = pair();
		const r = launched(dir, push, { tamper: true });
		expect(r.last).not.toContain("goal met");
		const judged = calls(r.where).filter(({ call }) => call.startsWith("bun ") && !call.startsWith("bun install"));
		expect(judged.length).toBeGreaterThan(0);
		for (const { who, call } of judged) {
			expect(who).toBe("runner");
			expect(call).toStartWith(`bun --config=/dev/null --no-env-file ${join(import.meta.dir, "goal-check.ts")} `);
		}
	});

	// spec: orchestrator/a-preload-in-the-pushed-tree
	// The flags' effect on bun 1.4.2 is task 1.1's probe; `pass.sh` starts the board loop itself with them.
	test("every bun the runner starts carries the flags that keep a tree's bunfig.toml and .env out", () => {
		const { dir, push } = pair();
		const ran = calls(launched(dir, push).where).filter(({ who, call }) => who === "runner" && call.startsWith("bun "));
		expect(ran.length).toBeGreaterThan(0);
		for (const { call } of ran) expect(call).toStartWith("bun --config=/dev/null --no-env-file ");
	});

	test("with no launcher set, a pass runs in its clone as today, judged by a copy taken from it", () => {
		const { dir } = clone();
		const r = run(dir);
		expect(calls(r.where).some(({ who }) => who === "agent")).toBe(false);
		expect(r.calls).not.toContain("as-agent");
		expect(r.calls).toContain("board-loop-judge-");
		expect(r.calls).not.toContain("--config=/dev/null");
	});
});
