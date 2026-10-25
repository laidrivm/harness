import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyDir } from "../bun/diff-budget.fixture.ts";

/**
 * A fabricated host for `deploy.sh`: stub `git`, `docker`, `curl`, `flock` and
 * `chown` on `PATH` that log their arguments to `log` and answer from files in
 * the fake directory, the runner's and the agent's volumes as two
 * directories, and the state directory, not yet made.
 */

export const script = join(import.meta.dir, "deploy.sh");
export const bash = Bun.which("bash") ?? "bash";
export const HEAD = "0123456789abcdef0123456789abcdef01234567";
const SERVER = `ghcr.io/windmill-labs/windmill:1.846.1@sha256:${"1".repeat(64)}`;

// Each stub logs its name and arguments; `code <file>` reads an exit code, 0 when the file is absent.
const PRELUDE = `#!/usr/bin/env bash
printf '%s\\n' "\${0##*/} $*" >>"$FAKE/log"
code() { cat "$FAKE/$1" 2>/dev/null || echo 0; }
`;

const STUBS: Record<string, string> = {
	git: `case $1 in
fetch) exit "$(code fetch)" ;;
config) echo https://github.com/owner/repo.git ;;
rev-parse) if [ "$2" = HEAD ] && [ -e "$FAKE/local" ]; then cat "$FAKE/local"; else cat "$FAKE/head"; fi ;;
merge) exit "$(code merge)" ;;
status) cat "$FAKE/status" 2>/dev/null || true ;;
esac`,
	// The nth read answers runs.<n>, or runs when there is none.
	curl: `n=$(( $(cat "$FAKE/reads" 2>/dev/null || echo 0) + 1 ))
echo "$n" >"$FAKE/reads"
[ "$(code curl)" = 0 ] || exit 22
cat "$FAKE/runs.$n" 2>/dev/null || cat "$FAKE/runs"`,
	// \`up\` notes, from its own process, whether each lock file is still held.
	docker: `case "$1 $2" in
"compose build") exit "$(code build)" ;;
"compose up")
	if [ -n "$REAL_FLOCK" ]; then
		for f in "$LOCKS"/*.lock; do "$REAL_FLOCK" -n "$f" true && echo "free \${f##*/}" || echo "held \${f##*/}"; done >>"$FAKE/log"
	fi
	exit "$(code up)" ;;
"compose config") printf '{"services":{"windmill_server":{"image":"%s"}}}' "$(cat "$FAKE/server")" ;;
"volume inspect") echo "$FAKE/\${!#}" ;;
"image prune") ;;
"run --rm")
	while [ $# -gt 0 ]; do
		case $1 in --entrypoint) entry=$2; shift ;; orchestrator-runner) shift; break ;; esac
		shift
	done
	case $entry in jq) exec jq "$@" ;; curl) exit "$(code engine)" ;; *) exit "$(code push)" ;; esac ;;
esac`,
	flock: `[ -z "$REAL_FLOCK" ] || exec "$REAL_FLOCK" "$@"`,
	chown: "",
};

export type Host = { fake: string; state: string; runner: string; agent: string; locks: string };

/** A host whose origin/main is at HEAD, with clones `one` and `two` and the lock file of one repository. */
export function host(): Host {
	const root = emptyDir("orchestrator-deploy-");
	const fake = join(root, "fake");
	const bin = join(fake, "bin");
	const runner = join(fake, "orchestrator_runner_home");
	const agent = join(fake, "orchestrator_agent_home");
	const locks = join(runner, "orchestrator/locks");
	for (const dir of [bin, locks, join(agent, "clones/one"), join(agent, "clones/two")]) mkdirSync(dir, { recursive: true });
	for (const [name, body] of Object.entries(STUBS)) writeFileSync(join(bin, name), PRELUDE + body + "\n", { mode: 0o755 });
	writeFileSync(join(fake, "head"), `${HEAD}\n`);
	writeFileSync(join(fake, "server"), SERVER);
	writeFileSync(join(locks, "owner+repo.lock"), "");
	answer({ fake } as Host, "success");
	return { fake, state: join(root, "state/harness-deploy"), runner, agent, locks };
}

/** A latest `test` run from `app` in the given state; `undefined` for none at all. */
export const runs = (conclusion: string | null | undefined, app = "github-actions") =>
	JSON.stringify({ check_runs: conclusion === undefined ? [] : [{ name: "test", app: { slug: app }, conclusion }] });

/** What the check read answers: every read, or only the nth. */
export function answer(h: Host, conclusion: string | null | undefined, app?: string, nth?: number) {
	writeFileSync(join(h.fake, nth ? `runs.${nth}` : "runs"), runs(conclusion, app));
}

/** Sets a stub's answer file: an exit code, or the output it prints. */
export const set = (h: Host, file: string, value: string | number) => writeFileSync(join(h.fake, file), String(value));

/** jq's directory: the stub `docker run` hands jq's runs to the real one. */
const tools = [Bun.which("jq")].filter((p) => p !== null).map((p) => dirname(p));
const env = (h: Host, extra: Record<string, string>) => ({
	PATH: [join(h.fake, "bin"), ...tools, "/usr/bin", "/bin"].join(":"),
	FAKE: h.fake,
	LOCKS: h.locks,
	STATE_DIRECTORY: h.state,
	...extra,
});

/** One run, to its end. */
export function deploy(h: Host, extra: Record<string, string> = {}) {
	const p = Bun.spawnSync([bash, script], { env: env(h, extra) });
	return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}

/** One run left going, with real `flock` under the stub. */
export const started = (h: Host, flock: string) => Bun.spawn([bash, script], { env: env(h, { REAL_FLOCK: flock }), stdout: "pipe", stderr: "pipe" });

export const log = (h: Host) => (existsSync(join(h.fake, "log")) ? readFileSync(join(h.fake, "log"), "utf8").trim().split("\n") : []);

/** The log as the steps a reader names, jq's runs and the reads of state dropped, a step repeated once. */
export function steps(h: Host) {
	const named: [RegExp, string][] = [
		[/^curl .*check-runs/, "read"],
		[/^git merge /, "ff"],
		[/^docker compose build/, "build"],
		[/^flock /, "hold"],
		[/^docker compose up -d/, "up"],
		[/^docker image prune/, "prune"],
		[/^docker run .*--entrypoint curl/, "wait"],
		[/^docker run .*--entrypoint sh/, "push"],
	];
	const out: string[] = [];
	for (const line of log(h)) {
		const step = named.find(([re]) => re.test(line))?.[1];
		if (step && out.at(-1) !== step) out.push(step);
	}
	return out;
}

export const deployed = (h: Host) => (existsSync(join(h.state, "deployed")) ? readFileSync(join(h.state, "deployed"), "utf8") : undefined);
export const stopOf = (h: Host, clone: string) => join(h.runner, "orchestrator", `${clone}.stop`);
export const stopped = (h: Host, clone: string) => (existsSync(stopOf(h, clone)) ? readFileSync(stopOf(h, clone), "utf8") : undefined);
