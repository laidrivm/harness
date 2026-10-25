import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clone, run } from "./board-loop.fixture.ts";
import { cleanup, emptyDir, ended } from "./diff-budget.fixture.ts";

/**
 * The environment a board-loop session starts with. `session()` is driven
 * straight from an entry module, since the runner refuses to start at all
 * where `CLAUDECODE` is set. [n]: `github-app-identity`'s `/zombies` ideas.
 */

afterAll(cleanup);

const module = join(import.meta.dir, "board-loop-session.ts");

/**
 * What the stub `claude` saw as its environment, the pick's (`capture`) or the
 * stage's, beside the `PATH` and `HOME` the session was started with.
 */
function seen(capture: boolean, env: Record<string, string>) {
	const dir = emptyDir("board-loop-env-");
	const file = join(dir, "env");
	// `PATH` names this directory alone, hence the absolute path.
	writeFileSync(join(dir, "claude"), `#!/bin/sh\n/usr/bin/env > '${file}'\n`);
	chmodSync(join(dir, "claude"), 0o755);
	const entry = join(dir, "entry.ts");
	writeFileSync(
		entry,
		`import { session } from ${JSON.stringify(module)};\nawait session("PICK", 60_000, process.kill, ${capture});\n`,
	);
	const given = { PATH: dir, HOME: emptyDir("board-loop-home-") };
	const run = Bun.spawnSync([process.execPath, entry], { cwd: emptyDir("board-loop-cwd-"), env: { ...given, ...env } });
	expect(run.exitCode).toBe(0);
	const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
	const split = (line: string) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const;
	return { env: new Map(lines.map(split)), given };
}

const SECRETS = {
	GH_TOKEN: "",
	GITHUB_TOKEN: "ghs_runner",
	GH_ENTERPRISE_TOKEN: "ghe_runner",
	SSH_AUTH_SOCK: "/tmp/agent.sock",
	HARNESS_GITHUB_APP_ID: "12345",
	HARNESS_GITHUB_APP_KEY: "/home/runner/app.pem",
	CLAUDECODE: "1",
	CLAUDE_PROJECT_DIR: "/elsewhere",
	SOME_OTHER_VARIABLE: "unlisted",
};

describe.each([
	["the pick session", true],
	["the stage session", false],
])("%s's environment", (_, capture) => {
	// spec: board-loop/a-token-in-the-runner-s-environment
	test.each(Object.keys(SECRETS))("holds no %s, empty or not [10–14]", (name) => {
		expect(seen(capture, SECRETS).env.has(name)).toBe(false);
	});

	// spec: board-loop/what-a-session-needs
	test("passes PATH, HOME, XDG_STATE_HOME and every LC_* unchanged, and no XLC_ALL [15][16]", () => {
		const state = emptyDir("board-loop-state-");
		const { env, given } = seen(capture, { XDG_STATE_HOME: state, LC_ALL: "C", LC_CTYPE: "en_GB.UTF-8", XLC_ALL: "x" });
		expect(["PATH", "HOME", "XDG_STATE_HOME", "LC_ALL", "LC_CTYPE", "XLC_ALL"].map((name) => env.get(name))).toEqual([
			given.PATH,
			given.HOME,
			state,
			"C",
			"en_GB.UTF-8",
			undefined,
		]);
	});

	// spec: board-loop/what-a-session-needs
	test("passes Claude's own credential, which the session cannot run without", () => {
		const { env } = seen(capture, { CLAUDE_CODE_OAUTH_TOKEN: "oauth", ANTHROPIC_API_KEY: "key" });
		expect([env.get("CLAUDE_CODE_OAUTH_TOKEN"), env.get("ANTHROPIC_API_KEY")]).toEqual(["oauth", "key"]);
	});
});

/**
 * A session through a stand-in launcher that enters the clone as `as-agent`
 * does, whose stub `claude` leaves `sleep` running and removes the clone;
 * the runner's own signals are refused, as across users. `guard` is a line
 * the launcher runs first, to fail or stall every `sh` it is asked to run.
 */
function abandoned(guard = "") {
	const dir = emptyDir("board-loop-gone-");
	const clone = join(dir, "clone");
	mkdirSync(clone);
	const pidfile = join(dir, "left-pid");
	writeFileSync(join(dir, "claude"), `#!/bin/sh\nsleep 30 >/dev/null 2>&1 &\necho $! > '${pidfile}'\ncd /\nrm -rf '${clone}'\n`);
	const launcher = join(dir, "as-agent");
	writeFileSync(launcher, `#!/bin/sh\n${guard}cd "$1" || exit 2\nshift\nexec "$@"\n`);
	for (const file of ["claude", "as-agent"]) chmodSync(join(dir, file), 0o755);
	const entry = join(dir, "entry.ts");
	const across = `() => { throw Object.assign(new Error("EPERM"), { code: "EPERM" }); }`;
	writeFileSync(
		entry,
		`import { session } from ${JSON.stringify(module)};\nconst r = await session("PICK", 60_000, ${across}, false, {}, [], [${JSON.stringify(launcher)}, ${JSON.stringify(clone)}]);\nconsole.log(JSON.stringify({ left: r.left ?? null }));\n`,
	);
	// Bounded: bun cannot fire a test's timeout while this call blocks.
	const run = Bun.spawnSync([process.execPath, entry], { cwd: dir, env: { PATH: `${dir}:/usr/bin:/bin`, HOME: emptyDir("board-loop-home-") }, timeout: 50_000 });
	const left = Number(readFileSync(pidfile, "utf8"));
	return { code: run.exitCode, left: JSON.parse(run.stdout.toString()).left, child: left };
}

/** A launcher guard whose `sh` runs the signal script with a `kill` that fails, printing `text`. */
const refusing = (text: string) => `[ "$2" = sh ] && exec /bin/sh -c "kill() { echo '${text}' >&2; return 1; }; $4" "$5" "$6"\n`;

describe("a session's group, signalled through the launcher", () => {
	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	test("a child is ended though the session removed its clone, since the signal runs from a directory that outlives it", () => {
		const r = abandoned();
		expect([r.code, r.left, ended(r.child)]).toEqual([0, null, true]);
	}, 30_000);

	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	test("a launcher that fails reads as a group still alive, never as one gone, so the child is named as left", () => {
		const r = abandoned('[ "$2" = sh ] && exit 1\n');
		try {
			expect([r.code, r.left === null, ended(r.child)]).toEqual([0, false, false]);
		} finally {
			process.kill(r.child, "SIGKILL");
		}
	}, 40_000);

	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	test("a kill the kernel refuses reads as a group still alive, so the child is named as left", () => {
		const r = abandoned(refusing("/bin/sh: 1: kill: Operation not permitted"));
		try {
			expect([r.code, r.left === null, ended(r.child)]).toEqual([0, false, false]);
		} finally {
			process.kill(r.child, "SIGKILL");
		}
	}, 40_000);

	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	test("only a kill that finds no such process reads as the group gone", () => {
		const r = abandoned(refusing("/bin/sh: 1: kill: No such process"));
		try {
			expect([r.code, r.left]).toEqual([0, null]);
		} finally {
			process.kill(r.child, "SIGKILL");
		}
	}, 40_000);

	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	test("a launcher that stalls is cut off and read as failed, so the session still returns, naming the child as left", () => {
		const start = Date.now();
		const r = abandoned('[ "$2" = sh ] && exec sleep 120\n');
		try {
			expect([r.code, r.left === null, ended(r.child), Date.now() - start < 35_000]).toEqual([0, false, false, true]);
		} finally {
			process.kill(r.child, "SIGKILL");
		}
	}, 60_000);

	// spec: orchestrator/every-command-in-the-clone-goes-through-the-launcher
	test("a launcher that ignores SIGTERM is abandoned at its bound, never awaited, so the session still returns, naming the child as left", () => {
		const start = Date.now();
		// Ignored, SIGTERM stays ignored across exec: the stand-in outlives a SIGTERM, and ends itself after 40 s.
		const r = abandoned(`[ "$2" = sh ] && exec sh -c 'trap "" TERM; sleep 40'\n`);
		try {
			expect([r.code, r.left === null, ended(r.child), Date.now() - start < 35_000]).toEqual([0, false, false, true]);
		} finally {
			process.kill(r.child, "SIGKILL");
		}
	}, 60_000);
});

describe("how a session ended", () => {
	/** What `session()` returns of a stub `claude` that prints `printed`, and the arguments the stub saw. */
	function ended(printed: string) {
		const dir = emptyDir("board-loop-result-");
		writeFileSync(join(dir, "printed"), printed);
		writeFileSync(join(dir, "claude"), `#!/bin/sh\nprintf '%s\\n' "$@" > '${dir}/argv'\ncat '${dir}/printed'\nexit 1\n`);
		chmodSync(join(dir, "claude"), 0o755);
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			`import { session } from ${JSON.stringify(module)};\nconst r = await session("PICK", 60_000, process.kill, true);\nconsole.log(JSON.stringify({ out: r.out, printed: r.printed, transient: r.transient }));\n`,
		);
		const run = Bun.spawnSync([process.execPath, entry], { cwd: dir, env: { PATH: `${dir}:/usr/bin:/bin`, HOME: dir } });
		expect(run.exitCode).toBe(0);
		return { ...JSON.parse(run.stdout.toString()), argv: readFileSync(join(dir, "argv"), "utf8").split("\n") };
	}
	/** The result object the probe of 2026-10-25 saw for an API failure, `fields` over it. */
	const result = (status: number | null, text: string, fields: Record<string, unknown> = {}) =>
		JSON.stringify({ type: "result", is_error: true, terminal_reason: "api_error", api_error_status: status, result: text, ...fields });

	test.each([
		[null, "API Error: Connection refused"],
		[529, "API Error: 529 Overloaded."],
		[500, "API Error: 500 Internal server error."],
		[429, "API Error: Request rejected (429)"],
	])("an API error answered %p is transient, and out is its result", (status, text) => {
		const r = ended(result(status, text));
		expect([r.transient, r.out]).toEqual([true, text]);
		expect(r.argv.join(" ")).toContain("--output-format json");
	});

	test.each([
		["answered 401", result(401, "Invalid API key")],
		["the usage limit at 429", result(429, "You've hit your session limit · resets 3:45pm")],
		["no error", result(null, "PICK: demo", { is_error: false })],
		["plain text", "PICK: demo\n"],
	])("a session ended on %s is not transient", (_, printed) => {
		const r = ended(printed);
		expect(r.transient).toBe(false);
		expect(r.printed).toBe(printed);
		expect(r.out).toBe(printed.startsWith("{") ? JSON.parse(printed).result : printed);
	});
});

describe("the stage session's id", () => {
	// spec: board-loop/a-step-ready-to-push
	test("is the one the PR → session table records, and the pick session gets none [25]", () => {
		const { dir } = clone();
		const r = run(dir);
		const ids = [...r.calls.matchAll(/--session-id (\S+)/g)].map((m) => m[1]);
		const [row] = readFileSync(join(r.home, "orchestrator", "pr-sessions.jsonl"), "utf8").split("\n").filter(Boolean);
		expect(ids).toEqual([JSON.parse(row).session]);
	});
});
