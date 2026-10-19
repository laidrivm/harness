import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { change, clone, commit, lowered, out, records, run, runAsync, TICKED } from "./board-loop.fixture.ts";

/**
 * The runner's push and pull request after the stage session, and what keeps
 * them from happening. [n]: `github-app-identity`'s `/zombies` ideas.
 */

afterAll(cleanup);

const PUSH = "git push origin refs/heads/feat/demo:refs/heads/feat/demo";
const CREATE = "gh pr create --base main --head feat/demo --title Carry demo --body-file -";
const OPEN = "goal open: apply demo step 1 at abc1234 — no open or merged pull request for feat/demo";

/** The logged calls that start with `call`. */
const calls = (log: string, call: string) => log.split("\n").filter((line) => line.startsWith(call));

/** A `kill` whose signal 0 fails with EPERM for the second group it sees, the stage session's. */
const STAGE_EPERM = `(() => { const seen = []; return (pid, signal) => { if (!seen.includes(pid)) seen.push(pid); if (signal === 0 && seen.indexOf(pid) === 1) throw Object.assign(new Error("EPERM"), { code: "EPERM" }); process.kill(pid, signal); }; })()`;

describe("a step ready to push", () => {
	// spec: board-loop/a-step-ready-to-push
	test("one push of exactly the step's ref, no force, then one pull request, then the full check [17][18]", () => {
		const { dir, origin } = clone();
		const r = run(dir);
		expect(calls(r.calls, "git push")).toEqual([PUSH]);
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE]);
		const lines = r.calls.split("\n");
		const [push, create, verdict] = [
			lines.indexOf(PUSH),
			lines.indexOf(CREATE),
			lines.findIndex((line) => line.endsWith("goal-check.ts apply demo 1")),
		];
		expect(lines.findIndex((line) => line.endsWith("goal-check.ts apply demo 1 --before-push"))).toBeLessThan(push);
		expect([push < create, create < verdict]).toEqual([true, true]);
		expect(r.body).toBe("The body.");
		expect(out(origin, "rev-parse", "feat/demo")).toBe(out(dir, "rev-parse", "feat/demo"));
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	// spec: board-loop/a-step-ready-to-push
	test("the session's final message is printed after it [19]", () => {
		const { dir } = clone();
		expect(run(dir).text).toContain("Done.\nPR-TITLE: Carry demo\nPR-BODY:\nThe body.");
	});

	// spec: board-loop/a-step-ready-to-push
	test("a body of several lines reaches gh whole", () => {
		const { dir } = clone();
		const said = "PR-TITLE: Carry demo\nPR-BODY:\nFirst.\n\n- second\n--third";
		expect(run(dir, [], { said }).body).toBe("First.\n\n- second\n--third");
	});

	// spec: board-loop/a-step-ready-to-push
	test("an answer step pushes and opens feat/demo-2", () => {
		const { dir } = clone(change("demo", TICKED));
		const r = run(dir);
		expect(calls(r.calls, "git push")).toEqual(["git push origin refs/heads/feat/demo-2:refs/heads/feat/demo-2"]);
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE.replace("feat/demo", "feat/demo-2")]);
	});

	// spec: board-loop/a-step-ready-to-push
	test("a trailing CR is dropped from the title [20]", () => {
		const { dir } = clone();
		const r = run(dir, [], { said: "PR-TITLE: Carry demo\r\nPR-BODY:\nThe body." });
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE]);
	});

	// spec: board-loop/a-step-ready-to-push
	test("a branch on origin a session left is pushed fast-forward [34]", () => {
		const { dir, origin } = clone();
		git(dir, "push", "-q", "origin", "main:refs/heads/feat/demo");
		const r = run(dir, [], { commits: true });
		expect(r.calls).toContain("A session left the branch feat/demo");
		expect(calls(r.calls, "git push")).toEqual([PUSH]);
		expect(out(origin, "rev-parse", "feat/demo")).toBe(out(dir, "rev-parse", "feat/demo"));
		expect(out(origin, "rev-parse", "feat/demo~1")).toBe(out(origin, "rev-parse", "main"));
	});
});

describe("a step not ready", () => {
	// spec: board-loop/a-step-not-ready
	test.each([
		["the before-push check reads open [21]", { beforePush: OPEN }, undefined, `board-loop: open — apply demo step 1: ${OPEN}`],
		["HEAD is off the step's branch [22]", { branch: "feat/other" }, undefined, "HEAD is on feat/other, not feat/demo"],
		["the session ran past the limit [26]", { sleep: 30 }, () => lowered(1000), "board-loop: timeout — apply demo step 1"],
		["its group outlived it [27]", {}, () => lowered(60_000, STAGE_EPERM), "outlived apply demo step 1"],
		["a tampered pin cannot make the before-push run read met [28]", { beforePush: OPEN, tamper: true }, undefined, OPEN],
	] as const)("%s: nothing is pushed or opened", (_, stubs, entry, line) => {
		const { dir, origin } = clone();
		const r = run(dir, [], stubs, { entry: entry?.() });
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
		expect(out(origin, "branch", "--list", "feat/*")).toBe("");
		expect(r.last).toContain(line);
	}, 40_000);
});

describe("no title or body", () => {
	// spec: board-loop/no-title-or-body
	test.each([
		["no title [29]", "Done.", "not one PR-TITLE: line"],
		["two titles [29]", "PR-TITLE: a\nPR-TITLE: b\nPR-BODY:\nx", "not one PR-TITLE: line"],
		["a title inside the body [30]", "PR-TITLE: a\nPR-BODY:\nx\nPR-TITLE: b", "not one PR-TITLE: line"],
		["no body line [29]", "PR-TITLE: a", "not one PR-BODY: line"],
		["the body line first [31]", "PR-BODY:\nx\nPR-TITLE: a", "PR-BODY: comes before PR-TITLE:"],
		["a blank title [32]", "PR-TITLE:   \nPR-BODY:\nx", "the PR-TITLE: line is empty"],
		["an empty body [33]", "PR-TITLE: a\nPR-BODY:\n  ", "nothing follows PR-BODY:"],
	])("%s: no push, no pull request, and open naming it", (_, said, reason) => {
		const { dir } = clone();
		const r = run(dir, [], { said });
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
		expect(r.last).toStartWith("board-loop: open — apply demo step 1: ");
		expect(r.last).toContain(reason);
		expect(records(r.state).map((x) => x.decision)).toEqual(["open"]);
	});
});

describe("the push or the pull request fails", () => {
	// spec: board-loop/the-push-is-refused
	test("a refused push is neither retried nor forced, opens nothing, and is open with its error [23]", () => {
		const { dir, origin } = clone();
		const other = emptyDir("board-loop-other-");
		git(other, "clone", "-q", origin, ".");
		git(other, "switch", "-qc", "feat/demo");
		commit(other);
		git(other, "push", "-q", "origin", "feat/demo");
		git(dir, "branch", "feat/demo");
		git(dir, "switch", "-q", "feat/demo");
		commit(dir);
		git(dir, "switch", "-q", "main");
		const theirs = out(origin, "rev-parse", "feat/demo");
		const r = run(dir);
		expect(calls(r.calls, "git push")).toEqual([PUSH]);
		expect(calls(r.calls, "gh pr create")).toEqual([]);
		expect(r.text).toContain("[rejected]");
		expect(r.last).toBe("board-loop: open — apply demo step 1: origin refused the push of feat/demo, as printed above");
		expect(out(origin, "rev-parse", "feat/demo")).toBe(theirs);
	});

	// spec: board-loop/the-pull-request-already-exists
	test("a create that fails while a pull request at HEAD exists ends on the full check's met", () => {
		const { dir } = clone();
		const r = run(dir, [], { createCode: 1 });
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE]);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	// spec: board-loop/the-pull-request-already-exists
	test("any other create failure ends open", () => {
		const { dir } = clone();
		const r = run(dir, [], { createCode: 1, verdict: OPEN });
		expect(r.last).toBe(`board-loop: open — apply demo step 1: ${OPEN}`);
	});
});

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
	const pass = (dir: string, env: Record<string, string>, failed = "") => {
		[requests, failing] = [[], failed];
		return runAsync(dir, { commits: true }, { env: { GITHUB_API_URL: server.url.origin, ...env } });
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
		["a key file holding no key [45]", () => {
			writeFileSync(`${key}.junk`, "SECRET-CONTENTS\n");
			return { ...both(), HARNESS_GITHUB_APP_KEY: `${key}.junk` };
		}, ".pem.junk, which holds"],
	])("%s refuses before any session or API call", async (_, env, reason) => {
		const r = await pass(github().dir, env());
		expect([r.calls.includes("claude "), requests]).toEqual([false, []]);
		expect(r.last).toStartWith("board-loop: refused — ");
		expect(r.last).toContain(reason);
		expect(r.text).not.toContain("SECRET");
	});

	// spec: board-loop/half-an-app
	test("an origin that names no GitHub repository refuses, its URL unprinted", async () => {
		const { dir } = clone();
		git(dir, "remote", "set-url", "origin", "https://user:SECRET@gitlab.example/o/demo.git");
		const r = await pass(dir, both());
		expect([r.calls.includes("claude "), requests]).toEqual([false, []]);
		expect(r.last).toBe("board-loop: refused — origin's URL names no GitHub repository");
		expect(r.text).not.toContain("SECRET");
	});

	// spec: board-loop/github-does-not-answer
	test("a failing GET /app refuses before the pick session [46]", async () => {
		const r = await pass(github().dir, both(), "/app");
		expect([r.calls.includes("claude "), requests]).toEqual([false, ["GET /app"]]);
		expect(r.last).toStartWith("board-loop: refused — ");
		expect(r.last).toContain("/app");
	});

	// spec: board-loop/github-does-not-answer
	test("a failed mint after the session pushes nothing and records open [47]", async () => {
		const r = await pass(github().dir, both(), "/app/installations/99/access_tokens");
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
		expect(r.last).toStartWith("board-loop: open — apply demo step 1: the App's token could not be minted");
		expect(records(r.state).map((x) => x.decision)).toEqual(["open"]);
	});

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
	});

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
	});

	// spec: board-loop/an-app-configured
	test.each(["git@github.com:o/demo.git", "ssh://git@github.com/o/demo.git"])(
		"an origin of %s is pushed to over HTTPS, with the header",
		async (form) => {
			const r = await pass(github(form).dir, both());
			expect(calls(r.calls, "git push")).toEqual([`git push ${HTTPS} refs/heads/feat/demo:refs/heads/feat/demo`]);
			expect(r.env("push")?.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
		},
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
	});
});
