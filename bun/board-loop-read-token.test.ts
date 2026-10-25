import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { carry, publish } from "./board-loop-push.ts";
import { clone, change } from "./board-loop.fixture.ts";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";

/** The push clone's fetches on the host: a `contents` read token in theirs alone (`runner-isolation` task 6.1). */

afterAll(cleanup);

const real = Bun.which("git") ?? "git";

/** A session's clone with a step commit on `feat/demo`, a push clone of its origin, and a `git` that logs each fetch's header. */
function stand() {
	const { dir, origin } = clone(change("demo"));
	git(dir, "switch", "-q", "-c", "feat/demo");
	git(dir, "-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "-q", "--allow-empty", "-m", "step");
	const push = emptyDir("read-token-push-");
	git(push, "clone", "-q", origin, ".");
	const bin = emptyDir("read-token-bin-");
	const log = join(bin, "fetched");
	writeFileSync(join(bin, "git"), `#!/bin/sh\ncase " $* " in *" fetch "*) echo "$GIT_CONFIG_VALUE_0" >> '${log}';; esac\nexec '${real}' "$@"\n`);
	chmodSync(join(bin, "git"), 0o755);
	// The launcher's shape: the words, then the session's clone, which `carry` hands the command.
	const under = ["sh", "-c", 'cd "$0" && exec "$@"', dir];
	return { dir, push, bin, log, under };
}

const header = (token: string) => `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;

/**
 * Sets aside the credentials this suite inherits — the runner's push hands its own App token to the
 * pre-push suite — so only those `carry` hands are seen. Returns what puts them back.
 */
function setAside() {
	const was = Object.entries(process.env).filter(([key]) => key === "GH_TOKEN" || key.startsWith("GIT_CONFIG_"));
	for (const [key] of was) delete process.env[key];
	return () => Object.assign(process.env, Object.fromEntries(was));
}

describe("carry's fetches", () => {
	test("hold the read token in their environment, and the process that runs them does not", () => {
		const { push, bin, log, under } = stand();
		const was = [process.cwd(), process.env.PATH];
		const restore = setAside();
		process.chdir(push);
		process.env.PATH = `${bin}:${process.env.PATH}`;
		try {
			const read = { GH_TOKEN: "ghs_read", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: header("ghs_read") };
			expect(carry(under, "feat/demo", "main", read)).toBeUndefined();
			// Both fetches, the origin's and the bundle's, carried it.
			expect(readFileSync(log, "utf8").split("\n").filter(Boolean)).toEqual([header("ghs_read"), header("ghs_read")]);
			expect(process.env.GH_TOKEN).toBeUndefined();
			expect(process.env.GIT_CONFIG_VALUE_0).toBeUndefined();
		} finally {
			process.chdir(was[0] as string);
			process.env.PATH = was[1];
			restore();
		}
	});

	test("with no token handed hold none", () => {
		const { push, bin, log, under } = stand();
		const was = [process.cwd(), process.env.PATH];
		const restore = setAside();
		process.chdir(push);
		process.env.PATH = `${bin}:${process.env.PATH}`;
		try {
			expect(carry(under, "feat/demo", "main")).toBeUndefined();
			expect(readFileSync(log, "utf8").split("\n").filter(Boolean)).toEqual([]);
		} finally {
			process.chdir(was[0] as string);
			process.env.PATH = was[1];
			restore();
		}
	});
});

describe("publish with the key holder's mint", () => {
	test("a read token that cannot be minted carries nothing, naming the failure", async () => {
		const { push, bin, log, under } = stand();
		const mint = join(bin, "mint");
		writeFileSync(mint, "#!/bin/sh\nexit 1\n");
		chmodSync(mint, 0o755);
		const was = [process.cwd(), process.env.PATH];
		process.chdir(push);
		process.env.PATH = `${bin}:${process.env.PATH}`;
		try {
			const app = { id: "7", mint, owner: "o", repo: "r" };
			const said = await publish("", [], "feat/demo", "main", { session: "s", clone: "c" }, app, under);
			expect(said).toStartWith("the App's read token could not be minted: ");
			expect(said).toEndWith("nothing was pushed");
			expect(existsSync(log)).toBe(false);
		} finally {
			process.chdir(was[0] as string);
			process.env.PATH = was[1];
		}
	});

	// A step may add or change a file under `.github/workflows/`, which GitHub refuses to a token without `workflows`.
	test("the push token asks contents, pull_requests and workflows at write", async () => {
		const { dir, bin } = stand();
		const asked = join(bin, "asked");
		const mint = join(bin, "mint");
		writeFileSync(mint, `#!/bin/sh\necho "$*" > '${asked}'\nexit 1\n`);
		chmodSync(mint, 0o755);
		const goal = join(bin, "goal.ts");
		writeFileSync(goal, 'console.log("goal met");\n');
		const was = process.cwd();
		process.chdir(dir);
		try {
			const app = { id: "7", mint, owner: "o", repo: "r" };
			const said = await publish("PR-TITLE: t\nPR-BODY: b", [goal], "feat/demo", "main", { session: "s", clone: "c" }, app);
			expect(said).toStartWith("the App's token could not be minted: ");
			expect(readFileSync(asked, "utf8").trim()).toBe("o/r contents=write pull_requests=write workflows=write");
		} finally {
			process.chdir(was);
		}
	});
});
