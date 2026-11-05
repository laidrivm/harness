import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { instructions, madeOpen, read } from "./layout.fixture.ts";

/** The container's managed settings and the deploy's host files, read from the tree (host-deploy design). */

afterAll(cleanup);

type Entry = { matcher?: string; hooks: { type: string; command: string }[] };
const managed = "orchestrator/runner/managed-settings.json";
const events = () => (JSON.parse(read(managed)) as { hooks: Record<string, Entry[]> }).hooks;

/**
 * The commands Claude Code runs for an event and a `SessionStart` source: a
 * matcher of letters and `|` is a list of exact values, and an absent one
 * matches every occurrence (hooks reference, *Matcher patterns*).
 */
const commands = (event: string, source?: string) =>
	(events()[event] ?? [])
		.filter((e) => e.matcher === undefined || (source !== undefined && e.matcher.split("|").includes(source)))
		.flatMap((e) => e.hooks.map((h) => h.command));

/** Runs an event's commands under sh in `home`, as agent's session would, and returns their joined output. */
function run(home: string, event: string, source?: string) {
	let out = "";
	for (const command of commands(event, source)) {
		const r = Bun.spawnSync(["sh", "-c", command], { env: { PATH: process.env.PATH ?? "", HOME: home } });
		expect(r.exitCode).toBe(0);
		out += r.stdout.toString();
	}
	return out;
}

const mark = (home: string) => existsSync(join(home, ".harness-fresh"));

describe("the container's managed settings", () => {
	// spec: orchestrator/the-container-s-managed-settings
	test("the image copies them to Claude Code's Linux managed-settings path, between the directory's 0755 and the mode check", () => {
		const all = instructions("orchestrator/runner/Dockerfile");
		const copy = all.indexOf("COPY --chmod=0644 runner/managed-settings.json /etc/claude-code/managed-settings.json");
		const made = madeOpen(all, "/etc/claude-code");
		const check = all.findIndex((l) => l.startsWith("RUN ") && l.includes("find ") && l.includes("/etc/claude-code"));
		expect(copy).toBeGreaterThan(made);
		expect(made).toBeGreaterThan(-1);
		expect(check).toBeGreaterThan(copy);
		const hooks = events();
		expect(Object.keys(hooks).sort()).toEqual(["SessionStart", "UserPromptSubmit"]);
		expect(hooks.SessionStart?.map((e) => e.matcher)).toContain("startup|clear");
		expect(hooks.UserPromptSubmit?.every((e) => e.matcher === undefined)).toBe(true);
		// Only a `command` hook runs its string in a shell, as the cases below do; no other field (async, timeout) may change that.
		for (const entry of Object.values(hooks).flat())
			for (const hook of entry.hooks) expect(hook).toEqual({ type: "command", command: expect.any(String) });
	});

	// spec: orchestrator/the-user-s-first-message
	test.each(["startup", "clear"])(
		"a %s start marks the session fresh, and the first prompt removes the mark",
		(source) => {
			const home = emptyDir("orchestrator-home-");
			run(home, "SessionStart", source);
			expect(mark(home)).toBe(true);
			run(home, "UserPromptSubmit");
			expect(mark(home)).toBe(false);
		},
	);

	// spec: orchestrator/a-continued-start
	test("a resumed start leaves the mark as it was", () => {
		const home = emptyDir("orchestrator-home-");
		run(home, "SessionStart", "resume");
		expect(mark(home)).toBe(false);
		run(home, "SessionStart", "startup");
		run(home, "SessionStart", "resume");
		expect(mark(home)).toBe(true);
	});

	// spec: orchestrator/the-session-starts-after-a-failed-deploy
	// orchestrator/a-continued-start
	test.each(["startup", "clear", "resume"])(
		"a %s start prints the failure file under the ask line, and nothing without it",
		(source) => {
			const home = emptyDir("orchestrator-home-");
			expect(run(home, "SessionStart", source)).toBe("");
			const line = "2026-11-05T10:00:00Z deploy: build failed at 0123abc";
			writeFileSync(join(home, ".harness-deploy-failed"), `${line}\n`);
			const out = run(home, "SessionStart", source).split("\n");
			expect(out[0]).toContain("report");
			expect(out[0]).toContain("user");
			expect(out[0]).toContain("delete ~/.harness-deploy-failed");
			expect(out[1]).toBe(line);
		},
	);
});
