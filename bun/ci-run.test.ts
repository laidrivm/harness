import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lockOf } from "./ci-run.ts";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { append } from "./pr-sessions.ts";

/**
 * The CI flow's decision on a pull request, run through the event handler as
 * the engine runs it, against a stand-in for GitHub's API. [n]:
 * `ci-run-agent`'s `/zombies` items.
 */

afterAll(cleanup);

const HANDLER = join(import.meta.dir, "on-event.ts");
const SECRET = "s3cret-of-the-webhook";
const SHA = "a".repeat(40);
const BOT = "loop-app[bot]";
const ATTEMPT = "`harness-ci-attempt`";
const LIMIT = "`harness-ci-limit`";

type Comment = { user: { login: string }; body: string };

/** What the stand-in answers, and what it was asked to post. */
let api: {
	latest: Record<string, unknown>;
	pulls: { number: number; user: { login: string }; head: { sha: string } }[];
	comments: Comment[];
	posted: string[];
	permissions: unknown;
	failPost: boolean;
};
let server: ReturnType<typeof Bun.serve>;
let key = "";
/** A `flock` that takes no lock and runs its command, and one that reports its bound reached. */
let free = "";
let bound = "";

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const { pathname } = new URL(req.url);
			const body = req.method === "POST" ? await req.json() : undefined;
			if (pathname === "/app") return Response.json({ slug: "loop-app" });
			if (pathname === "/repos/o/r/installation") return Response.json({ id: 9 });
			if (pathname === "/app/installations/9/access_tokens") {
				api.permissions = body.permissions;
				return Response.json({ token: "installation-token" });
			}
			if (pathname === "/repos/o/r/actions/runs/5") return Response.json(api.latest);
			if (pathname === "/repos/o/r/pulls") return Response.json(api.pulls);
			if (pathname === "/repos/o/r/issues/7/comments") {
				if (req.method === "GET") return Response.json(api.comments);
				if (api.failPost) return new Response("down", { status: 500 });
				// The next read sees it, as GitHub's does.
				api.comments.push({ user: { login: BOT }, body: body.body });
				api.posted.push(body.body);
				return Response.json({});
			}
			return new Response("unknown", { status: 404 });
		},
	});
	key = join(emptyDir("ci-run-key-"), "app.pem");
	const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
	writeFileSync(key, privateKey, { mode: 0o600 });
	free = emptyDir("ci-run-flock-");
	writeFileSync(join(free, "flock"), '#!/bin/sh\nshift 5\nexec "$@"\n', { mode: 0o755 });
	bound = emptyDir("ci-run-bound-");
	writeFileSync(join(bound, "flock"), "#!/bin/sh\nexit 75\n", { mode: 0o755 });
});
afterAll(() => server.stop(true));

/** A host with a secret, the App's settings, a clone of o/r and the table's line for `feat/x`. */
function host(origin = "https://github.com/o/r.git") {
	const root = emptyDir("ci-run-");
	const home = join(root, "home");
	const secrets = join(root, "secrets");
	mkdirSync(secrets);
	writeFileSync(join(secrets, "github_webhook_secret"), SECRET);
	const clone = join(root, "clone");
	mkdirSync(clone);
	git(clone, "init", "-q", "-b", "main");
	writeFileSync(join(clone, "a.txt"), "a\n");
	git(clone, "add", "a.txt");
	git(clone, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a");
	git(clone, "remote", "add", "origin", origin);
	for (const branch of ["feat/x", "spec/x"])
		append({ repo: "o/r", branch, session: randomUUID(), clone }, join(home, "orchestrator", "pr-sessions.jsonl"));
	api = {
		latest: { run_attempt: 1, conclusion: "failure" },
		pulls: [{ number: 7, user: { login: BOT }, head: { sha: SHA } }],
		comments: [],
		posted: [],
		permissions: undefined,
		failPost: false,
	};
	return { root, home, secrets, clone };
}

type Host = ReturnType<typeof host>;

/** A `workflow_run` delivery: a failed run of o/r on `feat/x`, with `run` merged over it. */
const payload = (run: Record<string, unknown> = {}, top: Record<string, unknown> = {}) =>
	JSON.stringify({
		action: "completed",
		repository: { full_name: "o/r", default_branch: "main" },
		workflow_run: {
			id: 5,
			conclusion: "failure",
			run_attempt: 1,
			head_sha: SHA,
			head_branch: "feat/x",
			event: "pull_request",
			html_url: "https://github.com/o/r/actions/runs/5",
			head_repository: { full_name: "o/r" },
			...run,
		},
		...top,
	});

/** Runs the handler on `body` with the App's settings, `flock` from `tools` first on PATH. */
async function deliver(h: Host, body: string, opts: { delivery?: string; env?: Record<string, string>; tools?: string } = {}) {
	const delivery = opts.delivery ?? randomUUID();
	const signature = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
	const p = Bun.spawn(["bun", HANDLER, `workflow_run ${delivery} ${signature}`], {
		stdin: new Blob([body]),
		stdout: "pipe",
		stderr: "pipe",
		env: {
			PATH: `${opts.tools ?? free}:${process.env.PATH}`,
			HOME: h.home,
			PASS_SECRETS: h.secrets,
			GITHUB_API_URL: server.url.origin,
			HARNESS_GITHUB_APP_ID: "1",
			HARNESS_GITHUB_APP_KEY: key,
			...opts.env,
		},
	});
	const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
	const marker = join(h.home, "orchestrator", "deliveries", delivery);
	let held: string | undefined;
	try {
		held = readFileSync(marker, "utf8");
	} catch {}
	return { line: out.trim(), code, delivery, held };
}

const ignored = (r: { line: string; code: number }, reason: RegExp) => {
	expect(r.line).toMatch(/^event: ignored — /);
	expect(r.line).toMatch(reason);
	expect(r.code).toBe(0);
};

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
		expect([r.code, r.line]).toEqual([0, "event: handled — attempt 1/3 posted on #7"]);
		expect(api.posted).toEqual([`${ATTEMPT} 1/3 — https://github.com/o/r/actions/runs/5 at ${SHA}`]);
		expect(api.permissions).toEqual({ actions: "read", contents: "write", pull_requests: "write" });
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
		expect(r.line).toBe("event: handled — #7 used its 3 attempts: limit posted");
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
	test("is the file pass.sh locks: <state>/locks/<owner>-<repo>.lock, lower-cased [67]", () => {
		const state = process.env.PASS_STATE;
		process.env.PASS_STATE = "/state";
		try {
			expect(lockOf("Laid", "Harness")).toBe("/state/locks/laid-harness.lock");
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
	const real = Bun.which("flock") ? join(Bun.which("flock") as string, "..") : "";

	test.skipIf(skip)("a holder makes the flow wait, and it acts once the lock is free [34, 67]", async () => {
		const h = host();
		const lock = join(h.home, "orchestrator", "locks", "o-r.lock");
		mkdirSync(join(lock, ".."), { recursive: true });
		const holder = Bun.spawn(["flock", lock, "cat"], { stdin: "pipe" });
		// Held once a try without waiting fails, so the flow below cannot take it first.
		while (Bun.spawnSync(["flock", "-n", lock, "true"]).exitCode === 0) await Bun.sleep(50);
		const flow = deliver(h, payload(), { tools: real });
		await Bun.sleep(1_500);
		expect(api.posted).toEqual([]);
		holder.stdin.end();
		expect((await flow).line).toBe("event: handled — attempt 1/3 posted on #7");
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
