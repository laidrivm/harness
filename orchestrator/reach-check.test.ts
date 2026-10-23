import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";

/** `reach-check.sh` (task 5.3) over a temporary tree whose modes each case sets, run as this user for both of the host's. */

afterAll(cleanup);

/** A secrets directory holding `files` at their modes, and a key at `key`'s; `null` leaves the key absent. `as` overrides an identity switch's prefix. */
function check(files: Record<string, number>, key: number | null, as: Record<string, string> = {}) {
	const root = emptyDir("orchestrator-reach-");
	const secrets = join(root, "secrets");
	mkdirSync(secrets);
	for (const [name, mode] of Object.entries(files)) {
		writeFileSync(join(secrets, name), "throwaway\n");
		chmodSync(join(secrets, name), mode);
	}
	const path = join(root, "app.pem");
	if (key !== null) {
		writeFileSync(path, "throwaway\n");
		chmodSync(path, key);
	}
	const env = { PATH: process.env.PATH ?? "", REACH_SECRETS: secrets, REACH_KEY: path, REACH_AS_AGENT: "", REACH_AS_RUNNER: "", ...as };
	const r = Bun.spawnSync(["sh", join(import.meta.dir, "reach-check.sh")], { env });
	return { code: r.exitCode, out: r.stdout.toString(), secrets, path };
}

// Root reads a file whatever its mode, so these say nothing run as root.
describe.skipIf(process.getuid?.() === 0)("reach-check.sh", () => {
	// spec: orchestrator/each-secret-file-as-the-session-user
	test("every read refused exits 0", () => {
		const r = check({ claude_oauth_token: 0o000, github_webhook_secret: 0o000 }, 0o000);
		expect([r.code, r.out.trim()]).toEqual([0, "reach-check: no secret file is readable as agent, and the App's key not as runner"]);
	});

	test("a file agent can read exits 1, naming it and no other", () => {
		const r = check({ claude_oauth_token: 0o000, github_webhook_secret: 0o444 }, 0o000);
		expect(r.code).toBe(1);
		expect(r.out.trim().split("\n")).toEqual([`reach-check: agent reads ${join(r.secrets, "github_webhook_secret")}`]);
	});

	test("a key runner can read is named for both users", () => {
		const r = check({ claude_oauth_token: 0o000 }, 0o444);
		expect(r.code).toBe(1);
		expect(r.out.trim().split("\n")).toEqual([`reach-check: agent reads ${r.path}`, `reach-check: runner reads ${r.path}`]);
	});

	// A failed switch would read as every read refused.
	test.each([
		["REACH_AS_AGENT", "agent"],
		["REACH_AS_RUNNER", "runner"],
	])("a switch that cannot run (%s) is no pass, naming the user", (name, user) => {
		const r = check({ claude_oauth_token: 0o000 }, 0o000, { [name]: "false" });
		expect([r.code, r.out.trim()]).toEqual([1, `reach-check: cannot switch to ${user}`]);
	});

	test("an absent key is no pass: the check cannot say who reads it", () => {
		const r = check({ claude_oauth_token: 0o000 }, null);
		expect(r.code).toBe(1);
		expect(r.out.trim()).toBe(`reach-check: ${r.path} is absent — place the App's key first (README step 11)`);
	});
});
