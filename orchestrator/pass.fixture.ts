import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyDir, git } from "../bun/diff-budget.fixture.ts";

/** A fabricated host for `pass.sh` and `stop.sh`: a home, a clones and a secrets directory in one temporary tree. */

export const script = join(import.meta.dir, "pass.sh");
export const bash = Bun.which("bash") ?? "bash";
export const CLAUDE = "throwaway-claude-token-4f1d";
export const GH = "throwaway-gh-token-9c2e";
/** The App's two settings a host configures: its id and the key holder's mint command, never a key's path. */
export const APP = { HARNESS_GITHUB_APP_ID: "7", HARNESS_GITHUB_APP_MINT: "sudo -n -u keyholder /opt/orchestrator/mint" };
export const URL = "https://github.com/owner/repo.git";
export const IDLE = "board-loop: idle — nothing takeable";
export const OPEN = "board-loop: open — apply demo step 1";
/** The tools `pass.sh` calls, with bun's directory, and without it. */
const tools = [Bun.which("flock"), Bun.which("git")].filter((p) => p !== null).map((p) => dirname(p));
export const NO_BUN = [...tools, "/usr/bin", "/bin"].join(":");
export const PATH = [dirname(process.execPath), NO_BUN].join(":");

/**
 * The runner a clone holds: it notes its pid, prints its environment, waits
 * while `.fake/hold` exists, then prints a last line and exits with
 * `.fake/status`. It reads its orders from files, since the pass's
 * environment is the one under test. On TERM it notes whether the file
 * `.fake/watch` names exists, and exits 143; it waits without blocking, so
 * the handler runs.
 */
const FAKE = `import { appendFileSync, existsSync, readFileSync } from "node:fs";
appendFileSync(".fake/started", process.pid + "\\n");
process.on("SIGTERM", () => {
	const watched = existsSync(".fake/watch") && existsSync(readFileSync(".fake/watch", "utf8"));
	appendFileSync(".fake/termed", watched ? "present\\n" : "absent\\n");
	process.exit(143);
});
console.log(JSON.stringify(process.env));
while (existsSync(".fake/hold")) await Bun.sleep(20);
const status = Number(readFileSync(".fake/status", "utf8"));
console.log(existsSync(".fake/line") ? readFileSync(".fake/line", "utf8") : status === 0 ? ${JSON.stringify(IDLE)} : ${JSON.stringify(OPEN)});
process.exit(status);
`;

export type Host = { root: string; home: string; clones: string; secrets: string; state: string };

export function host(): Host {
	const root = emptyDir("orchestrator-pass-");
	const h = { root, home: join(root, "home"), clones: join(root, "clones"), secrets: join(root, "secrets") };
	for (const dir of [h.home, h.clones, h.secrets]) mkdirSync(dir);
	writeFileSync(join(h.secrets, "claude_oauth_token"), `${CLAUDE}\n`);
	return { ...h, state: join(h.home, "orchestrator") };
}

/** A clone named `name` whose `origin` is `url` and whose runner exits `status`, holding when `hold`. */
export function clone(h: Host, name: string, { url = URL, status = 0, hold = false } = {}) {
	const dir = join(h.clones, name);
	mkdirSync(join(dir, "node_modules/harness/bun"), { recursive: true });
	mkdirSync(join(dir, ".fake"));
	git(dir, "init", "-q");
	git(dir, "remote", "add", "origin", url);
	writeFileSync(join(dir, "node_modules/harness/bun/board-loop.ts"), FAKE);
	writeFileSync(join(dir, ".fake/status"), String(status));
	if (hold) writeFileSync(join(dir, ".fake/hold"), "");
	return dir;
}

export const env = (h: Host, extra: Record<string, string> = {}, path = PATH) => ({
	PATH: path,
	HOME: h.home,
	PASS_CLONES: h.clones,
	PASS_SECRETS: h.secrets,
	...APP,
	...extra,
});

/** One tick, run to its end. */
export function tick(h: Host, name: string, extra?: Record<string, string>, path?: string) {
	const p = Bun.spawnSync([bash, script, name], { cwd: h.root, env: env(h, extra, path) });
	const out = p.stdout.toString();
	return { code: p.exitCode, out, last: out.trim().split("\n").at(-1) ?? "", err: p.stderr.toString() };
}

/**
 * A tick left running, resolved once its runner has started and is holding.
 * `lead` starts it through `setsid`, as the forced command makes it a session
 * leader on the host, so its pid names its process group.
 */
export async function running(h: Host, name: string, lead = false) {
	const p = Bun.spawn([...(lead ? [Bun.which("setsid") ?? "setsid"] : []), bash, script, name], { cwd: h.root, env: env(h), stdout: "pipe" });
	const started = join(h.clones, name, ".fake/started");
	while (!existsSync(started)) {
		if (p.exitCode !== null) throw new Error(`the tick ended with ${p.exitCode} before its runner started`);
		await Bun.sleep(20);
	}
	return p;
}

/** Lets the runner in `name` finish, and waits for its tick. */
export async function release(h: Host, name: string, p: ReturnType<typeof Bun.spawn>) {
	rmSync(join(h.clones, name, ".fake/hold"));
	return p.exited;
}

export const starts = (h: Host, name: string) => {
	const file = join(h.clones, name, ".fake/started");
	return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").length : 0;
};
export const stop = (h: Host, name: string) => join(h.state, `${name}.stop`);
export const lock = (h: Host) => join(h.state, "locks/owner+repo.lock");
/** The environment the runner printed, its first line of output. */
export const passEnv = (out: string): Record<string, string> => JSON.parse(out.split("\n")[0]);

// No `flock` on macOS: these run on Linux. In CI they never skip, so a missing `flock` fails them there.
export const skip = !Bun.which("flock") && !process.env.CI;
