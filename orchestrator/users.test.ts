import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PASSED } from "../bun/board-loop-session.ts";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { FILES } from "../bun/github-app-mint.ts";
import { RUNNER_ASKS } from "../bun/question-gate.ts";
import { instructions } from "./layout.fixture.ts";

/** The host's three users (`runner-isolation` group 5, task 5.1): the image, its sudoers, the launcher and the key holder's files. */

afterAll(cleanup);

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const dockerfile = read("runner/Dockerfile");
const sudoers = read("runner/sudoers");
/** The uid the image's `useradd` line for `user` fixes. */
const uidOf = (user: string) =>
	/--uid (\d+)/.exec(
		dockerfile.split("\n").find((l) => l.includes("useradd") && new RegExp(`\\s${user}(\\s|$)`).test(l)) ?? "",
	)?.[1];
const HELPER = "credential.https://github.com.helper";
const rules = sudoers.split("\n").filter((l) => !l.startsWith("#") && l.includes("NOPASSWD"));

describe("the image's users", () => {
	test("creates runner, agent and the key holder, each with a fixed uid of its own", () => {
		const uids = ["runner", "agent", "keyholder"].map(uidOf);
		expect(uids.every((u) => u !== undefined)).toBe(true);
		expect(new Set(uids).size).toBe(3);
	});

	test("runner is in no group of agent's, since every command in agent's clones goes through the launcher", () => {
		expect(dockerfile).not.toMatch(/usermod[^\n]*\bagent\b[^\n]*\brunner\b/);
		expect(dockerfile).not.toMatch(/useradd[^\n]*(--groups|-G)[^\n]*\bagent\b/);
	});

	// spec: orchestrator/the-runner-asks-the-key-holder
	test("sudoers holds exactly Three users' two rules and the session user's mint, and the image installs it read-only for root", () => {
		expect(rules).toEqual([
			"runner ALL=(agent) NOPASSWD: /opt/orchestrator/as-agent",
			"runner ALL=(keyholder) NOPASSWD: /opt/orchestrator/mint",
			"agent ALL=(keyholder) NOPASSWD: /opt/orchestrator/mint",
		]);
		expect(dockerfile).toContain("COPY --chmod=0440 runner/sudoers /etc/sudoers.d/orchestrator");
		expect(dockerfile.split("\n").filter((l) => l.includes("NOPASSWD"))).toEqual([]);
	});

	// The two lists are one set of names looked up in two systems (`rules.md` Code); sudo drops any other.
	test("the launcher's env_keep is the session allowlist, LC_* included, and the commit identity and question gate's signal the runner adds", () => {
		const kept = /^Defaults!\/opt\/orchestrator\/as-agent env_keep = "([^"]*)"$/m.exec(sudoers)?.[1]?.split(" ");
		const added = [
			"GIT_AUTHOR_NAME",
			"GIT_AUTHOR_EMAIL",
			"GIT_COMMITTER_NAME",
			"GIT_COMMITTER_EMAIL",
			RUNNER_ASKS.name,
		];
		expect(kept?.sort()).toEqual([...PASSED, "LC_*", ...added].sort());
		expect(sudoers).toMatch(/^Defaults!\/opt\/orchestrator\/as-agent !use_pty$/m);
	});

	test("the launcher, the mint and the reach check are root's under /opt/orchestrator, and the mint runs the image's copy of bun/", () => {
		for (const file of ["as-agent", "mint", "reach-check.sh"])
			expect(dockerfile).toContain(`COPY --chmod=0755 ${file} /opt/orchestrator/${file}`);
		expect(dockerfile).not.toMatch(/COPY --chown/);
		expect(read("mint")).toContain("/opt/orchestrator/bun/github-app-mint.ts");
		// The App's id and repository list are root's; the key's directory is the key holder's.
		expect(dirname(FILES.id)).toBe(dirname(FILES.repositories));
		expect(dockerfile).toContain(`install -d -m 0755 ${dirname(FILES.id)}`);
		expect(dockerfile).toContain(`install -d -o keyholder -g keyholder -m 0700 ${dirname(FILES.key)}`);
	});

	test("the image's one copy of bun/ sets its modes, root-writable and readable by all, never the checkout's", () => {
		const lines = instructions("orchestrator/runner/Dockerfile");
		expect(lines.filter((l) => /^copy\b.*--from=bun\b/i.test(l))).toEqual([
			"COPY --from=bun --chmod=u=rwX,go=rX . /opt/orchestrator/bun/",
		]);
	});

	test("the image's build fails when its copy of bun/ or the managed CLAUDE.md holds a mode agent or the key holder cannot read, or one they could write", () => {
		const run = instructions("orchestrator/runner/Dockerfile").find(
			(l) => l.startsWith("RUN ") && l.includes("find /opt/orchestrator/bun "),
		);
		expect(run).toBeDefined();
		const script = (run ?? "RUN false")
			.slice(4)
			.replaceAll("/opt/orchestrator/bun", '"$1"')
			.replaceAll("/etc/claude-code", '"$2"');
		const tree = (file: number, dir: number) => {
			const top = emptyDir("orchestrator-modes-");
			chmodSync(top, 0o755);
			mkdirSync(join(top, "sub"));
			writeFileSync(join(top, "sub", "CLAUDE.md"), "");
			chmodSync(join(top, "sub", "CLAUDE.md"), file);
			chmodSync(join(top, "sub"), dir);
			return top;
		};
		const built = (bun: string, managed: string) =>
			["dash", "sh"].map((shell) => Bun.spawnSync([shell, "-c", script, shell, bun, managed]).exitCode);
		const good = tree(0o644, 0o755);
		expect(built(good, good)).toEqual([0, 0]);
		expect(built(tree(0o755, 0o755), tree(0o755, 0o755))).toEqual([0, 0]);
		for (const [file, dir] of [
			[0o600, 0o755],
			[0o664, 0o755],
			[0o646, 0o755],
			[0o644, 0o744],
		] as const) {
			const bad = tree(file, dir);
			expect([file.toString(8), dir.toString(8), ...built(bad, good), ...built(good, bad)]).toEqual([
				file.toString(8),
				dir.toString(8),
				1,
				1,
				1,
				1,
			]);
		}
		// The image #412 built: the COPY made /etc/claude-code with the file's 0644; BSD find reports it on stderr only.
		const broken = tree(0o644, 0o755);
		chmodSync(broken, 0o644);
		try {
			expect(built(good, broken)).toEqual([1, 1]);
		} finally {
			chmodSync(broken, 0o755);
		}
		expect(built(good, join(good, "absent"))).toEqual([1, 1]);
	});

	// spec: orchestrator/git-reaches-github
	test("the image installs the release's gh beside the wrapper's path, the wrapper 0755 in its place, and git's helper naming the wrapper", () => {
		expect(dockerfile).toMatch(/install -D -m 0755 "[^"\n]*\/bin\/gh" \/usr\/local\/libexec\/gh\/gh\b/);
		expect(dockerfile).toContain("COPY --chmod=0755 runner/gh /usr/local/bin/gh");
		// setup-git would write the real gh's path.
		expect(dockerfile).not.toContain("gh auth setup-git");
		// The helper as git reads it: the image's `RUN` that writes it, run against a scratch system config
		// under dash, the image's /bin/sh, and sh.
		const run = instructions("orchestrator/runner/Dockerfile").find(
			(l) => l.startsWith("RUN ") && l.includes("git config --system"),
		);
		expect(run).toBeDefined();
		for (const shell of ["dash", "sh"]) {
			const config = join(emptyDir("orchestrator-gitconfig-"), "gitconfig");
			const env = { PATH: process.env.PATH ?? "", GIT_CONFIG_SYSTEM: config, GIT_CONFIG_NOSYSTEM: "" };
			expect(Bun.spawnSync([shell, "-c", run?.slice(4) ?? "false"], { env }).exitCode).toBe(0);
			const helpers = Bun.spawnSync(["git", "config", "--file", config, "--get-all", HELPER]);
			expect(`${shell}: ${helpers.stdout}`).toBe(`${shell}: \n!/usr/local/bin/gh auth git-credential\n`);
		}
	});

	test("the image installs jq and the empty hooks directory pass.sh resets to, and writes no gh login into runner's home", () => {
		expect(dockerfile).toMatch(/apt-get install[^\n]* jq /);
		expect(dockerfile).toContain("install -d -m 0755 /etc/orchestrator/app /opt/orchestrator/hooks");
		expect(dockerfile).not.toMatch(/hosts\.yml|gh auth login/);
	});
});

describe("as-agent", () => {
	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	//   orchestrator/a-pass-s-session-reads-the-same-file
	test("runs the command in the clone it is handed with agent's HOME, USER and LOGNAME, and none of the four config locations", () => {
		const dir = realpathSync(emptyDir("orchestrator-as-agent-"));
		const inherited = {
			PATH: process.env.PATH ?? "",
			HOME: "/home/runner",
			USER: "runner",
			LOGNAME: "runner",
			CLAUDE_CONFIG_DIR: "/c",
			XDG_CONFIG_HOME: "/x",
			XDG_DATA_HOME: "/d",
			XDG_CACHE_HOME: "/k",
			XDG_STATE_HOME: "/s",
		};
		const r = Bun.spawnSync(["sh", join(import.meta.dir, "as-agent"), dir, "sh", "-c", "pwd -P; env"], {
			env: inherited,
		});
		const [pwd, ...lines] = r.stdout.toString().trim().split("\n");
		const env = Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
		expect([r.exitCode, pwd]).toEqual([0, dir]);
		expect([env.HOME, env.USER, env.LOGNAME, env.XDG_STATE_HOME]).toEqual(["/home/agent", "agent", "agent", "/s"]);
		for (const name of ["CLAUDE_CONFIG_DIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"])
			expect(env[name]).toBeUndefined();
	});

	test("a missing clone or command runs nothing and exits non-zero", () => {
		const marker = join(emptyDir("orchestrator-as-agent-"), "ran");
		for (const args of [[join(dirname(marker), "absent"), "touch", marker], [dirname(marker)]])
			expect(Bun.spawnSync(["sh", join(import.meta.dir, "as-agent"), ...args]).exitCode).not.toBe(0);
		expect(Bun.file(marker).size).toBe(0);
	});
});

describe("the host's wiring", () => {
	test("the forced command starts pass.sh with the launcher, the mint, the image's notice command and the App's id from its root-owned file", () => {
		const line =
			read("runner/entrypoint.sh")
				.split("\n")
				.find((l) => l.includes("authorized_keys") && l.includes(">") && !l.includes(">>")) ?? "";
		const command = (/command="(.*?)" %s/.exec(line)?.[1] ?? "").replaceAll('\\\\"', '"');
		const dir = emptyDir("orchestrator-forced-");
		const stub = join(dir, "pass.sh");
		writeFileSync(
			stub,
			'#!/bin/sh\nprintf "%s\\n" "$PASS_AS_AGENT" "$HARNESS_GITHUB_APP_MINT" "$PASS_NOTIFY" "$HARNESS_GITHUB_APP_ID"\n',
			{ mode: 0o755 },
		);
		const r = Bun.spawnSync(["bash", "-c", command.replace("/opt/orchestrator/pass.sh", stub)], {
			cwd: dir,
			env: { PATH: process.env.PATH ?? "", SSH_ORIGINAL_COMMAND: "harness owner/repo" },
		});
		const [launcher, mint, notify] = r.stdout.toString().split("\n");
		expect([launcher, mint]).toEqual([
			"sudo -n -u agent /opt/orchestrator/as-agent",
			"sudo -n -u keyholder /opt/orchestrator/mint",
		]);
		// The image's copy, with the flags the runner's own bun takes: a pause can run in the push clone, whose bunfig.toml and .env are a branch's.
		// Under a deadline, since the lock the pass holds while it runs also gates the deploy.
		expect(notify).toBe("timeout 300 bun --config=/dev/null --no-env-file /opt/orchestrator/bun/notion-pause.ts");
		expect(command).toContain(`HARNESS_GITHUB_APP_ID=$(cat ${FILES.id} 2>/dev/null)`);
	});

	test("compose mounts the App's root-owned directory and the key holder's read-only, never creating a missing one, and git ignores both", () => {
		type Mount =
			| string
			| { type?: string; source?: string; target?: string; read_only?: boolean; bind?: { create_host_path?: boolean } };
		const services = (Bun.YAML.parse(read("compose.yaml")) as { services: Record<string, { volumes?: Mount[] }> })
			.services;
		const binds = services.runner?.volumes?.filter((m) => typeof m !== "string") ?? [];
		for (const [source, target] of [
			["./app", dirname(FILES.id)],
			["./app-key", dirname(FILES.key)],
		])
			expect(binds).toContainEqual({
				type: "bind",
				source,
				target,
				read_only: true,
				bind: { create_host_path: false },
			});
		// A short-form host path makes Docker create a missing source as an empty root-owned directory.
		for (const [name, service] of Object.entries(services))
			for (const m of service.volumes ?? []) if (typeof m === "string") expect(`${name}: ${m}`).not.toMatch(/: [./]/);
		const gitignore = readFileSync(join(import.meta.dir, "../.gitignore"), "utf8").split("\n");
		for (const dir of ["orchestrator/app", "orchestrator/app-key"]) expect(gitignore).toContain(dir);
	});

	test("the README gives the key file its owner and mode, and runs the reach check", () => {
		const text = read("README.md");
		const holder = uidOf("keyholder");
		for (const part of [
			`install -m 0400 -o ${holder} -g ${holder}`,
			`chown ${holder}:${holder} app-key`,
			"chmod 0700 app-key",
			"docker compose exec runner /opt/orchestrator/reach-check.sh",
		])
			expect(text).toContain(part);
	});
});
