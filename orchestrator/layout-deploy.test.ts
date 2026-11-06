import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { instructions, madeOpen, read, root } from "./layout.fixture.ts";

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

const dockerfile = "orchestrator/runner/Dockerfile";

/** The tree file the Dockerfile's `COPY --chmod=0755 <source> <path>` puts at `path`, which the build context is orchestrator/ for. */
function copied(path: string) {
	const words = instructions(dockerfile)
		.map((l) => l.split(" "))
		.find((w) => w.length === 4 && w[0] === "COPY" && w[1] === "--chmod=0755" && w[3] === path);
	if (!words?.[2]) throw new Error(`no COPY --chmod=0755 line of ${dockerfile} puts a file at ${path}`);
	return join(root, "orchestrator", words[2]);
}

/**
 * Runs an event's commands under sh in `home`, as agent's session would, each
 * `/opt/orchestrator/<file>` they name read as the tree file the image copies
 * there, and returns their joined output.
 */
function run(home: string, event: string, source?: string) {
	let out = "";
	for (const command of commands(event, source)) {
		const local = command.replace(/\/opt\/orchestrator\/[\w.-]+/g, (p) => `'${copied(p)}'`);
		const r = Bun.spawnSync(["sh", "-c", local], { env: { PATH: process.env.PATH ?? "", HOME: home } });
		expect(r.exitCode).toBe(0);
		out += r.stdout.toString();
	}
	return out;
}

const mark = (home: string) => existsSync(join(home, ".harness-fresh"));

/**
 * A systemd unit file as section → key → value. Every line must be a
 * `[Section]`, a `Key=Value` under one, a comment or blank, and no section or
 * key may repeat, since systemd merges what this would overwrite, so a line
 * the reader does not take fails the case (systemd.syntax).
 */
function unit(p: string) {
	const out: Record<string, Record<string, string>> = {};
	let section: Record<string, string> | undefined;
	for (const line of read(p).split("\n")) {
		if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
		const head = /^\[([A-Za-z]+)\]$/.exec(line);
		if (head?.[1]) {
			if (Object.hasOwn(out, head[1])) throw new Error(`${p}: repeated section ${line}`);
			out[head[1]] = section = {};
			continue;
		}
		const pair = /^([A-Za-z]+)=(\S.*)$/.exec(line);
		if (!pair?.[1] || !pair[2] || !section || Object.hasOwn(section, pair[1]))
			throw new Error(`${p}: unread line ${line}`);
		section[pair[1]] = pair[2];
	}
	return out;
}

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
		// commands() reads a matcher as a list of exact values, which Claude Code does only for letters and `|`.
		for (const entry of hooks.SessionStart ?? []) expect(entry.matcher).toMatch(/^[a-z]+(?:\|[a-z]+)*$/);
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
			expect(out[1]).toBe(line);
			// Once printed it is in the conversation: the next start reports nothing, and the line stays on disk.
			expect(run(home, "SessionStart", source)).toBe("");
			expect(readFileSync(join(home, ".harness-deploy-failed.reported"), "utf8")).toBe(`${line}\n`);
		},
	);

	const failed = (home: string, line: string) => writeFileSync(join(home, ".harness-deploy-failed"), `${line}\n`);
	const reported = (home: string) => readFileSync(join(home, ".harness-deploy-failed.reported"), "utf8");

	// spec: orchestrator/a-failure-after-main-is-up
	test("a prompt prints a failure written after the start under the ask line, once, and a later one replaces the reported", () => {
		const home = emptyDir("orchestrator-home-");
		run(home, "SessionStart", "startup");
		failed(home, "20261106T100000Z deploy: the push failed at 0123abc");
		const out = run(home, "UserPromptSubmit").split("\n");
		expect(out[0]).toContain("report it to the user");
		expect(out[1]).toBe("20261106T100000Z deploy: the push failed at 0123abc");
		expect(run(home, "UserPromptSubmit")).toBe("");
		failed(home, "20261106T100500Z deploy: the record failed at 4567def");
		expect(run(home, "UserPromptSubmit").split("\n")[1]).toBe("20261106T100500Z deploy: the record failed at 4567def");
		expect(reported(home)).toBe("20261106T100500Z deploy: the record failed at 4567def\n");
	});

	// spec: orchestrator/a-prompt-with-no-failure
	test("a prompt with no failure file prints nothing and removes the mark", () => {
		const home = emptyDir("orchestrator-home-");
		run(home, "SessionStart", "startup");
		expect(run(home, "UserPromptSubmit")).toBe("");
		expect(mark(home)).toBe(false);
	});

	// spec: orchestrator/the-failure-file-cannot-be-moved-aside
	// A read-only directory stops nobody running as root, whom no session runs as.
	test.skipIf(process.getuid?.() === 0).each([
		["SessionStart", "startup"],
		["UserPromptSubmit", undefined],
	])("a %s hook whose move aside fails still prints the report, exits 0, and the next one reports it again", (event, source) => {
		const home = emptyDir("orchestrator-home-");
		const line = "20261106T100000Z deploy: the push failed at 0123abc";
		failed(home, line);
		mkdirSync(join(home, ".harness-deploy-failed.reported"), { mode: 0o555 });
		for (const _ of [1, 2]) expect(run(home, event, source).split("\n").slice(1, 2)).toEqual([line]);
		expect(readFileSync(join(home, ".harness-deploy-failed"), "utf8")).toBe(`${line}\n`);
	});

	// spec: orchestrator/a-failure-after-main-is-up
	test("both hooks run the report the image copies executable, and the mode check covers it", () => {
		const script = "/opt/orchestrator/deploy-failed.sh";
		expect(commands("SessionStart", "startup")).toContain(script);
		expect(commands("SessionStart", "resume")).toContain(script);
		expect(commands("UserPromptSubmit")).toContain(script);
		expect(() => copied("/opt/orchestrator/no-such.sh")).toThrow();
		const all = instructions(dockerfile);
		const copy = all.findIndex((l) => l === `COPY --chmod=0755 runner/deploy-failed.sh ${script}`);
		const check = all.findIndex((l) => l.startsWith('RUN test -z "$(find '));
		expect(copy).toBeGreaterThan(-1);
		// The check's modes are run in users.test.ts.
		expect(check).toBeGreaterThan(copy);
	});
});

describe("the deploy's units", () => {
	// spec: orchestrator/the-deploy-s-units
	test("a root oneshot runs deploy.sh from the checkout, five minutes after boot and after each run", () => {
		const service = unit("orchestrator/host/harness-deploy.service");
		// No User=: the deploy runs as root, which the Docker socket and the volumes' directories need.
		expect(service.Service).toEqual({
			Type: "oneshot",
			ExecStart: "/root/harness/orchestrator/deploy.sh",
			WorkingDirectory: "/root/harness/orchestrator",
			StateDirectory: "harness-deploy",
			TimeoutStartSec: "3h",
		});
		// The host's checkout is the tree at /root/harness, so ExecStart names the tracked script, which systemd
		// runs only when executable: the mode the commit records, the one a clone gets.
		const mode = Bun.spawnSync(["git", "ls-tree", "--full-tree", "HEAD", "--", "orchestrator/deploy.sh"], {
			cwd: root,
		});
		expect(mode.stdout.toString()).toStartWith("100755 ");
		const timer = unit("orchestrator/host/harness-deploy.timer");
		expect(timer.Timer).toEqual({ OnBootSec: "5min", OnUnitInactiveSec: "5min" });
		expect(timer.Install).toEqual({ WantedBy: "timers.target" });
	});
});
