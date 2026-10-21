/**
 * The sweep's selection, its exit statuses and its marked heads. The
 * judgement of one head is in `pr-sweep-judge.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import {
	commit,
	compare,
	green,
	LIST,
	LOGIN,
	listing,
	mark,
	marks,
	pkg,
	pull,
	run,
	sha,
	status,
	sweep,
	sweepAsync,
} from "./pr-sweep.fixture.ts";

afterAll(cleanup);

const SWEPT = status("harness/sweep", "SUCCESS");
const statuses = (n: number, description: string) => ({
	[marks(n)]: { out: { statuses: [{ context: "harness/sweep", description }] } },
});

describe("which pull requests are judged", () => {
	// spec: pr-sweep/a-clean-run
	test("no open pull request prints nothing and exits 0 [1]", () => {
		const r = sweep(listing([]));
		expect([r.code, r.out]).toEqual([0, ""]);
	});

	// spec: pr-sweep/another-branch-another-author-or-a-fork
	test.each([
		["fix/x", {}],
		["feat", {}],
		["feature/x", {}],
		["FEAT/x", {}],
		["feat/x", { author: { login: "someone" } }],
		["feat/x", { author: { login: "app/demo-agent", is_bot: true } }],
		["feat/x", { author: { login: "demo-agent" } }],
		["feat/x", { author: { login: "demo-agent[bot]" } }],
		["feat/x", { isCrossRepository: true }],
	])("%s %j gets the listing alone and no line [2, 10, 14, 45]", (headRefName, over) => {
		const r = sweep(listing([pull(1, { headRefName, ...over })]));
		expect([r.code, r.out, r.calls]).toEqual([0, "", [LOGIN, LIST]]);
	});

	// spec: pr-sweep/an-agent-branch-by-an-allowed-author
	test("a spec/ branch by the credential's login is judged [10]", () => {
		const r = sweep(listing([pull(1, { headRefName: "spec/x" })], green(1)));
		expect(r.lines.map((l) => l.outcome)).toEqual(["marked"]);
	});

	// spec: pr-sweep/a-draft
	test("a draft reads skipped, with no status [45]", () => {
		const r = sweep(listing([pull(1, { isDraft: true })]));
		expect(r.lines).toEqual([{ repo: "o/r", pr: 1, branch: "feat/demo-1", sha: sha(1), outcome: "skipped", reason: "draft", handoffs: [] }]);
		expect(r.calls).toEqual([LOGIN, LIST]);
	});

	// spec: pr-sweep/no-app
	test("with no App, no token is minted and the bot is no author [46]", () => {
		const bot = pull(1, { author: { login: "app/demo-agent", is_bot: true } });
		const r = sweep(listing([bot]));
		expect(r.calls).toEqual([LOGIN, LIST]);
	});
});

describe("a marked head", () => {
	// spec: pr-sweep/a-marked-head-with-nothing-new
	test.each([
		["SUCCESS", "a green head"],
		["PENDING", "a mark in a state other than success [15]"],
	])("%s: %s with nothing new reads skipped, reads no drift and no description [45]", (state) => {
		const rollup = [run("test", "SUCCESS"), status("harness/sweep", state)];
		const r = sweep(listing([pull(1, { statusCheckRollup: rollup })], { [compare("main", sha(1))]: { out: { behind_by: 0 } } }));
		expect(r.lines.map((l) => [l.outcome, l.reason])).toEqual([["skipped", "marked"]]);
		expect(r.calls).toEqual([LOGIN, LIST, compare("main", sha(1))]);
	});

	// spec: pr-sweep/the-base-moves-after-the-mark
	test("a base that moved reads updated", () => {
		const r = sweep(
			listing([pull(1, { statusCheckRollup: [run("test", "SUCCESS"), SWEPT] })], {
				[compare("main", sha(1))]: { out: { behind_by: 2 } },
				"pr update-branch 1 --repo o/r": {},
			}),
		);
		expect(r.lines.map((l) => l.outcome)).toEqual(["updated"]);
	});

	// spec: pr-sweep/ci-turns-red-after-the-mark
	test("a check red under a mark without ci hands off ci once, beside the kinds marked before (review of PR 182)", () => {
		const red = pull(1, { statusCheckRollup: [run("test", "FAILURE"), SWEPT] });
		const table = listing([red], {
			[compare("main", sha(1))]: { out: { behind_by: 0 } },
			...statuses(1, "handed off: description"),
			[mark(1, "handed off: description, ci")]: {},
		});
		const r = sweep(table);
		expect(r.lines[0].handoffs).toEqual([{ kind: "ci", to: "ciflow", detail: ["CI / test"] }]);
		expect(r.calls).toContain(mark(1, "handed off: description, ci"));
		expect(r.calls).not.toContain(pkg(1));
		expect(r.calls).not.toContain(commit(1));
		const after = sweep({ ...table, ...statuses(1, "handed off: description, ci") });
		expect(after.lines.map((l) => [l.outcome, l.reason])).toEqual([["skipped", "marked"]]);
	});

	// spec: pr-sweep/a-push-after-the-mark
	test("a marked head reads no status description with nothing to hand off; a new head is judged in full", () => {
		const r = sweep(listing([pull(1, { statusCheckRollup: [run("test", "SUCCESS"), SWEPT] })], green(1)));
		expect(r.calls).not.toContain(marks(1));
		const fresh = sweep(listing([pull(2)], green(2)));
		expect(fresh.lines[0].handoffs.map((h: { kind: string }) => h.kind)).toEqual(["description"]);
	});
});

describe("the argument and the exit status", () => {
	// spec: pr-sweep/a-bad-argument
	test.each([[""], ["o/r/x"], ["o/.."], ["o/."], ["o r"], ["o/r\n"], ["-o/r"], [`${"a".repeat(40)}/r`]])(
		"%j exits 2 with no gh run [12]",
		(arg) => {
			const r = sweep(listing([]), [arg]);
			expect([r.code, r.calls]).toEqual([2, []]);
		},
	);

	test("a failed gh api user exits 1 before the listing [29]", () => {
		const r = sweep({ [LOGIN]: { code: 1, err: "HTTP 401" } });
		expect([r.code, r.calls]).toEqual([1, [LOGIN]]);
	});

	test.each([
		["fails", { code: 1 }, {}],
		["times out", { sleep: 30 }, { HARNESS_GH_TIMEOUT_MS: "300" }],
	])("a listing that %s exits 1 [22, 31]", (_, answer, env) => {
		const r = sweep({ [LOGIN]: { out: "laidrivm" }, [LIST]: answer }, ["o/r"], env);
		expect([r.code, r.out]).toEqual([1, ""]);
	});

	// spec: pr-sweep/one-pull-request-fails
	test("a failed line and a marked one print in listing order and exit 1 [4]", () => {
		const table = listing([pull(1), pull(2)], {
			[compare("main", sha(1))]: { code: 1, err: "HTTP 500" },
			...green(2),
		});
		const r = sweep(table);
		expect(r.lines.map((l) => [l.pr, l.outcome])).toEqual([
			[1, "failed"],
			[2, "marked"],
		]);
		expect(r.code).toBe(1);
	});
});

/**
 * The App, against a stand-in API in this process reached through
 * `GITHUB_API_URL`, and a key made for the run: no case reaches GitHub or
 * holds a real key.
 */
describe("the GitHub App", () => {
	const TOKEN = "ghs_minted";
	const BOT = { login: "app/demo-agent", is_bot: true };
	const ANSWERS: Record<string, unknown> = {
		"/app": { slug: "demo-agent" },
		"/repos/o/r/installation": { id: 99 },
		"/app/installations/99/access_tokens": { token: TOKEN },
	};
	/** Each request the stand-in saw, and the one path it answers with a 500. */
	let requests: { call: string; body: string }[] = [];
	let failing = "";
	let server: ReturnType<typeof Bun.serve>;
	let key = "";
	beforeAll(() => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const path = new URL(req.url).pathname;
				requests.push({ call: `${req.method} ${path}`, body: await req.text() });
				return path === failing ? new Response("down", { status: 500 }) : Response.json(ANSWERS[path] ?? {});
			},
		});
		key = join(emptyDir("pr-sweep-key-"), "app.pem");
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
		writeFileSync(key, privateKey, { mode: 0o600 });
	});
	afterAll(() => server.stop(true));

	const both = () => ({ HARNESS_GITHUB_APP_ID: "7", HARNESS_GITHUB_APP_KEY: key });
	/** One sweep with `env` beside the stand-in's URL, its log cleared first. */
	const run = (table: Record<string, object>, env: Record<string, string>, failed = "") => {
		[requests, failing] = [[], failed];
		return sweepAsync(table, { GITHUB_API_URL: server.url.origin, ...env });
	};

	// spec: pr-sweep/one-setting-alone
	test.each([
		["the ID alone [13]", () => ({ HARNESS_GITHUB_APP_ID: "7" }), "HARNESS_GITHUB_APP_KEY is unset"],
		["the key alone [13]", () => ({ HARNESS_GITHUB_APP_KEY: key }), "HARNESS_GITHUB_APP_ID is unset"],
		["an empty ID [32]", () => ({ ...both(), HARNESS_GITHUB_APP_ID: "" }), "HARNESS_GITHUB_APP_ID is blank"],
		["a whitespace-only key path [32]", () => ({ ...both(), HARNESS_GITHUB_APP_KEY: " " }), "HARNESS_GITHUB_APP_KEY is blank"],
	])("%s exits 1 naming it, and lists nothing", async (_, env, reason) => {
		const r = await run(listing([pull(1)], green(1)), env());
		expect([r.code, r.out, r.calls, requests]).toEqual([1, "", [], []]);
		expect(r.err).toContain(reason);
	});

	test("a failed mint exits 1 and lists nothing [33]", async () => {
		const r = await run(listing([pull(1)], green(1)), both(), "/repos/o/r/installation");
		expect([r.code, r.out, r.calls]).toEqual([1, "", [LOGIN]]);
		expect(r.err).toContain("/repos/o/r/installation");
	});

	// spec: pr-sweep/the-app-configured
	test("the token names the swept repository alone, with the sweep's four permissions [47]", async () => {
		await run(listing([]), both());
		const asked = requests.find((q) => q.call === "POST /app/installations/99/access_tokens");
		expect(JSON.parse(asked?.body ?? "{}")).toEqual({
			repositories: ["r"],
			permissions: { contents: "write", pull_requests: "write", statuses: "write", checks: "read" },
		});
	});

	// spec: pr-sweep/the-app-configured
	test("the login is read with no token; every later gh call gets it through GH_TOKEN, never an argument [48, 34]", async () => {
		const r = await run(listing([pull(1)], green(1)), both());
		expect(r.lines.map((l) => l.outcome)).toEqual(["marked"]);
		expect(r.calls.length).toBeGreaterThan(2);
		expect(r.calls[0]).toBe(LOGIN);
		expect(r.tokens).toEqual(["", ...r.calls.slice(1).map(() => TOKEN)]);
		expect(r.calls.filter((c) => c.includes(TOKEN))).toEqual([]);
	});

	// spec: pr-sweep/an-agent-branch-by-an-allowed-author
	test("the App's app/<slug> bot is an allowed author beside the credential's login, and not without is_bot [46]", async () => {
		const human = pull(3, { author: { login: "app/demo-agent", is_bot: false } });
		const r = await run(listing([pull(1, { author: BOT }), pull(2), human], { ...green(1), ...green(2) }), both());
		expect(r.lines.map((l) => [l.pr, l.outcome])).toEqual([
			[1, "marked"],
			[2, "marked"],
		]);
	});

	test("a login that cannot be read leaves the App the one allowed author", async () => {
		const table = { ...listing([pull(1, { author: BOT }), pull(2)], green(1)), [LOGIN]: { code: 1, err: "HTTP 401" } };
		const r = await run(table, both());
		expect([r.code, r.lines.map((l) => l.pr)]).toEqual([0, [1]]);
	});
});
