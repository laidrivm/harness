import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { lockOf } from "./ci-run.ts";
import {
	ATTEMPT,
	BLOCKED,
	BOT,
	type Comment,
	LIMIT,
	SHA,
	api,
	bound,
	deliver,
	host,
	ignored,
	payload,
	real,
	start,
	stop,
} from "./ci-run.fixture.ts";
import { cleanup } from "./diff-budget.fixture.ts";

/**
 * The CI flow's decision on a pull request, run through the event handler as
 * the engine runs it, against a stand-in for GitHub's API
 * (`ci-run.fixture.ts`); the session's own cases are in
 * `ci-run-session.test.ts`, the scheduled routes and the host's in
 * `ci-run-routes.test.ts`. [n]: `ci-run-agent`'s `/zombies` items.
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
