/**
 * What the CI flow's test files share: the event handler run as the engine
 * runs it, against a stand-in for GitHub's API, and a host to run it on.
 * `start` and `stop` are not registered here: each test file registers them,
 * and `diff-budget.fixture.ts`'s `cleanup`, itself. [n]: `ci-run-agent`'s
 * `/zombies` items.
 */
import { expect } from "bun:test";
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir, git } from "./diff-budget.fixture.ts";
import { append } from "./pr-sessions.ts";

const HANDLER = join(import.meta.dir, "on-event.ts");
export const SECRET = "s3cret-of-the-webhook";
/** The commit `feat/x` and `spec/x` point at on the host's origin, set by `host()`. */
export let SHA = "";
export const BOT = "loop-app[bot]";
export const ATTEMPT = "`harness-ci-attempt`";
export const LIMIT = "`harness-ci-limit`";
export const BLOCKED = "the session answered blocked, nothing pushed";

export type Comment = { user: { login: string }; body: string };

/** What the stand-in answers, and what it was asked to post. */
export let api: {
	latest: Record<string, unknown>;
	pulls: { number: number; user: { login: string }; head: { sha: string } }[];
	comments: Comment[];
	posted: string[];
	permissions: unknown;
	failPost: boolean;
};
let server: ReturnType<typeof Bun.serve>;
export let key = "";
/** A `flock` that takes no lock and runs its command, one that reports its bound reached, and the real one alone. */
export let free = "";
export let bound = "";
export let real = "";
/** A `claude` and a `gh` that record what they were given, in the session's `HOME`. */
let stubs = "";

export function start() {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const { pathname, searchParams } = new URL(req.url);
			const body = req.method === "POST" ? await req.json() : undefined;
			if (pathname === "/app") return Response.json({ slug: "loop-app" });
			if (pathname === `/users/${encodeURIComponent(BOT)}`) return Response.json({ id: 42 });
			if (pathname === "/repos/o/r/installation") return Response.json({ id: 9 });
			if (pathname === "/app/installations/9/access_tokens") {
				api.permissions = body.permissions;
				return Response.json({ token: "installation-token" });
			}
			if (pathname === "/repos/o/r/actions/runs/5") return Response.json(api.latest);
			if (pathname === "/repos/o/r/pulls") return Response.json(api.pulls);
			if (pathname === "/repos/o/r/issues/7/comments") {
				if (req.method === "GET") {
					const [page, per] = [Number(searchParams.get("page") ?? 1), Number(searchParams.get("per_page") ?? 30)];
					return Response.json(api.comments.slice((page - 1) * per, page * per));
				}
				if (api.failPost) return new Response("down", { status: 500 });
				// The next read sees it, as GitHub's does.
				api.comments.push({ user: { login: BOT }, body: body.body });
				api.posted.push(body.body);
				return Response.json({});
			}
			return new Response("unknown", { status: 404 });
		},
	});
	key = join(emptyDir("ci-run-key-"), "app.pem");
	const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
	writeFileSync(key, privateKey, { mode: 0o600 });
	free = emptyDir("ci-run-flock-");
	writeFileSync(join(free, "flock"), '#!/bin/sh\nshift 5\nexec "$@"\n', { mode: 0o755 });
	bound = emptyDir("ci-run-bound-");
	writeFileSync(join(bound, "flock"), "#!/bin/sh\nexit 75\n", { mode: 0o755 });
	// Only `flock` from its directory: the real `gh` or `claude` beside it must never run here.
	real = emptyDir("ci-run-real-");
	const flock = Bun.which("flock");
	if (flock) symlinkSync(flock, join(real, "flock"));
	stubs = emptyDir("ci-run-stubs-");
	writeFileSync(
		join(stubs, "claude"),
		'#!/bin/sh\nprintf \'%s\\n\' "$@" > "$HOME/claude-argv"\nenv > "$HOME/claude-env"\npwd -P > "$HOME/claude-pwd"\n' +
			'[ -f "$HOME/claude-act" ] && . "$HOME/claude-act"\ncat "$HOME/claude-out" 2>/dev/null\nexit 0\n',
		{ mode: 0o755 },
	);
	writeFileSync(
		join(stubs, "gh"),
		'#!/bin/sh\necho "$*" >> "$HOME/gh-calls"\n[ "$1 $2" = "pr ready" ] && [ -f "$HOME/gh-refuse" ] && exit 1\n' +
			'[ "$1 $2" = "run view" ] && echo "the failed job\'s log"\nexit 0\n',
		{ mode: 0o755 },
	);
}
export const stop = () => server.stop(true);

/**
 * A host with a secret, the App's settings, a clone of o/r on `main`, and the
 * table's line for `feat/x`. GitHub's URL for o/r reaches a bare repository
 * whose `feat/x` and `spec/x` are the clone's commit, `SHA`.
 */
export function host(origin = "https://github.com/o/r.git") {
	const root = emptyDir("ci-run-");
	const home = join(root, "home");
	mkdirSync(home);
	const secrets = join(root, "secrets");
	mkdirSync(secrets);
	writeFileSync(join(secrets, "github_webhook_secret"), SECRET);
	const bare = join(root, "origin.git");
	git(root, "init", "-q", "--bare", bare);
	const clone = join(root, "clone");
	mkdirSync(clone);
	git(clone, "init", "-q", "-b", "main");
	git(clone, "config", "user.name", "t");
	git(clone, "config", "user.email", "t@t");
	writeFileSync(join(clone, "a.txt"), "a\n");
	git(clone, "add", "a.txt");
	git(clone, "commit", "-qm", "a");
	git(clone, "remote", "add", "origin", origin);
	git(clone, "config", `url.${bare}.insteadOf`, "https://github.com/o/r.git");
	git(clone, "push", "-q", bare, "HEAD:refs/heads/main", "HEAD:refs/heads/feat/x", "HEAD:refs/heads/spec/x");
	SHA = rev(clone, "HEAD");
	const session = randomUUID();
	for (const branch of ["feat/x", "spec/x"])
		append({ repo: "o/r", branch, session, clone }, join(home, "orchestrator", "pr-sessions.jsonl"));
	writeFileSync(join(home, "claude-out"), answer("blocked"));
	api = {
		latest: { run_attempt: 1, conclusion: "failure" },
		pulls: [{ number: 7, user: { login: BOT }, head: { sha: SHA } }],
		comments: [],
		posted: [],
		permissions: undefined,
		failPost: false,
	};
	return { root, home, secrets, clone, bare, session, logs: join(root, "ci-logs") };
}

/** `git rev-parse`'s answer in `dir`, or "" when it fails. */
export const rev = (dir: string, ...args: string[]) =>
	Bun.spawnSync(["git", "-C", dir, "rev-parse", ...args]).stdout.toString().trim();

/** What `claude --output-format json` prints for a structured answer. */
export const answer = (outcome: string) =>
	JSON.stringify({ type: "result", structured_output: { outcome, summary: "what the session did" } });

export type Host = ReturnType<typeof host>;

/** A `workflow_run` delivery: a failed run of o/r on `feat/x`, with `run` merged over it. */
export const payload = (run: Record<string, unknown> = {}, top: Record<string, unknown> = {}) =>
	JSON.stringify({
		action: "completed",
		repository: { full_name: "o/r", default_branch: "main" },
		workflow_run: {
			id: 5,
			conclusion: "failure",
			run_attempt: 1,
			head_sha: SHA,
			head_branch: "feat/x",
			event: "pull_request",
			html_url: "https://github.com/o/r/actions/runs/5",
			head_repository: { full_name: "o/r" },
			...run,
		},
		...top,
	});

/** Runs the handler on `body` with the App's settings, `flock` from `tools` first on PATH, then the stubs. */
export async function deliver(h: Host, body: string, opts: { delivery?: string; env?: Record<string, string>; tools?: string } = {}) {
	const delivery = opts.delivery ?? randomUUID();
	const signature = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
	const p = Bun.spawn(["bun", HANDLER, `workflow_run ${delivery} ${signature}`], {
		stdin: new Blob([body]),
		stdout: "pipe",
		stderr: "pipe",
		env: {
			PATH: `${opts.tools ?? free}:${stubs}:${process.env.PATH}`,
			HOME: h.home,
			PASS_SECRETS: h.secrets,
			HARNESS_CI_LOGS: h.logs,
			GITHUB_API_URL: server.url.origin,
			HARNESS_GITHUB_APP_ID: "1",
			HARNESS_GITHUB_APP_KEY: key,
			...opts.env,
		},
	});
	const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
	const marker = join(h.home, "orchestrator", "deliveries", delivery);
	let held: string | undefined;
	try {
		held = readFileSync(marker, "utf8");
	} catch {}
	return { line: out.trim(), code, delivery, held };
}

export const ignored = (r: { line: string; code: number }, reason: RegExp) => {
	expect(r.line).toMatch(/^event: ignored — /);
	expect(r.line).toMatch(reason);
	expect(r.code).toBe(0);
};
