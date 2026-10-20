import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { clone, out, records, runAsync, type Stubs } from "./board-loop.fixture.ts";

/**
 * The runner's push and pull request as the GitHub App, against a stand-in API
 * in this process, reached through `GITHUB_API_URL`, and a key made for the
 * run: no case reaches GitHub or holds a real key. [n]:
 * `github-app-identity`'s `/zombies` ideas.
 */

afterAll(cleanup);

const PUSH = "git push origin refs/heads/feat/demo:refs/heads/feat/demo";
const OPEN = "goal open: apply demo step 1 at abc1234 — no open or merged pull request for feat/demo";

/** A whole pass's limit: the default 5 s is overrun when several suites run at once. */
const LONG = 40_000;

/** The logged calls that start with `call`. */
const calls = (log: string, call: string) => log.split("\n").filter((line) => line.startsWith(call));

describe("the GitHub App", () => {
	const HTTPS = "https://github.com/o/demo.git";
	const TOKEN = "ghs_minted";
	const ANSWERS: Record<string, unknown> = {
		"/app": { slug: "demo-app" },
		"/users/demo-app[bot]": { id: 42 },
		"/repos/o/demo/installation": { id: 99 },
		"/app/installations/99/access_tokens": { token: TOKEN },
	};
	/** Each call the stand-in API saw, and the one path it answers with a 500. */
	let requests: string[] = [];
	let failing = "";
	let server: ReturnType<typeof Bun.serve>;
	let key = "";
	beforeAll(() => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				const path = decodeURIComponent(new URL(req.url).pathname);
				requests.push(`${req.method} ${path}`);
				return path === failing ? new Response("down", { status: 500 }) : Response.json(ANSWERS[path] ?? {});
			},
		});
		// A key made for the run, in a temporary directory of its own: never a real App's.
		key = join(emptyDir("board-loop-key-"), "app.pem");
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
		writeFileSync(key, privateKey, { mode: 0o600 });
		writeFileSync(`${key}.junk`, "SECRET-CONTENTS\n");
	});
	afterAll(() => server.stop(true));

	/** A clone whose `origin` is GitHub's URL for o/demo in `form`, which git rewrites to the bare origin. */
	const github = (form = HTTPS) => {
		const made = clone();
		git(made.dir, "remote", "set-url", "origin", form);
		for (const url of new Set([form, HTTPS])) git(made.dir, "config", "--add", `url.${made.origin}.insteadOf`, url);
		return made;
	};
	/** One pass with `env` beside the stand-in's URL, the API's log cleared first. */
	const pass = (dir: string, env: Record<string, string>, failed = "", stubs: Stubs = {}) => {
		[requests, failing] = [[], failed];
		return runAsync(dir, { commits: true, ...stubs }, { env: { GITHUB_API_URL: server.url.origin, ...env } });
	};
	const both = () => ({ HARNESS_GITHUB_APP_ID: "7", HARNESS_GITHUB_APP_KEY: key });

	// spec: board-loop/half-an-app board-loop/github-does-not-answer
	test.each([
		["the ID alone [44]", () => ({ HARNESS_GITHUB_APP_ID: "7" }), "HARNESS_GITHUB_APP_KEY is unset"],
		["the key alone [44]", () => ({ HARNESS_GITHUB_APP_KEY: key }), "HARNESS_GITHUB_APP_ID is unset"],
		["an empty ID [36]", () => ({ ...both(), HARNESS_GITHUB_APP_ID: "" }), "HARNESS_GITHUB_APP_ID is blank"],
		["a whitespace-only key path [37]", () => ({ ...both(), HARNESS_GITHUB_APP_KEY: "  " }), "HARNESS_GITHUB_APP_KEY is blank"],
		["a non-numeric ID [38]", () => ({ ...both(), HARNESS_GITHUB_APP_ID: "seven" }), "HARNESS_GITHUB_APP_ID is no number"],
		["a key that cannot be read [45]", () => ({ ...both(), HARNESS_GITHUB_APP_KEY: `${key}.missing` }), ".pem.missing, which holds"],
		["a key file holding no key [45]", () => ({ ...both(), HARNESS_GITHUB_APP_KEY: `${key}.junk` }), ".pem.junk, which holds"],
	])("%s refuses before any session or API call", async (_, env, reason) => {
		const r = await pass(github().dir, env());
		expect([r.calls.includes("claude "), requests]).toEqual([false, []]);
		expect(r.last).toStartWith("board-loop: refused — ");
		expect(r.last).toContain(reason);
		expect(r.text).not.toContain("SECRET");
	}, LONG);

	// spec: board-loop/half-an-app
	test("an origin that names no GitHub repository refuses, its URL unprinted", async () => {
		const { dir, origin } = clone();
		const url = "https://user:SECRET@gitlab.example/o/demo.git";
		git(dir, "remote", "set-url", "origin", url);
		git(dir, "config", `url.${origin}.insteadOf`, url);
		const r = await pass(dir, both());
		expect([r.calls.includes("claude "), requests]).toEqual([false, []]);
		expect(r.last).toBe("board-loop: refused — origin's URL names no GitHub repository");
		expect(r.text).not.toContain("SECRET");
	}, LONG);

	// spec: board-loop/github-does-not-answer
	test("a failing GET /app refuses before the pick session [46]", async () => {
		const r = await pass(github().dir, both(), "/app");
		expect([r.calls.includes("claude "), requests]).toEqual([false, ["GET /app"]]);
		expect(r.last).toStartWith("board-loop: refused — ");
		expect(r.last).toContain("/app");
	}, LONG);

	// spec: board-loop/github-does-not-answer
	test("a failed mint after the session pushes nothing and records open [47]", async () => {
		const r = await pass(github().dir, both(), "/app/installations/99/access_tokens");
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
		expect(r.last).toStartWith("board-loop: open — apply demo step 1: the App's token could not be minted");
		expect(records(r.state).map((x) => x.decision)).toEqual(["open"]);
	}, LONG);

	// spec: board-loop/a-step-not-ready
	test("a step not ready mints no token", async () => {
		const r = await pass(github().dir, both(), "", { beforePush: OPEN });
		expect(requests).toEqual(["GET /app", "GET /users/demo-app[bot]"]);
		expect(r.last).toBe(`board-loop: open — apply demo step 1: ${OPEN}`);
	}, LONG);

	// spec: board-loop/an-app-configured
	test("pushes and opens as the App, its token in no argument and no session [41][48–51]", async () => {
		const { dir, origin } = github();
		const r = await pass(dir, both());
		expect(requests.at(-1)).toBe("POST /app/installations/99/access_tokens");
		expect(calls(r.calls, "git push")).toEqual([`git push ${HTTPS} refs/heads/feat/demo:refs/heads/feat/demo`]);
		expect(out(origin, "rev-parse", "feat/demo")).toBe(out(dir, "rev-parse", "feat/demo"));
		expect([r.calls, r.text].some((text) => text.includes(TOKEN))).toBe(false);
		for (const which of ["pick", "stage"])
			expect(Object.values(r.env(which) ?? { none: TOKEN }).some((value) => value.includes(TOKEN))).toBe(false);
		const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`;
		const push = r.env("push") ?? {};
		expect([push.GIT_CONFIG_COUNT, push.GIT_CONFIG_KEY_0, push.GIT_CONFIG_VALUE_0]).toEqual(["1", "http.https://github.com/.extraheader", header]);
		expect([r.env("create")?.GH_TOKEN, r.env("check")?.GH_TOKEN]).toEqual([TOKEN, TOKEN]);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	}, LONG);

	// spec: board-loop/an-app-configured
	test("the session's commits are the bot's, author and committer [50]", async () => {
		const { dir } = github();
		const r = await pass(dir, both());
		const bot = "demo-app[bot] 42+demo-app[bot]@users.noreply.github.com";
		expect(out(dir, "log", "-1", "--format=%an %ae|%cn %ce", "feat/demo")).toBe(`${bot}|${bot}`);
		expect([r.env("pick")?.GIT_AUTHOR_NAME, r.env("stage")?.GIT_COMMITTER_EMAIL]).toEqual([
			"demo-app[bot]",
			"42+demo-app[bot]@users.noreply.github.com",
		]);
	}, LONG);

	// spec: board-loop/an-app-configured
	test.each(["git@github.com:o/demo.git", "ssh://git@github.com/o/demo.git"])(
		"an origin of %s is pushed to over HTTPS, with the header",
		async (form) => {
			const r = await pass(github(form).dir, both());
			expect(calls(r.calls, "git push")).toEqual([`git push ${HTTPS} refs/heads/feat/demo:refs/heads/feat/demo`]);
			expect(r.env("push")?.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
		},
		LONG,
	);

	// spec: board-loop/no-app
	test("with neither setting, no API call, no header, and the clone's own identity [52]", async () => {
		const { dir } = github();
		const r = await pass(dir, {});
		expect(requests).toEqual([]);
		expect(calls(r.calls, "git push")).toEqual([PUSH]);
		expect([r.env("push")?.GIT_CONFIG_COUNT, r.env("create")?.GH_TOKEN]).toEqual([undefined, undefined]);
		expect(out(dir, "log", "-1", "--format=%an", "feat/demo")).toBe("T");
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	}, LONG);
});
