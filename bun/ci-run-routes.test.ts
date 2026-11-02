import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ATTEMPT,
	answer,
	api,
	BLOCKED,
	deliver,
	free,
	type Host,
	host,
	ignored,
	payload,
	rev,
	SHA,
	start,
	stop,
} from "./ci-run.fixture.ts";
import { cleanup, emptyDir, ended, git } from "./diff-budget.fixture.ts";

/**
 * The CI flow's scheduled and flaky routes, and the flow on the host through
 * its launcher, against the stand-in `ci-run.fixture.ts` serves. [n]:
 * `ci-run-agent`'s `/zombies` items.
 */

afterAll(cleanup);
beforeAll(start);
afterAll(stop);

describe("the scheduled and flaky routes", () => {
	const scheduled = (run: Record<string, unknown> = {}) =>
		payload({ event: "schedule", head_branch: "main", name: "nightly", ...run });
	/** The clones' directory the scheduled route reads, with `r` the host's clone in it. */
	const clones = (h: Host) => {
		const dir = join(h.root, "clones");
		mkdirSync(dir, { recursive: true });
		if (!existsSync(join(dir, "r"))) symlinkSync(h.clone, join(dir, "r"));
		return { HARNESS_CI_CLONES: dir };
	};
	const seen = (h: Host, file: string) => readFileSync(join(h.home, file), "utf8");
	const table = (h: Host) => readFileSync(join(h.home, "orchestrator", "pr-sessions.jsonl"), "utf8");
	const status = (h: Host) => Bun.spawnSync(["git", "-C", h.clone, "status", "--porcelain"]).stdout.toString();
	/** The session was a new one, never the table's resumed. */
	const fresh = (h: Host) => {
		const argv = seen(h, "claude-argv").split("\n");
		expect(argv).toContain("--session-id");
		expect(argv).not.toContain("-r");
	};
	const commit = "echo b > b.txt && git add b.txt && git commit -qm b\n";

	// spec: orchestrator/a-nightly-audit-fails
	test("a failed scheduled run on the default branch: a fresh session in the repository's clone, no table line, tree and HEAD unchanged [55]", async () => {
		const h = host();
		const before = table(h);
		const r = await deliver(h, scheduled(), { env: clones(h) });
		expect([r.code, r.held, api.posted]).toEqual([0, "acted", []]);
		expect(r.line).toBe(
			"event: handled — scheduled run https://github.com/o/r/actions/runs/5 failed on main; the session answered blocked",
		);
		fresh(h);
		const argv = seen(h, "claude-argv");
		for (const named of ["harness.board", "nightly", "https://github.com/o/r/actions/runs/5", join(h.logs, "5-1.log")])
			expect(argv).toContain(named);
		expect(seen(h, "claude-pwd").trim()).toBe(realpathSync(h.clone));
		expect([table(h), rev(h.clone, "HEAD"), status(h)]).toEqual([before, SHA, ""]);
		expect(seen(h, "gh-calls")).toBe("run view 5 -R o/r --attempt 1 --log-failed\n");
	});

	test.each([["o/r/x"], ["o/"]])("a scheduled run of %p, no <owner>/<name>, starts no session", async (name) => {
		const h = host();
		const run = { event: "schedule", head_branch: "main", name: "nightly", head_repository: { full_name: name } };
		const top = { repository: { full_name: name, default_branch: "main" } };
		const r = await deliver(h, payload(run, top), { env: clones(h) });
		expect(r.line).toContain(`the payload's repository ${name} is no <owner>/<name>`);
		expect(existsSync(join(h.home, "claude-argv"))).toBe(false);
	});

	test.each([
		["a commit", commit],
		["a changed file", "echo c >> a.txt\n"],
		["a file in a directory already untracked", "echo c > scratch/b.txt\n"],
	])("a scheduled session that made %s: exit 1 naming the clone [56]", async (_, script) => {
		const h = host();
		mkdirSync(join(h.clone, "scratch"));
		writeFileSync(join(h.clone, "scratch", "a.txt"), "a");
		writeFileSync(join(h.home, "claude-act"), script);
		const r = await deliver(h, scheduled(), { env: clones(h) });
		expect(r.code).toBe(1);
		expect(r.line).toMatch(/^event: failed — .*changed/);
		expect(r.line).toContain(join(h.root, "clones", "r"));
		expect(rev(h.bare, "refs/heads/main")).toBe(SHA);
	});

	test("a scheduled run on another branch is ignored [57]", async () => {
		const h = host();
		ignored(await deliver(h, scheduled({ head_branch: "feat/x" }), { env: clones(h) }), /scheduled run on feat\/x/);
		expect(api.permissions).toBeUndefined();
	});

	test("a success on the event's own attempt is no flaky run: attempt 1/3 as for any failure [38]", async () => {
		const h = host();
		api.latest = { run_attempt: 1, conclusion: "success" };
		const r = await deliver(h, payload());
		expect(r.line).toBe(`event: handled — attempt 1/3 posted on #7; ${BLOCKED}`);
	});

	// spec: orchestrator/a-failure-the-user-re-ran-green
	test("a later attempt that passed: no attempt comment, a fresh session on the failed attempt's logs, nothing pushed [58]", async () => {
		const h = host();
		api.latest = { run_attempt: 2, conclusion: "success" };
		writeFileSync(join(h.home, "claude-out"), answer("flaky"));
		const r = await deliver(h, payload());
		expect([r.code, r.held, api.posted]).toEqual([0, "acted", []]);
		expect(r.line).toBe("event: handled — attempt 2 of the run passed: flaky on #7; the session answered flaky");
		fresh(h);
		expect(seen(h, "claude-argv")).toContain("core/testing.md");
		expect(seen(h, "gh-calls")).toBe("run view 5 -R o/r --attempt 1 --log-failed\n");
		expect([rev(h.bare, "refs/heads/feat/x"), status(h)]).toEqual([SHA, ""]);
	});

	// spec: orchestrator/it-fails-again-the-next-night
	test("the next night's failure of the same workflow tells its fresh session to file no card while an open one names that workflow", async () => {
		const h = host();
		const env = clones(h);
		await deliver(h, scheduled(), { env });
		const r = await deliver(h, scheduled({ id: 6, html_url: "https://github.com/o/r/actions/runs/6" }), { env });
		expect([r.code, api.posted]).toEqual([0, []]);
		fresh(h);
		// The runner keeps no card state: whether a card is open is the session's read of the board, which only a live run shows.
		const prompt = seen(h, "claude-argv").replace(/\s+/g, " ");
		expect(prompt).toContain("File one idea card naming the workflow and the run");
		expect(prompt).toContain("unless a card that is not done already names that workflow's failure.");
		expect([rev(h.clone, "HEAD"), status(h)]).toEqual([SHA, ""]);
	});

	// spec: orchestrator/a-failure-that-failed-again
	test("a run that failed on attempt 2 after attempt 1 is handled as any failure: attempt 1/3, on attempt 2's logs", async () => {
		const h = host();
		api.latest = { run_attempt: 2, conclusion: "failure" };
		const r = await deliver(h, payload({ run_attempt: 2 }));
		expect([r.code, r.line]).toEqual([0, `event: handled — attempt 1/3 posted on #7; ${BLOCKED}`]);
		expect(api.posted).toEqual([`${ATTEMPT} 1/3 — https://github.com/o/r/actions/runs/5 at ${SHA}`]);
		expect(seen(h, "claude-argv")).toContain(join(h.logs, "5-2.log"));
		expect(seen(h, "gh-calls")).toBe("pr ready 7 -R o/r --undo\nrun view 5 -R o/r --attempt 2 --log-failed\n");
	});
});

describe("on the host, through the launcher", () => {
	/** The launcher's stand-in, which enters the clone it is handed and marks what it starts as `agent`'s, and a `git` logging who ran it, where. */
	let tools = "";
	beforeAll(() => {
		tools = emptyDir("ci-run-host-");
		writeFileSync(
			join(tools, "as-agent"),
			'#!/bin/sh\necho "$*" >> "$HOME/as-agent-calls"\ncd "$1" || exit 1\nshift\nexport AS_AGENT=agent\nexec "$@"\n',
			{ mode: 0o755 },
		);
		// `FAIL_ORIGIN_FETCH_IN` names a directory whose `git fetch -q origin` fails as the network does, every other call real.
		writeFileSync(
			join(tools, "git"),
			`#!/bin/sh\nprintf '%s|%s|%s\\n' "\${AS_AGENT:-runner}" "$(pwd -P)" "$*" >> "$HOME/git-calls"\nif [ -n "\${FAIL_ORIGIN_FETCH_IN:-}" ] && [ "$(pwd -P)" = "$FAIL_ORIGIN_FETCH_IN" ] && [ "$*" = "fetch -q origin" ]; then\necho 'fatal: unable to access: Connection refused' >&2\nexit 128\nfi\nexec ${Bun.which("git")} "$@"\n`,
			{ mode: 0o755 },
		);
	});
	/** The host's layout: the session's clone no longer reaches GitHub, and the runner's push clone of o/r, under `push/`, does. */
	const onHost = (h: Host) => {
		git(h.clone, "config", "--unset", `url.${h.bare}.insteadOf`);
		const push = join(h.root, "push", "o", "r");
		mkdirSync(push, { recursive: true });
		git(push, "init", "-q");
		git(push, "remote", "add", "origin", "https://github.com/o/r.git");
		git(push, "config", `url.${h.bare}.insteadOf`, "https://github.com/o/r.git");
		return {
			push: realpathSync(push),
			env: { HARNESS_AS_AGENT: join(tools, "as-agent"), PASS_PUSH: join(h.root, "push") },
		};
	};
	const fix = (h: Host, script: string) => {
		writeFileSync(join(h.home, "claude-act"), `echo b > b.txt && git add b.txt && git commit -qm b\n${script}`);
		writeFileSync(join(h.home, "claude-out"), answer("fixed"));
	};
	/** The session's pre-PR run: a passing record of `HEAD` per step in its own user's ledger; printf repeats its format. */
	const recorded =
		'd="$HOME/.local/state/harness" && mkdir -p "$d" && c=$(git rev-parse HEAD) && p=$(pwd -P) && ' +
		'printf \'{"gate":"pre-pr","decision":"pass","rule":"%s","commit":"%s","project":"%s"}\\n\' diff-budget "$c" "$p" project-checks "$c" "$p" >> "$d/gates.jsonl"\n';
	const calls = (h: Host) =>
		readFileSync(join(h.home, "git-calls"), "utf8")
			.trim()
			.split("\n")
			.map((line) => line.split("|"));

	// spec: orchestrator/the-ci-flows-fix-push
	test("a fixed tip with a passing pre-PR record is pushed from the push clone, the App's fetch made there, every git in the session's clone run as its user", async () => {
		const h = host();
		const { push, env } = onHost(h);
		fix(h, recorded);
		const r = await deliver(h, payload(), { env, tools: `${free}:${tools}` });
		expect([r.code, r.line]).toEqual([0, expect.stringMatching(/; pushed feat\/x at [0-9a-f]{40}$/)]);
		expect(rev(h.bare, "refs/heads/feat/x^")).toBe(SHA);
		expect(readFileSync(join(h.home, "claude-argv"), "utf8")).toContain("pre-PR");
		const clone = [h.clone, realpathSync(h.clone)];
		const ran = calls(h);
		expect(
			ran.filter(([who, where, args]) => who === "runner" && clone.some((c) => where === c || args?.includes(c))),
		).toEqual([]);
		const github = ran.filter(([, , args]) => args?.includes("https://github.com/o/r.git"));
		expect(github.length).toBeGreaterThan(0);
		expect(github.filter(([who, where]) => who !== "runner" || where !== push)).toEqual([]);
		expect([rev(h.clone, "--abbrev-ref", "HEAD"), readdirSync(h.logs)]).toEqual(["main", []]);
	});

	// spec: orchestrator/a-ci-fix-with-no-pre-pr-record
	test("a fixed tip with no passing pre-PR record pushes nothing and exits 1, naming it", async () => {
		const h = host();
		const { env } = onHost(h);
		fix(h, "");
		const r = await deliver(h, payload(), { env, tools: `${free}:${tools}` });
		expect(r.code).toBe(1);
		expect(r.line).toMatch(/no passing pre-PR run record for [0-9a-f]{7}/);
		expect(rev(h.bare, "refs/heads/feat/x")).toBe(SHA);
	});

	// The carry's fetch of `origin` meeting the network is a `Transient`; the line names its reason, not the error object.
	test("a push clone whose origin cannot be reached pushes nothing and names why", async () => {
		const h = host();
		const { push, env } = onHost(h);
		fix(h, recorded);
		const r = await deliver(h, payload(), { env: { ...env, FAIL_ORIGIN_FETCH_IN: push }, tools: `${free}:${tools}` });
		expect(r.code).toBe(1);
		expect(r.line).toMatch(/; the push clone could not fetch origin; nothing was pushed$/);
		expect(rev(h.bare, "refs/heads/feat/x")).toBe(SHA);
	});

	// `runner` may not signal `agent`'s group, so a child the session left, holding the lock's descriptor, is ended as `agent`.
	test("a child the session left running is ended through the launcher, so the repository's lock is free once the flow exits", async () => {
		const h = host();
		const { env } = onHost(h);
		writeFileSync(join(h.home, "claude-act"), `sleep 30 >/dev/null 2>&1 &\necho $! > "$HOME/left-pid"\n`);
		const r = await deliver(h, payload(), { env, tools: `${free}:${tools}` });
		expect(r.code).toBe(0);
		const left = Number(readFileSync(join(h.home, "left-pid"), "utf8"));
		expect(ended(left)).toBe(true);
		expect(readFileSync(join(h.home, "as-agent-calls"), "utf8")).toMatch(
			/^\/ sh -c export LC_ALL=C; e=\$\(kill -\$0 "\$1" 2>&1 >\/dev\/null\) .* exit 4 TERM -\d+$/m,
		);
	}, 40_000);
});
