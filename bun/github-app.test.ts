import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPrivateKey, generateKeyPairSync, verify } from "node:crypto";
import { configured, credentials, identity, jwt, mint, repository } from "./github-app.ts";

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
			return path in answers ? Response.json(answers[path]) : new Response("no", { status: 404 });
		},
	});
	process.env.GITHUB_API_URL = server.url.origin;
});

afterAll(() => {
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

	test("the push's credentials carry the token as git's extra header and as GH_TOKEN", () => {
		expect(credentials("ghs_t")).toEqual({
			GH_TOKEN: "ghs_t",
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
			GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from("x-access-token:ghs_t").toString("base64")}`,
		});
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
