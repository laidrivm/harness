import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git } from "../bun/diff-budget.fixture.ts";
import { tracked } from "../bun/tracked.ts";
import { atLeast, compose, endsOnSsh, leaks, NOTE, passScript, pins, remoteControl, variableValues, windmillImages } from "./layout.ts";

/** What `orchestrator/` may hold: each check over fabricated input, then over the tree. [n]: `/zombies` ideas. */

afterAll(cleanup);

const { root, files } = tracked(import.meta.dir);
const mine = files.filter((p) => p.startsWith("orchestrator/"));
const read = (p: string) => readFileSync(join(root, p), "utf8");
const yaml = (p: string) => Bun.YAML.parse(read(p)) as Record<string, unknown>;
const wm = "orchestrator/windmill/";
const scripts = mine.filter((p) => p.startsWith(wm) && p.endsWith(".script.yaml"));
const schedules = () => mine.filter((p) => p.startsWith(wm) && p.endsWith(".schedule.yaml")).map((p) => ({ path: p, doc: yaml(p) }));
const composed = () => yaml("orchestrator/compose.yaml");
const image = (v: string) => `ghcr.io/windmill-labs/windmill:${v}@sha256:${"0".repeat(64)}`;
// Built from parts, so this file holds none of what it looks for.
const RC = ["claude", "remote-control"].join(" ");
const ADDRESS = [10, 1, 2, 3].join(".");
const GH = ["ghp", "a".repeat(36)].join("_");

describe("the engine's workspace", () => {
	test("no script under orchestrator/windmill/ fails rather than passing empty [27]", () => {
		expect(scripts.length).toBeGreaterThan(0);
	});

	test("the Windmill floor compares numerically [28]", () => {
		expect([atLeast("1.846.0", "1.846.1"), atLeast("1.846.1", "1.846.1"), atLeast("1.1000.0", "1.846.1")]).toEqual([false, true, true]);
	});

	// spec: orchestrator/a-windmill-image-older-than-the-floor
	test("an image below the floor, or a server and a worker on different versions, fails naming the tags and the floor [28]", () => {
		expect(windmillImages([image("1.846.0")])).toEqual([`${image("1.846.0")}: below the floor 1.846.1`]);
		expect(windmillImages([image("1.846.1"), image("1.847.0")]).join()).toContain("1.846.1, 1.847.0");
		const used = Object.values(composed().services as Record<string, { image?: string }>).map((s) => s.image ?? "");
		const windmill = used.filter((i) => i.includes("windmill-labs/windmill"));
		expect(windmill.length).toBe(3);
		expect(windmillImages(windmill)).toEqual([]);
	});

	test("the pass script carries the tag pass, a timeout of at least 5400 and no concurrent_limit, and its schedule is hourly, on the script [29]", () => {
		const s = [{ path: "x.schedule.yaml", doc: { script_path: "f/p", is_flow: false, schedule: "0 0 * * * *" } }];
		expect(passScript("f/p", { tag: "pass", timeout: 5400 }, s)).toEqual([]);
		expect(passScript("f/p", { tag: "default", timeout: 3600, concurrent_limit: 1 }, s)).toHaveLength(3);
		expect(passScript("f/p", { tag: "pass", timeout: 5400 }, [{ path: "y", doc: { script_path: "f/p", is_flow: true, schedule: "*/5 * * * *" } }])).toHaveLength(2);
		const pass = scripts.find((p) => yaml(p).tag === "pass");
		expect(pass).toBeDefined();
		const path = (pass as string).slice(wm.length).replace(/\.script\.yaml$/, "");
		expect(passScript(path, yaml(pass as string), schedules())).toEqual([]);
	});

	test("the script's last command is the ssh call; a command after it fails [43]", () => {
		expect(endsOnSsh("p.sh", "set -eu\nssh -i k runner@runner harness\n# done\n")).toEqual([]);
		expect(endsOnSsh("p.sh", "ssh runner@runner harness\necho pass_status=$?\n")).toEqual(["p.sh: ends on `echo pass_status=$?`, not the ssh call"]);
		const body = mine.filter((p) => p.startsWith(wm) && p.endsWith(".sh"));
		expect(body.length).toBe(1);
		expect(endsOnSsh(body[0], read(body[0]))).toEqual([]);
	});

	// spec: orchestrator/a-variable-with-its-value
	test("a variable file carrying a value fails, naming the file [30, 31]", () => {
		expect(variableValues([{ path: "f/k.variable.yaml", doc: { value: "x", is_secret: true } }, { path: "f/e.variable.yaml", doc: { value: "" } }])).toEqual(["f/k.variable.yaml: carries a value"]);
		const vars = mine.filter((p) => p.startsWith(wm) && p.endsWith(".variable.yaml")).map((p) => ({ path: p, doc: yaml(p) }));
		expect(variableValues(vars)).toEqual([]);
	});
});

describe("compose", () => {
	const worker = (tags?: string, replicas?: number) => ({ environment: tags ? { WORKER_TAGS: tags } : {}, deploy: { replicas } });

	test("one single-replica worker takes the tag pass, and no other does", () => {
		expect(compose({ services: { windmill_worker_pass: worker("pass", 1), windmill_worker: worker() } })).toEqual([]);
		expect(compose({ services: { windmill_worker_pass: worker("pass", 2), windmill_worker: worker("deno,pass") } })).toEqual([
			"windmill_worker_pass: replicas is not 1",
			"windmill_worker: takes the tag pass",
		]);
	});

	// spec: orchestrator/a-literal-secret-in-the-compose-file
	test("a literal value for a token, key, secret or password variable fails, naming the service [32]", () => {
		const services = { windmill_worker_pass: worker("pass", 1), db: { environment: ["POSTGRES_PASSWORD=hunter2", "POSTGRES_PASSWORD_FILE=/run/secrets/db_password"] } };
		expect(compose({ services })).toEqual(["db: POSTGRES_PASSWORD is a literal, not a secret file"]);
		expect(compose(composed())).toEqual([]);
	});
});

describe("every file under orchestrator/", () => {
	test("a tracked file other than the README that starts Remote Control fails, naming the file", () => {
		// spec: orchestrator/a-tracked-file-that-starts-remote-control
		expect(remoteControl("orchestrator/run.sh", `exec ${RC}\n`)).toEqual(["orchestrator/run.sh: starts Remote Control"]);
		expect(remoteControl("orchestrator/run.sh", `claude ${"-".repeat(2)}remote-control\n`)).toHaveLength(1);
		expect(remoteControl("orchestrator/README.md", `${RC}\n`)).toEqual([]);
		expect(mine.flatMap((p) => remoteControl(p, read(p)))).toEqual([]);
	});

	// spec: orchestrator/an-image-named-by-tag-alone
	test("a FROM or image: without @sha256: fails, naming the line [33]", () => {
		expect(pins("Dockerfile", `# ${NOTE}\nFROM debian:12\n`)).toEqual(["Dockerfile:2: no @sha256: digest"]);
	});

	// spec: orchestrator/a-pin-without-its-note
	test("a pinned line without its note fails, naming the line [34]", () => {
		expect(pins("compose.yaml", `  db:\n    image: postgres:16@sha256:${"0".repeat(64)}\n`)).toEqual(["compose.yaml:2: no note naming what moves the pin"]);
		expect(pins("compose.yaml", `    image: postgres:16@sha256:${"0".repeat(64)} # ${NOTE}\n`)).toEqual([]);
	});

	test("an ARG version that is not a full x.y.z fails [35]", () => {
		expect(pins("Dockerfile", `# ${NOTE}\nARG GH_VERSION=2.97\n`)).toEqual(["Dockerfile:2: 2.97 is not a full x.y.z"]);
	});

	test("every pin in the tree is exact and carries its note [33, 34, 35]", () => {
		const pinned = mine.filter((p) => /(?:Dockerfile|compose\.yaml)$/.test(p));
		expect(pinned.length).toBe(2);
		expect(pinned.flatMap((p) => pins(p, read(p)))).toEqual([]);
	});

	test("an IPv4 literal other than 127.0.0.1 or 0.0.0.0, or a GitHub or Anthropic token, fails [36]", () => {
		expect(leaks("a", `host ${ADDRESS}\nbind 127.0.0.1 0.0.0.0\n`)).toEqual([`a: holds the address ${ADDRESS}`]);
		expect(leaks("a", `GH_TOKEN=${GH}\n`)).toEqual(["a: holds a token"]);
		expect(mine.flatMap((p) => leaks(p, read(p)))).toEqual([]);
	});

	// spec: orchestrator/the-secrets-directory
	test("orchestrator/secrets/<file> is ignored [37]", () => {
		const ignored = (cwd: string) => Bun.spawnSync(["git", "check-ignore", "-q", "orchestrator/secrets/db_password"], { cwd }).exitCode === 0;
		const bare = emptyDir("orchestrator-layout-");
		git(bare, "init", "-q");
		writeFileSync(join(bare, ".gitignore"), "node_modules\n");
		expect(ignored(bare)).toBe(false);
		expect(ignored(root)).toBe(true);
		expect(read(".gitignore").split("\n")).toContain("orchestrator/secrets");
	});
});

describe("the runner image", () => {
	const entry = "orchestrator/runner/entrypoint.sh";
	const dockerfile = "orchestrator/runner/Dockerfile";

	test("the entrypoint writes exactly one restricted authorized_keys line naming the clones and pass.sh [38]", () => {
		const writes = read(entry).split("\n").filter((l) => l.includes("authorized_keys") && l.includes(">"));
		expect(writes).toHaveLength(1);
		for (const part of ["restrict,command=", "PASS_CLONES=/home/agent/clones", "/opt/orchestrator/pass.sh"]) expect(writes[0]).toContain(part);
		expect(writes[0]).not.toContain(">>");
	});

	test("the entrypoint exits non-zero when the public key file is missing [38]", () => {
		const r = Bun.spawnSync(["sh", join(root, entry), "true"], { env: { PATH: process.env.PATH ?? "", PUBKEY_FILE: join(emptyDir("orchestrator-key-"), "absent") } });
		expect(r.exitCode).not.toBe(0);
		expect(r.stderr.toString()).toContain("absent");
	});

	test("the entrypoint exits non-zero when the host key file is missing [38]", () => {
		const dir = emptyDir("orchestrator-key-");
		writeFileSync(join(dir, "pub"), "ssh-ed25519 AAAA engine\n");
		const r = Bun.spawnSync(["sh", join(root, entry), "true"], { env: { PATH: process.env.PATH ?? "", PUBKEY_FILE: join(dir, "pub"), HOSTKEY_FILE: join(dir, "absent") } });
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
		const compose = composed() as { services: Record<string, { secrets?: string[] }>; secrets: Record<string, unknown> };
		expect(compose.services.runner.secrets).not.toContain("gh_token");
		expect(Object.keys(compose.secrets)).not.toContain("gh_token");
		expect(read("orchestrator/README.md")).not.toContain("gh_token");
	});

	test("the image creates runner with a fixed uid and agent, and one sudoers rule naming /opt/orchestrator/as-agent [41]", () => {
		const text = read(dockerfile);
		expect(text).toMatch(/useradd[^\n]*--uid \d+[^\n]* runner\b/);
		expect(text).toMatch(/useradd[^\n]* agent\b/);
		const rules = text.split("\n").filter((l) => l.includes("NOPASSWD"));
		expect(rules).toHaveLength(1);
		expect(rules[0]).toContain("runner ALL=(agent) NOPASSWD: /opt/orchestrator/as-agent");
	});

	test("the image copies pass.sh, stop.sh and the name guard both source to /opt/orchestrator/", () => {
		const text = read(dockerfile);
		for (const file of ["pass.sh", "stop.sh", "clone-name.sh"]) expect(text).toContain(` ${file} /opt/orchestrator/${file}`);
	});

	// spec: orchestrator/a-clone-name-that-leaves-the-clones-directory
	test("the forced command hands pass.sh the engine's words split, with globbing off [38]", () => {
		const line = read(entry).split("\n").find((l) => l.includes("authorized_keys") && l.includes(">")) ?? "";
		const command = (/command="(.*?)" %s/.exec(line)?.[1] ?? "").replaceAll('\\"', '"');
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
		expect(call).toMatch(/ runner@runner [A-Za-z0-9][A-Za-z0-9._-]* [A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/);
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
		for (const part of [`chown ${uid}:${uid}`, "chmod 0400", "chmod 0500", "chown 65532:65532 tunnel_token"]) expect(text).toContain(part);
	});

	test("gives stop.sh's one invocation", () => {
		expect(read(readme)).toContain("docker compose exec -u runner runner /opt/orchestrator/stop.sh");
	});
});
