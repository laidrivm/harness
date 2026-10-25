import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { main } from "./github-app-mint.ts";
import { minted } from "./github-app-minted.ts";
import { TEMPFAIL, Transient } from "./transient.ts";

/**
 * The key holder's mint against a stand-in API reached through
 * `GITHUB_API_URL`, with its three files in a directory made for the run: no
 * case reaches GitHub or holds a real key.
 */

let seen: { method: string; path: string; body: string }[] = [];
let server: ReturnType<typeof Bun.serve>;
const api = process.env.GITHUB_API_URL;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const path = new URL(req.url).pathname;
			seen.push({ method: req.method, path, body: await req.text() });
			const answers: Record<string, unknown> = {
				"/app": { slug: "demo-app" },
				"/repos/o/demo/installation": { id: 99 },
				"/app/installations/99/access_tokens": { token: "ghs_minted" },
			};
			const refused: Record<string, number> = { "/repos/o/busy/installation": 503, "/repos/o/denied/installation": 401 };
			if (path in refused) return new Response("no", { status: refused[path] });
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

/** The App's id, its key and the repositories the list names, as the image provisions them. */
function files(repositories = "o/demo\nO/Other\n") {
	const dir = emptyDir("github-app-mint-");
	const key = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" } }).privateKey;
	const at = { id: join(dir, "app-id"), key: join(dir, "app.pem"), repositories: join(dir, "repositories") };
	writeFileSync(at.id, "7\n");
	writeFileSync(at.key, key);
	writeFileSync(at.repositories, repositories);
	return at;
}

describe("the mint", () => {
	// spec: orchestrator/the-runner-asks-the-key-holder
	test("prints the one repository's token on stdout, holding exactly the permissions asked", async () => {
		seen = [];
		expect(await main(["o/demo", "contents=write", "pull_requests=read"], files())).toEqual({ code: 0, out: "ghs_minted\n", err: "" });
		expect(JSON.parse(seen[1].body)).toEqual({ repositories: ["demo"], permissions: { contents: "write", pull_requests: "read" } });
	});

	test("workflows at write, the board loop's push of a workflow file, is in the set", async () => {
		seen = [];
		expect((await main(["o/demo", "workflows=write"], files())).code).toBe(0);
		expect(JSON.parse(seen[1].body).permissions).toEqual({ workflows: "write" });
	});

	test("--slug prints the App's slug", async () => {
		expect((await main(["o/demo", "--slug"], files())).out).toBe("demo-app\n");
	});

	test("a listed repository is matched case-blind", async () => {
		seen = [];
		await main(["o/other", "contents=read"], files());
		expect(seen.map((r) => r.path)).toContain("/repos/o/other/installation");
	});
});

describe("what it refuses, before any call", () => {
	// spec: orchestrator/a-repository-outside-the-installation orchestrator/a-permission-outside-the-fixed-set
	test.each([
		["a repository the list does not name", ["o/else", "contents=write"], "o/else"],
		["a repository that is no owner and name", ["../o", "contents=write"], "../o"],
		["a permission outside the set", ["o/demo", "administration=write"], "administration=write"],
		["a level the set does not hold", ["o/demo", "actions=write"], "actions=write"],
		["workflows at a level GitHub does not have", ["o/demo", "workflows=read"], "workflows=read"],
		["a word that is no permission", ["o/demo", "contents"], "contents"],
		["a name the table inherits", ["o/demo", "constructor=read"], "constructor=read"],
		["the prototype's own name", ["o/demo", "__proto__=read"], "__proto__=read"],
		["no permission at all", ["o/demo"], "no permission"],
	])("%s exits non-zero, naming it", async (_, args, named) => {
		seen = [];
		const r = await main(args, files());
		expect([r.code, r.out]).toEqual([2, ""]);
		expect(r.err).toContain(named);
		expect(seen).toEqual([]);
	});

	test("a call that fails exits 1 naming the path, never the key", async () => {
		const r = await main(["o/demo", "contents=write"], files("o/demo\n"));
		expect(r.code).toBe(0);
		const failed = await main(["o/gone", "contents=write"], files("o/gone\n"));
		expect([failed.code, failed.out]).toEqual([1, ""]);
		expect(failed.err).toContain("/repos/o/gone/installation");
		expect(failed.err).not.toContain("PRIVATE KEY");
	});

	test.each([
		["answered 503", "o/busy", TEMPFAIL],
		["answered 401", "o/denied", 1],
	])("a call %s, for %s, exits %p", async (_, repository, code) => {
		const r = await main([repository, "contents=write"], files(`${repository}\n`));
		expect([r.code, r.out]).toEqual([code, ""]);
		expect(r.err).toContain(`/repos/${repository}/installation`);
	});
});

describe("the runner's side, minted()", () => {
	/** What `minted()` throws for a mint command running `script`, with a short limit. */
	const thrown = (script: string) => {
		const file = join(emptyDir("github-app-minted-"), "mint");
		writeFileSync(file, `#!/bin/sh\n${script}\n`);
		chmodSync(file, 0o755);
		try {
			minted(file, "o/demo", ["--slug"], 500);
		} catch (error) {
			return error as Error;
		}
	};

	test.each([
		["exits 75", "exit 75"],
		["is killed at its limit", "exec sleep 5"],
	])("a mint that %s throws a Transient", (_, script) => {
		expect(thrown(script)).toBeInstanceOf(Transient);
	});

	test.each([
		["exits 1", "echo denied >&2; exit 1"],
		["is killed by another signal", "kill -KILL $$"],
	])("a mint that %s throws a plain Error", (_, script) => {
		const error = thrown(script);
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(Transient);
	});
});
