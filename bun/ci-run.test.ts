import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { lockOf } from "./ci-run.ts";
import {
	ATTEMPT,
	BLOCKED,
	BOT,
	type Comment,
	type Host,
	LIMIT,
	SHA,
	answer,
	api,
	bound,
	deliver,
	free,
	host,
	ignored,
	key,
	payload,
	real,
	rev,
	start,
	stop,
} from "./ci-run.fixture.ts";
import { cleanup, emptyDir, ended, git } from "./diff-budget.fixture.ts";

/**
 * The CI flow's decision on a pull request, run through the event handler as
 * the engine runs it, against a stand-in for GitHub's API
 * (`ci-run.fixture.ts`); the session's own cases are in
 * `ci-run-session.test.ts`. [n]: `ci-run-agent`'s `/zombies` items.
 */

afterAll(cleanup);
beforeAll(start);
afterAll(stop);

describe("the filter, from the payload alone", () => {
	// spec: orchestrator/a-run-that-did-not-fail
	test.each(["cancelled", "timed_out", "skipped", "success", "neutral", "action_required"])(
		"conclusion %s is ignored [35]",
		async (conclusion) => {
			const h = host();
			ignored(await deliver(h, payload({ conclusion })), /did not fail/);
			expect(api.posted).toEqual([]);
		},
	);

	test("an action other than completed is ignored", async () => {
		const h = host();
		ignored(await deliver(h, payload({}, { action: "requested" })), /did not fail/);
	});

	// spec: orchestrator/a-fork-an-unknown-repository-another-branch
	test.each(["feature/x", "feat"])("branch %s is ignored, naming the filter [36]", async (branch) => {
		const h = host();
		ignored(await deliver(h, payload({ head_branch: branch })), /neither feat\/ nor spec\//);
	});

	test.each(["feat/x", "spec/x"])("branch %s passes the filter [36]", async (branch) => {
		const h = host();
		const r = await deliver(h, payload({ head_branch: branch }));
		expect(r.line).not.toContain("neither feat/ nor spec/");
	});

	test("a fork's run is ignored [42]", async () => {
		const h = host();
		ignored(await deliver(h, payload({ head_repository: { full_name: "someone/r" } })), /fork/);
		expect(api.permissions).toBeUndefined();
	});

	test("a clone whose origin names another repository is ignored [43]", async () => {
		const h = host("https://github.com/o/other.git");
		ignored(await deliver(h, payload()), /no clone of o\/r/);
		expect(api.permissions).toBeUndefined();
	});
});

describe("the re-read under the lock", () => {
	// spec: orchestrator/a-pull-request-with-no-session
	test("no open pull request on the branch, none or one closed by now, is ignored naming it [29, 44]", async () => {
		const h = host();
		api.pulls = [];
		ignored(await deliver(h, payload()), /no open pull request on feat\/x/);
		expect(api.posted).toEqual([]);
	});

	test("a branch the table does not hold is ignored naming it", async () => {
		const h = host();
		ignored(await deliver(h, payload({ head_branch: "feat/y" })), /feat\/y/);
		expect(api.permissions).toBeUndefined();
	});

	// spec: orchestrator/a-pull-request-on-the-loops-branch-that-the-app-did-not-open
	test("a pull request someone else opened is ignored, printing its number [65]", async () => {
		const h = host();
		api.pulls[0].user.login = "laidrivm";
		ignored(await deliver(h, payload()), /#7/);
		expect(api.posted).toEqual([]);
	});

	// spec: orchestrator/a-stale-run
	test("a head that moved past the run's is stale", async () => {
		const h = host();
		api.pulls[0].head.sha = "b".repeat(40);
		ignored(await deliver(h, payload()), /stale/);
		expect(api.posted).toEqual([]);
	});

	// spec: orchestrator/a-newer-attempt-of-the-run
	test.each([null, "failure"])("a newer attempt still running or failed (%p) starts nothing [64]", async (conclusion) => {
		const h = host();
		api.latest = { run_attempt: 2, conclusion };
		ignored(await deliver(h, payload()), /attempt 2/);
		expect(api.posted).toEqual([]);
	});

	test("a tracked edit in the clone fails before any comment [51]", async () => {
		const h = host();
		writeFileSync(join(h.clone, "a.txt"), "edited\n");
		const r = await deliver(h, payload());
		expect([r.code, api.posted]).toEqual([1, []]);
		expect(r.line).toMatch(/^event: failed — .*tracked edit/);
	});
});

describe("the attempts", () => {
	const mark = (login: string, body: string): Comment => ({ user: { login }, body });
	const attempt = (n: number, sha: string, login = BOT) => mark(login, `${ATTEMPT} ${n}/3 — run at ${sha}`);

	// spec: orchestrator/the-first-three-failures
	test("the first failure posts attempt 1/3 naming the run and the head, minted for one repository [30, 39, 40]", async () => {
		const h = host();
		const r = await deliver(h, payload());
		expect([r.code, r.line]).toEqual([0, `event: handled — attempt 1/3 posted on #7; ${BLOCKED}`]);
		expect(api.posted).toEqual([`${ATTEMPT} 1/3 — https://github.com/o/r/actions/runs/5 at ${SHA}`]);
		expect(api.permissions).toEqual({ actions: "read", contents: "write", pull_requests: "write", workflows: "write" });
	});

	test("two earlier attempts on other heads make this one 3/3", async () => {
		const h = host();
		api.comments = [attempt(1, "1".repeat(40)), attempt(2, "2".repeat(40))];
		await deliver(h, payload());
		expect(api.posted[0]).toStartWith(`${ATTEMPT} 3/3 — `);
	});

	// spec: orchestrator/two-workflows-fail-on-one-commit
	test("a head that already has an attempt gets none [31]", async () => {
		const h = host();
		api.comments = [attempt(1, SHA)];
		ignored(await deliver(h, payload()), /already has an attempt/);
		expect(api.posted).toEqual([]);
	});

	test("a head that already has an attempt posts no limit after three [61]", async () => {
		const h = host();
		api.comments = [attempt(1, "1".repeat(40)), attempt(2, "2".repeat(40)), attempt(3, SHA)];
		ignored(await deliver(h, payload()), /already has an attempt/);
		expect(api.posted).toEqual([]);
	});

	// spec: orchestrator/the-fourth-failure
	test("three attempts on other heads post the limit [32]", async () => {
		const h = host();
		api.comments = [1, 2, 3].map((n) => attempt(n, String(n).repeat(40)));
		const r = await deliver(h, payload());
		expect(r.line).toBe(`event: handled — #7 used its 3 attempts: limit posted; ${BLOCKED}`);
		expect(api.posted).toHaveLength(1);
		expect(api.posted[0]).toStartWith(`${LIMIT} — `);
	});

	// spec: orchestrator/after-the-limit
	test("after the limit comment nothing is posted [33]", async () => {
		const h = host();
		api.comments = [mark(BOT, `${LIMIT} — done`)];
		ignored(await deliver(h, payload()), /limit/);
		expect(api.posted).toEqual([]);
	});

	test("a limit comment past the first hundred still stops the flow", async () => {
		const h = host();
		api.comments = [...Array.from({ length: 100 }, () => mark("laidrivm", "lgtm")), mark(BOT, `${LIMIT} — done`)];
		ignored(await deliver(h, payload()), /limit/);
		expect(api.posted).toEqual([]);
	});

	// spec: orchestrator/a-mark-someone-else-wrote
	test("marks anyone but the App posted count for nothing [45]", async () => {
		const h = host();
		api.comments = [attempt(1, SHA, "laidrivm"), attempt(2, "2".repeat(40), "laidrivm"), mark("laidrivm", `${LIMIT} — x`)];
		await deliver(h, payload());
		expect(api.posted).toEqual([`${ATTEMPT} 1/3 — https://github.com/o/r/actions/runs/5 at ${SHA}`]);
	});
});

describe("the delivery and the App's settings", () => {
	// spec: orchestrator/github-redelivers-a-handled-delivery
	test("a failure after the comment keeps the delivery, so a redelivery is a duplicate [17]", async () => {
		const h = host();
		api.failPost = true;
		const r = await deliver(h, payload());
		expect([r.code, r.held]).toEqual([1, "acted"]);
		api.failPost = false;
		const again = await deliver(h, payload(), { delivery: r.delivery });
		expect(again.line).toMatch(/^event: duplicate — /);
		expect(api.posted).toEqual([]);
	});

	test("no App settings refuses a routed event before it is recorded, exit 1 [18]", async () => {
		const h = host();
		const r = await deliver(h, payload(), { env: { HARNESS_GITHUB_APP_ID: "", HARNESS_GITHUB_APP_KEY: "" } });
		expect([r.code, r.held]).toEqual([1, undefined]);
		expect(r.line).toMatch(/^event: failed — .*App's settings/);
	});
});

describe("the repository's lock", () => {
	test("is the file pass.sh locks, its key run from pass.sh's own lines, one per pair [67]", () => {
		const state = process.env.PASS_STATE;
		process.env.PASS_STATE = "/state";
		// The two keys are kept in step by hand across bash and TS, so run pass.sh's own derivation.
		const sh = readFileSync(join(import.meta.dir, "../orchestrator/pass.sh"), "utf8").split("\n");
		const from = (start: string) => sh.findIndex((l) => l.startsWith(start));
		const derive = `${sh[from("part=")]}\n${sh.slice(from("url="), from("key=") + 1).join("\n")}\nprintf %s "$key"`;
		const keyOf = (origin: string) => Bun.spawnSync(["bash", "-c", derive], { env: { origin, dir: "x" } }).stdout.toString();
		try {
			for (const [origin, owner, repo] of [
				["https://github.com/Laid-Drivm/Harness.git", "Laid-Drivm", "Harness"],
				["git@github.com:laid/drivm-harness.git", "laid", "drivm-harness"],
			])
				expect(lockOf(owner, repo)).toBe(`/state/locks/${keyOf(origin)}.lock`);
			expect(lockOf("Laid-Drivm", "Harness")).not.toBe(lockOf("laid", "drivm-harness"));
		} finally {
			if (state === undefined) delete process.env.PASS_STATE;
			else process.env.PASS_STATE = state;
		}
	});

	// spec: orchestrator/a-pass-holds-the-repository
	test("its bound reached: exit 1, no comment, the delivery not kept [37]", async () => {
		const h = host();
		const r = await deliver(h, payload(), { tools: bound });
		expect([r.code, api.posted, api.permissions]).toEqual([1, [], undefined]);
		expect(r.held).not.toBe("acted");
	});

	// No `flock` on macOS: these run on Linux, and CI never skips them.
	const skip = !Bun.which("flock") && !process.env.CI;

	test.skipIf(skip)("a holder makes the flow wait, and it acts once the lock is free [34, 67]", async () => {
		const h = host();
		// The flow's own name for the file, so a change to the key reaches this case too.
		const lock = join(h.home, "orchestrator", "locks", basename(lockOf("o", "r")));
		mkdirSync(join(lock, ".."), { recursive: true });
		const holder = Bun.spawn(["flock", lock, "cat"], { stdin: "pipe" });
		// Held once a try without waiting fails, so the flow below cannot take it first.
		while (Bun.spawnSync(["flock", "-n", lock, "true"]).exitCode === 0) await Bun.sleep(50);
		const flow = deliver(h, payload(), { tools: real });
		await Bun.sleep(1_500);
		expect(api.posted).toEqual([]);
		holder.stdin.end();
		expect((await flow).line).toBe(`event: handled — attempt 1/3 posted on #7; ${BLOCKED}`);
	});

	// spec: orchestrator/two-workflows-fail-on-one-commit-at-once
	test.skipIf(skip)("two runs failing on one head at once post one attempt [34]", async () => {
		const h = host();
		const [a, b] = await Promise.all([
			deliver(h, payload(), { tools: real }),
			deliver(h, payload({ html_url: "https://github.com/o/r/actions/runs/6" }), { tools: real }),
		]);
		expect([a.line, b.line].filter((l) => l.startsWith("event: handled"))).toHaveLength(1);
		expect(api.posted).toHaveLength(1);
	});
});

describe("the scheduled and flaky routes", () => {
	const scheduled = (run: Record<string, unknown> = {}) => payload({ event: "schedule", head_branch: "main", name: "nightly", ...run });
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
		expect(r.line).toBe("event: handled — scheduled run https://github.com/o/r/actions/runs/5 failed on main; the session answered blocked");
		fresh(h);
		const argv = seen(h, "claude-argv");
		for (const named of ["harness.board", "nightly", "https://github.com/o/r/actions/runs/5", join(h.logs, "5-1.log")]) expect(argv).toContain(named);
		expect(seen(h, "claude-pwd").trim()).toBe(realpathSync(h.clone));
		expect([table(h), rev(h.clone, "HEAD"), status(h)]).toEqual([before, SHA, ""]);
		expect(seen(h, "gh-calls")).toBe("run view 5 -R o/r --attempt 1 --log-failed\n");
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
		writeFileSync(join(tools, "as-agent"), '#!/bin/sh\necho "$*" >> "$HOME/as-agent-calls"\ncd "$1" || exit 1\nshift\nexport AS_AGENT=agent\nexec "$@"\n', { mode: 0o755 });
		writeFileSync(
			join(tools, "git"),
			`#!/bin/sh\nprintf '%s|%s|%s\\n' "\${AS_AGENT:-runner}" "$(pwd -P)" "$*" >> "$HOME/git-calls"\nexec ${Bun.which("git")} "$@"\n`,
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
		return { push: realpathSync(push), env: { HARNESS_AS_AGENT: join(tools, "as-agent"), PASS_PUSH: join(h.root, "push") } };
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
		expect(ran.filter(([who, where, args]) => who === "runner" && clone.some((c) => where === c || args.includes(c)))).toEqual([]);
		const github = ran.filter(([, , args]) => args.includes("https://github.com/o/r.git"));
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

	// `runner` may not signal `agent`'s group, so a child the session left, holding the lock's descriptor, is ended as `agent`.
	test("a child the session left running is ended through the launcher, so the repository's lock is free once the flow exits", async () => {
		const h = host();
		const { env } = onHost(h);
		writeFileSync(join(h.home, "claude-act"), `sleep 30 >/dev/null 2>&1 &\necho $! > "$HOME/left-pid"\n`);
		const r = await deliver(h, payload(), { env, tools: `${free}:${tools}` });
		expect(r.code).toBe(0);
		const left = Number(readFileSync(join(h.home, "left-pid"), "utf8"));
		expect(ended(left)).toBe(true);
		expect(readFileSync(join(h.home, "as-agent-calls"), "utf8")).toMatch(/^\/ sh -c export LC_ALL=C; e=\$\(kill -\$0 "\$1" 2>&1 >\/dev\/null\) .* exit 4 TERM -\d+$/m);
	}, 40_000);
});
