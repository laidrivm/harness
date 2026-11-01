import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { composed, read, root } from "./layout.fixture.ts";

/** The runner image and the host README, read from the tree. [n]: `/zombies` ideas. */

afterAll(cleanup);

describe("the runner image", () => {
	const entry = "orchestrator/runner/entrypoint.sh";
	const dockerfile = "orchestrator/runner/Dockerfile";

	test("the entrypoint writes exactly one restricted authorized_keys line naming the clones and pass.sh [38]", () => {
		const writes = read(entry)
			.split("\n")
			.filter((l) => l.includes("authorized_keys") && l.includes(">") && !l.includes(">>"));
		expect(writes).toHaveLength(1);
		for (const part of ["restrict,command=", "PASS_CLONES=/home/agent/clones", "/opt/orchestrator/pass.sh"])
			expect(writes[0]).toContain(part);
		expect(writes[0]).not.toContain(">>");
	});

	test("the entrypoint exits non-zero when the public key file is missing [38]", () => {
		const r = Bun.spawnSync(["sh", join(root, entry), "true"], {
			env: { PATH: process.env.PATH ?? "", PUBKEY_FILE: join(emptyDir("orchestrator-key-"), "absent") },
		});
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr.toString()).toContain("absent");
	});

	test("the entrypoint exits non-zero when the host key file is missing [38]", () => {
		const dir = emptyDir("orchestrator-key-");
		writeFileSync(join(dir, "pub"), "ssh-ed25519 AAAA engine\n");
		const r = Bun.spawnSync(["sh", join(root, entry), "true"], {
			env: { PATH: process.env.PATH ?? "", PUBKEY_FILE: join(dir, "pub"), HOSTKEY_FILE: join(dir, "absent") },
		});
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr.toString()).toContain("absent");
	});

	test("the engine checks the runner's host key against the pinned known_hosts, and the image bakes in none", () => {
		const call = read("orchestrator/windmill/f/orchestrator/pass.sh");
		expect(call).toContain("-o StrictHostKeyChecking=yes -o UserKnownHostsFile=/run/secrets/runner_known_hosts");
		expect(call).not.toContain("StrictHostKeyChecking=no");
		const services = composed().services as Record<string, { secrets?: string[] }>;
		expect(services.windmill_worker_pass.secrets).toContain("runner_known_hosts");
		expect(services.runner.secrets).toContain("runner_host_key");
		expect(read(dockerfile)).not.toContain("ssh-keygen -A");
	});

	test("the host is App-only: the runner mounts no gh_token, and the README writes none", () => {
		const compose = composed() as {
			services: Record<string, { secrets?: string[] }>;
			secrets: Record<string, unknown>;
		};
		expect(compose.services.runner.secrets).not.toContain("gh_token");
		expect(Object.keys(compose.secrets)).not.toContain("gh_token");
		expect(read("orchestrator/README.md")).not.toContain("gh_token");
	});

	// The key holder and both sudoers rules: `users.test.ts`.
	test("the image creates runner with a fixed uid and agent [41]", () => {
		const text = read(dockerfile);
		expect(text).toMatch(/useradd[^\n]*--uid \d+[^\n]* runner\b/);
		expect(text).toMatch(/useradd[^\n]* agent\b/);
	});

	test("the image copies pass.sh, stop.sh and the name guard both source to /opt/orchestrator/", () => {
		const text = read(dockerfile);
		for (const file of ["pass.sh", "stop.sh", "clone-name.sh"])
			expect(text).toContain(` ${file} /opt/orchestrator/${file}`);
	});

	// spec: orchestrator/a-clone-name-that-leaves-the-clones-directory
	test("the forced command hands pass.sh the engine's words split, with globbing off [38]", () => {
		const line =
			read(entry)
				.split("\n")
				.find((l) => l.includes("authorized_keys") && l.includes(">")) ?? "";
		const command = (/command="(.*?)" %s/.exec(line)?.[1] ?? "").replaceAll('\\\\"', '"');
		expect(command).toStartWith("set -f; ");
		const dir = emptyDir("orchestrator-forced-");
		const stub = join(dir, "pass.sh");
		writeFileSync(stub, '#!/bin/sh\nprintf "%s\\n" "$PASS_CLONES" "$@"\n', { mode: 0o755 });
		const r = Bun.spawnSync(["bash", "-c", command.replace("/opt/orchestrator/pass.sh", stub)], {
			cwd: dir,
			env: { PATH: process.env.PATH ?? "", SSH_ORIGINAL_COMMAND: "harness owner/repo *" },
		});
		expect(r.stdout.toString().split("\n")).toEqual(["/home/agent/clones", "harness", "owner/repo", "*", ""]);
	});

	test("the engine's ssh call names the clone and the repository the job runs [38]", () => {
		const call = read("orchestrator/windmill/f/orchestrator/pass.sh").trim().split("\n").at(-1) ?? "";
		expect(call).toMatch(
			/ runner@runner [A-Za-z0-9][A-Za-z0-9._-]* [A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
		);
	});
});

describe("the host README", () => {
	const readme = "orchestrator/README.md";

	test("opens with a level-1 heading", () => {
		expect(read(readme)).toStartWith("# ");
	});

	test("makes each secret file owned by runner's uid, mode 0400, its directory 0500, and the tunnel token owned by 65532 [41]", () => {
		const uid = /useradd[^\n]*--uid (\d+)[^\n]* runner\b/.exec(read("orchestrator/runner/Dockerfile"))?.[1];
		const text = read(readme);
		expect(uid).toBeDefined();
		for (const part of [`chown ${uid}:${uid}`, "chmod 0400", "chmod 0500", "chown 65532:65532 tunnel_token"])
			expect(text).toContain(part);
	});

	test("gives stop.sh's one invocation", () => {
		expect(read(readme)).toContain("docker compose exec -u runner runner /opt/orchestrator/stop.sh");
	});
});
