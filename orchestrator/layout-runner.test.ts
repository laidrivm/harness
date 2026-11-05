import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { syncSettings } from "../bun/sync-settings.ts";
import { composed, instructions, read, root, yaml } from "./layout.fixture.ts";

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
		expect(services.windmill_worker_pass?.secrets).toContain("runner_known_hosts");
		expect(services.runner?.secrets).toContain("runner_host_key");
		expect(read(dockerfile)).not.toContain("ssh-keygen -A");
	});

	test("the host is App-only: the runner mounts no gh_token, and the README writes none", () => {
		const compose = composed() as {
			services: Record<string, { secrets?: string[] }>;
			secrets: Record<string, unknown>;
		};
		expect(compose.services.runner?.secrets).not.toContain("gh_token");
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

	const lines = () => instructions(dockerfile);

	test("apt installs tmux and the libstdc++6 Node needs", () => {
		const apt = lines().find((l) => l.startsWith("RUN ") && l.includes("apt-get install")) ?? "";
		for (const name of ["tmux", "libstdc++6"]) expect(apt.split(/\s+/)).toContain(name);
	});

	// spec: orchestrator/node-is-bun
	test("node is the one binary from a node:24 stage, never a link to bun", () => {
		const all = lines();
		expect(all.some((l) => /^FROM node:24\.\d+\.\d+-\S+ AS node$/.test(l))).toBe(true);
		expect(all).toContain("COPY --from=node /usr/local/bin/node /usr/local/bin/node");
		expect(all.filter((l) => /\bln\b[^\n]*\bbun\b[^\n]*\bnode\b/.test(l))).toEqual([]);
	});

	// spec: orchestrator/a-linter-pin-that-drifts-from-ci-s
	test("the actionlint and gitleaks stages are the images, tags and digests lint.yml runs, and their binaries, and the shellcheck CI's actionlint calls, are copied in", () => {
		type Job = { steps?: { uses?: string }[] };
		const jobs = (yaml(".github/workflows/lint.yml").jobs ?? {}) as Record<string, Job>;
		const ci = Object.values(jobs)
			.flatMap((j) => j.steps ?? [])
			.map((s) => s.uses ?? "")
			.filter((u) => u.startsWith("docker://"))
			.map((u) => u.slice("docker://".length));
		const froms = lines().flatMap((l) => /^FROM (\S+)/.exec(l)?.[1] ?? []);
		const name = (ref: string) => ref.split(/[:@]/)[0];
		for (const tool of ["actionlint", "gitleaks"]) {
			const theirs = ci.find((ref) => name(ref)?.endsWith(`/${tool}`));
			expect(theirs).toBeDefined();
			const ours = froms.find((ref) => name(ref) === name(theirs ?? ""));
			// Both values, so the failure names the pin to move.
			expect(`Dockerfile ${ours}`).toBe(`Dockerfile ${theirs}`);
		}
		const all = lines();
		expect(all).toContain("COPY --from=actionlint /usr/local/bin/actionlint /usr/local/bin/actionlint");
		// actionlint skips shellcheck's pass over `run:` scripts when it finds none on PATH.
		expect(all).toContain("COPY --from=actionlint /usr/local/bin/shellcheck /usr/local/bin/shellcheck");
		expect(all).toContain("COPY --from=gitleaks /usr/bin/gitleaks /usr/local/bin/gitleaks");
	});

	// spec: orchestrator/a-tool-that-does-not-run
	test("one RUN prints the version of node, actionlint, gitleaks and claude, so a binary that cannot run fails the build", () => {
		const versions = [
			"node --version",
			"actionlint -version",
			"shellcheck --version",
			"gitleaks version",
			"claude --version",
		];
		expect(lines().filter((l) => l.startsWith("RUN ") && versions.every((v) => l.includes(v)))).toHaveLength(1);
	});

	// spec: orchestrator/the-container-restarts
	test("the entrypoint starts main as agent with the start script after the authorized_keys lines and before exec, and the image carries the script", () => {
		const all = read(entry).split("\n");
		const start = all.indexOf("runuser -u agent -- tmux new-session -d -s main /opt/orchestrator/session.sh");
		const keys = all.findLastIndex((l) => l.includes("authorized_keys"));
		expect(keys).toBeGreaterThan(-1);
		expect(start).toBeGreaterThan(keys);
		expect(start).toBeLessThan(all.indexOf('exec "$@"'));
		expect(lines()).toContain("COPY --chmod=0755 runner/session.sh /opt/orchestrator/session.sh");
	});

	// /etc/claude-code/CLAUDE.md is Claude Code's managed memory on Linux; a file under /home/agent, a volume, would never update.
	test("the image copies the session's rules to the managed CLAUDE.md at mode 0644", () => {
		expect(lines()).toContain("COPY --chmod=0644 runner/session-rules.md /etc/claude-code/CLAUDE.md");
		expect(read("orchestrator/runner/session-rules.md").match(/^\d+\. /gm)).toHaveLength(11);
	});

	// An octal --chmod reaches the directories its COPY creates: one made by the COPY would be 0644, which agent cannot enter.
	test("the image makes /etc/claude-code 0755 before the COPY writes the managed CLAUDE.md into it", () => {
		const all = lines();
		const made = all.findIndex(
			(l) =>
				l.startsWith("RUN ") &&
				l
					.split("&&")
					.some((c) => c.trim().startsWith("install -d -m 0755 ") && c.split(/\s+/).includes("/etc/claude-code")),
		);
		expect(made).toBeGreaterThan(-1);
		expect(made).toBeLessThan(all.indexOf("COPY --chmod=0644 runner/session-rules.md /etc/claude-code/CLAUDE.md"));
	});

	// spec: orchestrator/no-identity-on-the-host
	test("the runner's environment takes the four commit identity names from orchestrator/.env, refusing when one is unset", () => {
		const runner = (composed().services as Record<string, { environment?: Record<string, string> }>).runner;
		for (const name of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"])
			expect(runner?.environment?.[name]).toMatch(new RegExp(`^\\$\\{${name}:\\?.+\\}$`));
	});

	test("the engine's ssh call names the clone and the repository the job runs [38]", () => {
		const call = read("orchestrator/windmill/f/orchestrator/pass.sh").trim().split("\n").at(-1) ?? "";
		expect(call).toMatch(
			/ runner@runner [A-Za-z0-9][A-Za-z0-9._-]* [A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
		);
	});
});

describe("ponytail's level in the runner", () => {
	const all = () => read("orchestrator/runner/entrypoint.sh").split("\n");
	const line = () => all().find((l) => l.includes(".config/ponytail/config.json")) ?? "";
	/** The `sh -c` body the line runs as agent. */
	const body = () => /sh -c '([^']*)'/.exec(line())?.[1] ?? "";

	// spec: orchestrator/the-level-is-written-before-the-session-starts
	test("the entrypoint writes the level after the authorized_keys lines and before tmux starts main", () => {
		const at = all().indexOf(line());
		expect(line()).not.toBe("");
		expect(at).toBeGreaterThan(all().findLastIndex((l) => l.includes("authorized_keys")));
		expect(at).toBeLessThan(all().findIndex((l) => l.includes("tmux new-session")));
	});

	// spec: orchestrator/the-written-file-names-ultra
	test("its command, run twice with a HOME holding no .config, leaves a file whose defaultMode is ultra", () => {
		const home = emptyDir("orchestrator-ponytail-");
		const file = join(home, ".config/ponytail/config.json");
		const texts = [1, 2].map(() => {
			expect(Bun.spawnSync(["sh", "-c", body()], { env: { PATH: process.env.PATH ?? "", HOME: home } }).exitCode).toBe(
				0,
			);
			return readFileSync(file, "utf8");
		});
		expect(JSON.parse(texts[0] ?? "").defaultMode).toBe("ultra");
		expect(texts[1]).toBe(texts[0]);
	});

	// spec: orchestrator/the-write-runs-as-the-session-user
	test("the line runs its write through runuser as agent", () => {
		expect(line()).toStartWith("runuser -u agent -- sh -c '");
	});

	// spec: orchestrator/a-failed-write-leaves-the-runner-starting
	test("where .config/ponytail is a file, the write fails and the line, under set -e, prints its own and goes on", () => {
		const home = emptyDir("orchestrator-ponytail-");
		mkdirSync(join(home, ".config"));
		writeFileSync(join(home, ".config/ponytail"), "");
		const env = { PATH: process.env.PATH ?? "", HOME: home };
		expect(Bun.spawnSync(["sh", "-c", body()], { env }).exitCode).not.toBe(0);
		expect(line()).toEndWith(`|| echo "entrypoint: ponytail's level was not written" >&2`);
		// runuser stubbed to run what follows `--`, so the whole line runs as the entrypoint would.
		const bin = emptyDir("orchestrator-runuser-");
		writeFileSync(join(bin, "runuser"), '#!/bin/sh\nshift 3\nexec "$@"\n', { mode: 0o755 });
		const r = Bun.spawnSync(["sh", "-ec", `${line()}\necho went on`], {
			env: { ...env, PATH: `${bin}:${env.PATH}` },
		});
		expect([r.exitCode, r.stdout.toString()]).toEqual([0, "went on\n"]);
		expect(r.stderr.toString()).toContain("entrypoint: ponytail's level was not written");
	});

	// spec: orchestrator/the-laptop-s-level-is-untouched
	test("neither the harness's tracked settings nor the files sync writes name ponytail's level", () => {
		const dir = emptyDir("orchestrator-synced-");
		syncSettings(dir);
		for (const text of [
			read(".claude/settings.json"),
			...[".claude/settings.json", "bunfig.toml"].map((p) => readFileSync(join(dir, p), "utf8")),
		]) {
			expect(text).not.toContain("PONYTAIL_DEFAULT_MODE");
			expect(text).not.toContain(".config/ponytail");
		}
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

	// A shell's umask outlives its step: a later `git pull` would write the checkout the image copies under it.
	test("sets a umask only inside the `sh -c` it scopes, never in the user's shell", () => {
		const set = instructions(readme).filter((l) => /\bumask\s+\d/.test(l));
		expect(set.filter((l) => !/ sh -c '[^']*\bumask \d+;[^']*'$/.test(l))).toEqual([]);
		expect(set.length).toBeGreaterThan(0);
	});

	test("gives stop.sh's one invocation", () => {
		expect(read(readme)).toContain("docker compose exec -u runner runner /opt/orchestrator/stop.sh");
	});
});
