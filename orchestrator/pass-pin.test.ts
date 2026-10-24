import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanup, emptyDir, git } from "../bun/diff-budget.fixture.ts";

/**
 * `pass.sh` on the host, with a launcher set: the session's clone read
 * through it, and the pass run from the runner's own checkout of the harness
 * at the pin `main` names, in a push clone. GitHub is a directory of bare
 * repositories that git reaches through `url.<dir>.insteadOf`.
 */

afterAll(cleanup);

const script = join(import.meta.dir, "pass.sh");
const bash = Bun.which("bash") ?? "bash";
const IDLE = "board-loop: idle — nothing takeable";

/** The harness's runner at one version: its cwd, argv and environment, then an idle line. */
const runner = (version: string) =>
	`console.log(JSON.stringify({ version: ${JSON.stringify(version)}, cwd: process.cwd(), env: process.env }));\nconsole.log(${JSON.stringify(IDLE)});\n`;

function stand() {
	const root = emptyDir("orchestrator-pin-");
	const h = { root, home: join(root, "home"), clones: join(root, "clones"), secrets: join(root, "secrets"), gh: join(root, "gh"), bin: join(root, "bin"), hooks: join(root, "hooks") };
	for (const dir of [h.home, h.clones, h.secrets, h.gh, h.bin, h.hooks]) mkdirSync(dir);
	writeFileSync(join(h.secrets, "claude_oauth_token"), "throwaway\n");
	// In the runner's own config, since `pass.sh` drops every `GIT_*` it inherits.
	writeFileSync(join(h.home, ".gitconfig"), `[url "${h.gh}/"]\n\tinsteadOf = https://github.com/\n`);
	// Locking is `pass.sh`'s own tests' subject; these stand it in, so they also run where no `flock` is.
	const stub = (name: string, body: string) => {
		writeFileSync(join(h.bin, name), `#!/bin/sh\n${body}\n`);
		chmodSync(join(h.bin, name), 0o755);
	};
	stub("flock", "exit 0");
	stub("as-agent", `echo "$*" >> '${join(root, "launched")}'\ncd "$1" || exit 1\nshift\nexec "$@"`);
	// The key holder's mint: its arguments logged, one token printed.
	stub("mint", `echo "$*" >> '${join(root, "minted")}'\necho ghs_read`);
	// Real git, with what each fetch's environment held logged first.
	stub("git", `case " $* " in *" fetch "*) echo "$GIT_CONFIG_VALUE_0" >> '${join(root, "fetched")}';; esac\nexec '${Bun.which("git")}' "$@"`);
	return h;
}
type Stand = ReturnType<typeof stand>;

/** Commits `tree` to the bare repository `<owner>/<repo>` under the stand's GitHub, making it, and returns the commit. */
function publish(h: Stand, name: string, tree: Record<string, string>) {
	const bare = join(h.gh, `${name}.git`);
	const work = emptyDir("orchestrator-pin-work-");
	if (!existsSync(bare)) git(h.root, "init", "-q", "--bare", "-b", "main", bare);
	git(work, "clone", "-q", bare, ".");
	for (const [path, text] of Object.entries(tree)) {
		mkdirSync(dirname(join(work, path)), { recursive: true });
		writeFileSync(join(work, path), text);
	}
	git(work, "add", "-A");
	git(work, "-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "-qm", "c");
	git(work, "push", "-q", "origin", "HEAD:main");
	return Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: work }).stdout.toString().trim();
}

/** A repository `name` whose main pins `pin`, and its session's clone under the clones directory. */
function repository(h: Stand, name: string, pin: string, clone = "repo", extra: Record<string, string> = {}) {
	publish(h, name, { "package.json": JSON.stringify({ devDependencies: { harness: pin } }), ...extra });
	const dir = join(h.clones, clone);
	if (!existsSync(dir)) {
		git(h.root, "clone", "-q", join(h.gh, `${name}.git`), dir);
		git(dir, "remote", "set-url", "origin", `https://github.com/${name}.git`);
	}
	return dir;
}

const env = (h: Stand) => ({
	PATH: [h.bin, dirname(process.execPath), dirname(Bun.which("git") ?? "/usr/bin/git"), "/usr/bin", "/bin"].join(":"),
	HOME: h.home,
	PASS_CLONES: h.clones,
	PASS_SECRETS: h.secrets,
	PASS_AS_AGENT: join(h.bin, "as-agent"),
	PASS_HOOKS: h.hooks,
	HARNESS_GITHUB_APP_ID: "7",
	HARNESS_GITHUB_APP_MINT: join(h.bin, "mint"),
});

/** One tick for `clone`, which the engine's job says holds `named`; `null` names no repository. */
function tick(h: Stand, clone = "repo", named: string | null = "owner/repo", extra: Record<string, string> = {}) {
	const p = Bun.spawnSync([bash, script, clone, ...(named === null ? [] : [named])], { cwd: h.root, env: { ...env(h), ...extra } });
	const out = p.stdout.toString();
	const first = out.split("\n")[0];
	return { code: p.exitCode, out, ran: first.startsWith("{") ? JSON.parse(first) : undefined };
}
const stopped = (h: Stand, clone = "repo") => readFileSync(join(h.home, "orchestrator", `${clone}.stop`), "utf8");
const pinOf = (sha: string) => `github:laidrivm/harness#${sha}`;

describe("pass.sh with a launcher", () => {
	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	// spec: orchestrator/a-session-edits-the-harness-copy-in-its-clone
	test("reads the clone's origin through the launcher and runs the pinned checkout in the push clone", () => {
		const h = stand();
		const sha = publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") });
		const dir = repository(h, "owner/repo", pinOf(sha), "repo", {
			"bunfig.toml": 'preload = ["./loud.ts"]\n',
			"loud.ts": 'console.log("PRELOADED");\n',
			".env": "FROM_DOTENV=1\n",
		});
		const r = tick(h);
		expect(r.code).toBe(0);
		// Even the check that the name is a clone runs as the session user.
		expect(readFileSync(join(h.root, "launched"), "utf8")).toStartWith(`${dir} test -d ${dir}/.git\n${dir} git -C ${dir} config --get remote.origin.url\n`);
		expect(r.ran.version).toBe("one");
		expect(realpathSync(r.ran.cwd)).toBe(realpathSync(join(h.home, "push/owner/repo")));
		expect([r.ran.env.HARNESS_AS_AGENT, r.ran.env.HARNESS_CLONE]).toEqual([join(h.bin, "as-agent"), dir]);
		// The push clone's tree holds both; the runner's bun read neither.
		expect(r.out).not.toContain("PRELOADED");
		expect(r.ran.env.FROM_DOTENV).toBeUndefined();
	});

	// spec: orchestrator/the-pin-moves-on-main
	test("a pin that moved past the harness clone's last fetch is fetched before the checkout", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		expect(tick(h).ran.version).toBe("one");
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("two") })));
		expect(tick(h).ran.version).toBe("two");
	});

	// The lock is per repository, so a checkout two repositories shared could change under a running pass.
	test("each repository runs its own pin from its own harness checkout", () => {
		const h = stand();
		repository(h, "owner/one", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })), "one");
		repository(h, "owner/two", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("two") })), "two");
		expect([tick(h, "one", "owner/one").ran.version, tick(h, "two", "owner/two").ran.version]).toEqual(["one", "two"]);
		for (const name of ["one", "two"]) expect(existsSync(join(h.home, "harness/owner", name, ".git"))).toBe(true);
	});

	// spec: orchestrator/the-pin-names-no-full-commit
	test.each([
		["a short commit", "github:laidrivm/harness#abc1234"],
		["no commit", "github:laidrivm/harness"],
		["a version", "1.4.2"],
		["an upper-case commit", `github:laidrivm/harness#${"A".repeat(40)}`],
		["a commit the fetch does not bring", `github:laidrivm/harness#${"0".repeat(40)}`],
	])("%s starts no pass, and the stop file names the value", (_, pin) => {
		const h = stand();
		publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") });
		repository(h, "owner/repo", pin);
		const r = tick(h);
		expect(r.code).toBe(1);
		expect(r.ran).toBeUndefined();
		expect(stopped(h)).toContain(`'${pin}'`);
	});

	// spec: orchestrator/the-pass-reaches-github-as-the-app-alone
	test("the push clone's fetch holds a contents read token the pass never does", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		const r = tick(h);
		expect(readFileSync(join(h.root, "minted"), "utf8")).toBe("owner/repo contents=read\n");
		const header = `AUTHORIZATION: basic ${Buffer.from("x-access-token:ghs_read").toString("base64")}`;
		expect(readFileSync(join(h.root, "fetched"), "utf8").split("\n")).toContain(header);
		expect(JSON.stringify(r.ran.env)).not.toContain("ghs_read");
		expect(JSON.stringify(r.ran.env)).not.toContain(header);
	});

	test("a mint that fails starts no pass, naming the repository", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		writeFileSync(join(h.bin, "mint"), "#!/bin/sh\nexit 1\n");
		const r = tick(h);
		expect(r.code).toBe(1);
		expect(r.ran).toBeUndefined();
		expect(stopped(h)).toContain("contents read token for owner/repo");
	});

	test("two repositories whose <owner>-<repo> coincide get two push clones", () => {
		const h = stand();
		const pin = pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") }));
		repository(h, "a-b/c", pin, "first");
		repository(h, "a/b-c", pin, "second");
		const [first, second] = [tick(h, "first", "a-b/c"), tick(h, "second", "a/b-c")];
		expect(realpathSync(first.ran.cwd)).toBe(realpathSync(join(h.home, "push/a-b/c")));
		expect(realpathSync(second.ran.cwd)).toBe(realpathSync(join(h.home, "push/a/b-c")));
	});
});

/** A hook `name` in `dir`'s `.git/hooks` that leaves `marker` behind when it runs. */
function plant(dir: string, name: string, marker: string) {
	const hook = join(dir, ".git/hooks", name);
	mkdirSync(dirname(hook), { recursive: true });
	writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\n`);
	chmodSync(hook, 0o755);
}

describe("the repository the engine's job names", () => {
	// spec: orchestrator/the-sessions-clone-names-another-repository
	test("a job that names no repository starts no pass, before the session's clone is read", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		const r = tick(h, "repo", null);
		expect(r.code).toBe(2);
		expect(r.ran).toBeUndefined();
		expect(existsSync(join(h.root, "launched"))).toBe(false);
		expect(existsSync(join(h.home, "push"))).toBe(false);
	});

	test.each([["a name that is no <owner>/<repo>", "owner"], ["a third segment", "owner/repo/x"]])(
		"%s starts no pass",
		(_, named) => {
			const h = stand();
			repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
			expect(tick(h, "repo", named).code).toBe(2);
			expect(existsSync(join(h.home, "push"))).toBe(false);
		},
	);

	test("a session's clone whose origin names another repository starts no pass, and the stop file names both", () => {
		const h = stand();
		const pin = pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") }));
		repository(h, "owner/repo", pin);
		const dir = repository(h, "evil/repo", pin, "evil");
		const r = tick(h, "evil", "owner/repo");
		expect(r.code).toBe(1);
		expect(r.ran).toBeUndefined();
		expect(stopped(h, "evil")).toContain("evil/repo");
		expect(stopped(h, "evil")).toContain("owner/repo");
		expect(existsSync(join(h.home, "push"))).toBe(false);
		expect(existsSync(join(dir, ".git"))).toBe(true);
	});

	test("GitHub reads both names case-blind", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		expect(tick(h, "repo", "Owner/Repo").ran.version).toBe("one");
	});

	test("a session's clone on another host starts no pass, though it names the job's repository", () => {
		const h = stand();
		const dir = repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		git(dir, "remote", "set-url", "origin", "git@other.example:owner/repo.git");
		const r = tick(h);
		expect(r.code).toBe(1);
		expect(stopped(h)).toContain("other.example");
		expect(existsSync(join(h.home, "push"))).toBe(false);
	});

	test("an SSH origin on github.com runs", () => {
		const h = stand();
		const dir = repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		git(dir, "remote", "set-url", "origin", "git@GitHub.com:owner/repo.git");
		expect(tick(h).ran.version).toBe("one");
	});
});

describe("the runner's clones are reset each pass", () => {
	// spec: orchestrator/config-left-in-a-runner-clone
	test("a hook and a config command left in either clone never run, and both configs are rewritten", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		expect(tick(h).code).toBe(0);
		const push = join(h.home, "push/owner/repo");
		const harness = join(h.home, "harness/owner/repo");
		for (const dir of [push, harness]) {
			plant(dir, "post-checkout", join(h.root, `hooked-${dir === push ? "push" : "harness"}`));
			git(dir, "config", "core.fsmonitor", `touch '${join(h.root, "monitored")}'`);
			git(dir, "config", "core.hooksPath", ".git/hooks");
		}
		expect(tick(h).ran.version).toBe("one");
		for (const marker of ["hooked-push", "hooked-harness", "monitored"]) expect(existsSync(join(h.root, marker))).toBe(false);
		for (const dir of [push, harness]) {
			const config = readFileSync(join(dir, ".git/config"), "utf8");
			expect(config).not.toContain("fsmonitor");
			expect(config).toContain(`hooksPath = ${h.hooks}`);
			expect(readdirSync(join(dir, ".git/hooks"))).toEqual([]);
		}
		expect(Bun.spawnSync(["git", "config", "--get", "remote.origin.url"], { cwd: push }).stdout.toString().trim()).toBe(
			"https://github.com/owner/repo.git",
		);
	});

	test("git configuration in the pass's environment never reaches the runner's clones", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		const elsewhere = join(h.root, "elsewhere");
		plant(join(elsewhere, "x"), "post-checkout", join(h.root, "hooked"));
		const hooks = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: join(elsewhere, "x/.git/hooks") };
		expect(tick(h, "repo", "owner/repo", hooks).ran.version).toBe("one");
		expect(existsSync(join(h.root, "hooked"))).toBe(false);
	});

	test("a clone it cannot reset stops the pass, naming the clone", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		expect(tick(h).code).toBe(0);
		const config = join(h.home, "push/owner/repo/.git/config");
		rmSync(config);
		mkdirSync(config);
		const r = tick(h);
		expect(r.code).toBe(1);
		expect(r.ran).toBeUndefined();
		expect(stopped(h)).toContain(join(h.home, "push/owner/repo"));
	});

	test("a hooks directory that is not empty stops the pass", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		writeFileSync(join(h.hooks, "pre-push"), "#!/bin/sh\n");
		const r = tick(h);
		expect(r.code).toBe(1);
		expect(stopped(h)).toContain(h.hooks);
	});

	test("a hooks directory it cannot list stops the pass", () => {
		const h = stand();
		repository(h, "owner/repo", pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") })));
		writeFileSync(join(h.hooks, "pre-push"), "#!/bin/sh\n");
		chmodSync(h.hooks, 0o111);
		const r = tick(h);
		chmodSync(h.hooks, 0o755);
		expect(r.code).toBe(1);
		expect(stopped(h)).toContain(h.hooks);
	});
});
