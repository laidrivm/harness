import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyDir, git } from "../bun/diff-budget.fixture.ts";

/**
 * A fabricated host for `pass.sh` with a launcher set: the session's clone
 * read through it, and the pass run from the runner's own checkout of the
 * harness at the pin `main` names, in a push clone. GitHub is a directory of
 * bare repositories that git reaches through `url.<dir>.insteadOf`.
 */

const script = join(import.meta.dir, "pass.sh");
const bash = Bun.which("bash") ?? "bash";
export const IDLE = "board-loop: idle — nothing takeable";

/** The harness's runner at one version: its cwd, argv and environment, then an idle line. */
export const runner = (version: string) =>
	`console.log(JSON.stringify({ version: ${JSON.stringify(version)}, cwd: process.cwd(), env: process.env }));\nconsole.log(${JSON.stringify(IDLE)});\n`;

export function stand() {
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
export type Stand = ReturnType<typeof stand>;

/** Commits `tree` to the bare repository `<owner>/<repo>` under the stand's GitHub, making it, and returns the commit. */
export function publish(h: Stand, name: string, tree: Record<string, string>) {
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
export function repository(h: Stand, name: string, pin: string, clone = "repo", extra: Record<string, string> = {}) {
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
export function tick(h: Stand, clone = "repo", named: string | null = "owner/repo", extra: Record<string, string> = {}) {
	const p = Bun.spawnSync([bash, script, clone, ...(named === null ? [] : [named])], { cwd: h.root, env: { ...env(h), ...extra } });
	const out = p.stdout.toString();
	const first = out.split("\n")[0];
	return { code: p.exitCode, out, ran: first.startsWith("{") ? JSON.parse(first) : undefined };
}
export const stopped = (h: Stand, clone = "repo") => readFileSync(join(h.home, "orchestrator", `${clone}.stop`), "utf8");
export const pinOf = (sha: string) => `github:laidrivm/harness#${sha}`;
