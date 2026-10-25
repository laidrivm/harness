import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrivateKey, generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { configured, credentials, identity, jwt, mint, repository, request } from "./github-app.ts";
import { Transient } from "./transient.ts";

/**
 * The GitHub App's calls, against a stand-in API reached through
 * `GITHUB_API_URL`, with a PKCS#1 key made for the run: no case reaches
 * GitHub or holds a real key. [n]: `github-app-identity`'s `/zombies` ideas.
 */

const pair = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs1", format: "pem" },
	publicKeyEncoding: { type: "spki", format: "pem" },
});
const app = { id: "7", key: createPrivateKey(pair.privateKey), owner: "o", repo: "demo" };
/** The board loop's two, which `board-loop-push.ts` passes. */
const BOARD = { contents: "write", pull_requests: "write" } as const;

/** Each request the stand-in saw: its method, path, `Authorization` and body. */
let seen: { method: string; path: string; auth: string | null; body: string }[] = [];
let server: ReturnType<typeof Bun.serve>;
/** A path the stand-in answers OK with an empty object. */
let empty = "";
const api = process.env.GITHUB_API_URL;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const path = decodeURIComponent(new URL(req.url).pathname);
			seen.push({ method: req.method, path, auth: req.headers.get("authorization"), body: await req.text() });
			const answers: Record<string, unknown> = {
				"/app": { slug: "demo-app" },
				"/users/demo-app[bot]": { id: 42 },
				"/repos/o/demo/installation": { id: 99 },
				"/app/installations/99/access_tokens": { token: "ghs_minted" },
			};
			if (path === empty) return Response.json({});
			const status = /^\/status\/(\d+)$/.exec(path)?.[1];
			if (status) return new Response("no", { status: Number(status) });
			if (path === "/hang") return new Promise<Response>(() => {});
			return path in answers ? Response.json(answers[path]) : new Response("no", { status: 404 });
		},
	});
	process.env.GITHUB_API_URL = server.url.origin;
});

afterAll(() => {
	cleanup();
	server.stop(true);
	if (api === undefined) delete process.env.GITHUB_API_URL;
	else process.env.GITHUB_API_URL = api;
});

/** A JWT's three parts, the first two decoded. */
const parts = (token: string) => {
	const [head, body, signature] = token.split(".");
	const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
	return { head: decode(head), body: decode(body), data: `${head}.${body}`, signature };
};

describe("the JWT", () => {
	test("is RS256, verifies with the App's public key, and names iss, iat and exp [35]", () => {
		const { head, body, data, signature } = parts(jwt("7", app.key, 1_000_000));
		expect(verify("sha256", Buffer.from(data), pair.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
		expect([head.alg, body]).toEqual(["RS256", { iat: 1_000_000 - 60, exp: 1_000_000 + 540, iss: "7" }]);
	});
});

describe("the calls", () => {
	// spec: board-loop/an-app-configured
	test("the identity is the App's bot user, read from GET /app and GET /users [43]", async () => {
		seen = [];
		const as = await identity(app);
		expect(as).toEqual({
			GIT_AUTHOR_NAME: "demo-app[bot]",
			GIT_AUTHOR_EMAIL: "42+demo-app[bot]@users.noreply.github.com",
			GIT_COMMITTER_NAME: "demo-app[bot]",
			GIT_COMMITTER_EMAIL: "42+demo-app[bot]@users.noreply.github.com",
		});
		expect(seen.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /app", "GET /users/demo-app[bot]"]);
		expect(seen[0].auth).toStartWith("Bearer ");
	});

	// spec: board-loop/an-app-configured
	test("the installation is looked up for the repository with the JWT [42]", async () => {
		seen = [];
		await mint(app, BOARD);
		expect(seen.map((r) => `${r.method} ${r.path}`)).toEqual([
			"GET /repos/o/demo/installation",
			"POST /app/installations/99/access_tokens",
		]);
		expect(parts(seen[0].auth?.replace("Bearer ", "") ?? "").body.iss).toBe("7");
	});

	// spec: board-loop/an-app-configured
	test("the token names one repository and exactly contents and pull_requests at write [41]", async () => {
		seen = [];
		expect(await mint(app, BOARD)).toBe("ghs_minted");
		expect(JSON.parse(seen[1].body)).toEqual({
			repositories: ["demo"],
			permissions: { contents: "write", pull_requests: "write" },
		});
	});

	// spec: board-loop/github-does-not-answer
	test("an answer that is not OK rejects naming the path, never the key", async () => {
		const failed = await mint({ ...app, repo: "missing" }, BOARD).then(
			() => "",
			(e: Error) => e.message,
		);
		expect(failed).toContain("/repos/o/missing/installation");
		expect(failed).toContain("404");
		expect(failed).not.toContain("PRIVATE KEY");
	});

	// spec: board-loop/github-does-not-answer
	test("an OK answer missing its field rejects naming the path and the field", async () => {
		empty = "/app";
		const failed = await identity(app).then(
			() => "",
			(e: Error) => e.message,
		);
		empty = "";
		expect(failed).toBe("GitHub's API answered /app with no slug");
	});

	// spec: board-loop/github-does-not-answer
	test("an API that cannot be reached rejects naming the path", async () => {
		process.env.GITHUB_API_URL = "http://127.0.0.1:1";
		const failed = await mint(app, BOARD).then(
			() => "",
			(e: Error) => e.message,
		);
		process.env.GITHUB_API_URL = server.url.origin;
		expect(failed).toStartWith("GitHub's API could not be reached for /repos/o/demo/installation: ");
	});

	/** What `request()` throws for `path`, with a short limit. */
	const thrown = (path: string) => request(path, undefined, undefined, 200).then(() => undefined, (e: Error) => e);

	test.each(["/status/502", "/status/503", "/status/429", "/hang"])("%p throws a Transient, its message as before", async (path) => {
		const error = await thrown(path);
		expect(error).toBeInstanceOf(Transient);
		expect(error?.message).toStartWith(path === "/hang" ? "GitHub's API could not be reached for /hang: " : `GitHub's API answered ${path} with `);
	});

	test("an unreachable API throws a Transient", async () => {
		process.env.GITHUB_API_URL = "http://127.0.0.1:1";
		const error = await thrown("/app");
		process.env.GITHUB_API_URL = server.url.origin;
		expect(error).toBeInstanceOf(Transient);
	});

	test.each([
		["a 401", undefined, "/status/401"],
		["a malformed base URL", "not a url", "/app"],
	])("%s throws a plain Error", async (_, base, path) => {
		process.env.GITHUB_API_URL = base ?? server.url.origin;
		const error = await thrown(path);
		process.env.GITHUB_API_URL = server.url.origin;
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(Transient);
	});

	test("the push's credentials carry the token as git's extra header and as GH_TOKEN", () => {
		expect(credentials("ghs_t", 0)).toEqual({
			GH_TOKEN: "ghs_t",
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
			GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from("x-access-token:ghs_t").toString("base64")}`,
		});
	});

	test("the credentials append after the GIT_CONFIG_COUNT the runner was started with", () => {
		const header = credentials("ghs_t", 2);
		expect([header.GIT_CONFIG_COUNT, header.GIT_CONFIG_KEY_2]).toEqual(["3", "http.https://github.com/.extraheader"]);
		expect(header.GIT_CONFIG_KEY_0).toBeUndefined();
	});
});

describe("the key holder's mint command", () => {
	/** A mint command that logs its arguments and prints `out`, exiting `code`. */
	const command = (out: string, code = 0) => {
		const dir = emptyDir("github-app-mint-");
		const file = join(dir, "mint");
		writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${dir}/calls'\nprintf '%s' '${out}'\nexit ${code}\n`);
		chmodSync(file, 0o755);
		return { mint: `${file} --as keyholder`, calls: () => readFileSync(join(dir, "calls"), "utf8").trim().split("\n") };
	};
	const env = (mint: string) => ({ HARNESS_GITHUB_APP_ID: "7", HARNESS_GITHUB_APP_MINT: mint });

	test("the App's id and the mint command configure the App, with no key read", () => {
		const made = command("ghs_minted");
		expect(configured(env(made.mint), "https://github.com/o/demo.git")).toEqual({ id: "7", mint: made.mint, owner: "o", repo: "demo" });
	});

	// spec: orchestrator/the-runner-asks-the-key-holder
	test("mint() runs the command for the one repository and its permissions, the token on stdout alone", async () => {
		const made = command("ghs_minted\n");
		const app = configured(env(made.mint), "git@github.com:o/demo.git") as NonNullable<ReturnType<typeof configured>>;
		seen = [];
		expect(await mint(app, BOARD)).toBe("ghs_minted");
		const { calls } = made;
		expect(calls()).toEqual(["--as keyholder o/demo contents=write pull_requests=write"]);
		expect(seen).toEqual([]);
	});

	// spec: orchestrator/the-runner-asks-the-key-holder
	test("the App's slug is the command's --slug answer", async () => {
		const made = command("demo-app");
		const app = configured(env(made.mint), "https://github.com/o/demo") as NonNullable<ReturnType<typeof configured>>;
		expect(await identity(app)).toMatchObject({ GIT_AUTHOR_NAME: "demo-app[bot]" });
		expect(made.calls()).toEqual(["--as keyholder o/demo --slug"]);
	});

	test("a command that fails rejects naming its status, and one that prints nothing rejects too", async () => {
		for (const [out, code] of [["", 0], ["denied", 3]] as const) {
			const app = configured(env(command(out, code).mint), "https://github.com/o/demo") as NonNullable<ReturnType<typeof configured>>;
			const failed = await mint(app, BOARD).then(() => "", (e: Error) => e.message);
			expect(failed).toContain(`exited ${code}`);
		}
	});
});

describe("the settings", () => {
	// spec: board-loop/half-an-app
	test("an ID with whitespace around it is no number, never trimmed", () => {
		const env = { HARNESS_GITHUB_APP_ID: " 7", HARNESS_GITHUB_APP_KEY: "/unread" };
		expect(() => configured(env, "https://github.com/o/demo.git")).toThrow("HARNESS_GITHUB_APP_ID is no number");
	});
});

describe("origin's URL", () => {
	// spec: board-loop/an-app-configured
	test.each([
		["https://github.com/o/demo.git", "HTTPS"],
		["https://github.com/o/demo", "HTTPS with no .git"],
		["git@github.com:o/demo.git", "SSH"],
		["ssh://git@github.com/o/demo.git", "ssh://"],
	])("%s (%s) names o/demo [39]", (url) => {
		expect(repository(url)).toEqual({ owner: "o", repo: "demo" });
	});

	// spec: board-loop/half-an-app
	test.each([
		["https://gitlab.com/o/demo.git", "another host"],
		["https://github.com.evil.example/o/demo.git", "a host that only starts the same"],
		["https://github.com/o/demo/extra.git", "an extra segment"],
		["https://github.com/demo.git", "no owner"],
		["https://github.com/o/...git", "a dot path for a name"],
		["/srv/git/demo.git", "a local path"],
		["", "nothing"],
	])("%s (%s) is refused [40]", (url) => {
		expect(repository(url)).toBeUndefined();
	});
});
