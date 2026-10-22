import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
	const h = { root, home: join(root, "home"), clones: join(root, "clones"), secrets: join(root, "secrets"), gh: join(root, "gh"), bin: join(root, "bin") };
	for (const dir of [h.home, h.clones, h.secrets, h.gh, h.bin]) mkdirSync(dir);
	for (const file of ["claude_oauth_token", "gh_token"]) writeFileSync(join(h.secrets, file), "throwaway\n");
	// Locking is `pass.sh`'s own tests' subject; these stand it in, so they also run where no `flock` is.
	const stub = (name: string, body: string) => {
		writeFileSync(join(h.bin, name), `#!/bin/sh\n${body}\n`);
		chmodSync(join(h.bin, name), 0o755);
	};
	stub("flock", "exit 0");
	stub("as-agent", `echo "$*" >> '${join(root, "launched")}'\ncd "$1" || exit 1\nshift\nexec "$@"`);
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
	GIT_CONFIG_COUNT: "1",
	GIT_CONFIG_KEY_0: `url.${h.gh}/.insteadOf`,
	GIT_CONFIG_VALUE_0: "https://github.com/",
});

function tick(h: Stand, clone = "repo") {
	const p = Bun.spawnSync([bash, script, clone], { cwd: h.root, env: env(h) });
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
		expect(readFileSync(join(h.root, "launched"), "utf8")).toContain(`${dir} git -C ${dir} config --get remote.origin.url`);
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

	test("two repositories whose <owner>-<repo> coincide get two push clones", () => {
		const h = stand();
		const pin = pinOf(publish(h, "laidrivm/harness", { "bun/board-loop.ts": runner("one") }));
		repository(h, "a-b/c", pin, "first");
		repository(h, "a/b-c", pin, "second");
		const [first, second] = [tick(h, "first"), tick(h, "second")];
		expect(realpathSync(first.ran.cwd)).toBe(realpathSync(join(h.home, "push/a-b/c")));
		expect(realpathSync(second.ran.cwd)).toBe(realpathSync(join(h.home, "push/a/b-c")));
	});
});
