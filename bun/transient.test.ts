import { describe, expect, test } from "bun:test";
import { client } from "./notion-bot.ts";
import { answered, network, TEMPFAIL, Transient } from "./transient.ts";

/** What a failure is: `retry-on-transient` *A `Transient` error, classified where the status is known*. */

describe("an answered status", () => {
	test.each([500, 502, 503, 529, 429])("%p is transient", (status) => {
		expect(answered(status)).toBe(true);
	});

	test.each([200, 401, 403, 404, 422, 499, 600])("%p is not", (status) => {
		expect(answered(status)).toBe(false);
	});
});

describe("git's stderr", () => {
	const at = "fatal: unable to access 'https://github.com/o/r.git/': ";
	test.each([
		`${at}Could not resolve host: github.com`,
		`${at}Could not resolve proxy: proxy.example.com`,
		`${at}Failed to connect to github.com port 443 after 75004 ms: Couldn't connect to server`,
		`${at}Operation timed out after 300000 milliseconds with 0 out of 0 bytes received`,
		`${at}Failed to connect to github.com port 443: Connection refused`,
		`${at}Recv failure: Connection reset by peer`,
		`${at}The requested URL returned error: 502`,
		`${at}The requested URL returned error: 429`,
		"error: RPC failed; curl 56 Recv failure: Connection reset by peer\nfatal: early EOF",
		"fetch-pack: unexpected disconnect while reading sideband packet\nfatal: early EOF",
		`${at}Empty reply from server`,
		"ssh: connect to host github.com port 22: Network is unreachable\nfatal: Could not read from remote repository.",
		"ssh: connect to host github.com port 22: No route to host\nfatal: Could not read from remote repository.",
	])("%p is a network failure", (stderr) => {
		expect(network(stderr)).toBe(true);
	});

	test.each([
		" ! [rejected]        feat/x -> feat/x (fetch first)\nerror: failed to push some refs to 'https://github.com/o/r.git'",
		"remote: Invalid username or token.\nfatal: Authentication failed for 'https://github.com/o/r.git/'",
		`${at}The requested URL returned error: 403`,
		"error: RPC failed; HTTP 413 curl 22 The requested URL returned error: 413\nfatal: early EOF",
		"error: RPC failed; HTTP 401 curl 22 The requested URL returned error: 401\nfatal: early EOF",
		"",
	])("%p is not", (stderr) => {
		expect(network(stderr)).toBe(false);
	});
});

test("a Transient is an Error, and the exit status is EX_TEMPFAIL", () => {
	expect(new Transient("x")).toBeInstanceOf(Error);
	expect(TEMPFAIL).toBe(75);
});

describe("the status a Transient carries", () => {
	// spec: task-board/a-post-that-may-have-landed
	test("one from a 503 carries 503, one from a timeout none [32]", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: (req) =>
				new URL(req.url).pathname === "/slow" ? new Promise<Response>(() => {}) : new Response("{}", { status: 503 }),
		});
		const before = process.env.HARNESS_NOTION_API_URL;
		process.env.HARNESS_NOTION_API_URL = server.url.origin;
		const caught = (path: string) =>
			client("t", 100)("the step", path).then(
				() => undefined,
				(error: unknown) => error,
			);
		try {
			const [refused, late] = await Promise.all([caught("/fail"), caught("/slow")]);
			expect([refused instanceof Transient, (refused as Transient).status]).toEqual([true, 503]);
			expect([late instanceof Transient, (late as Transient).status]).toEqual([true, undefined]);
		} finally {
			if (before === undefined) delete process.env.HARNESS_NOTION_API_URL;
			else process.env.HARNESS_NOTION_API_URL = before;
			server.stop(true);
		}
	});
});
