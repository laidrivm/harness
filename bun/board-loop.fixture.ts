/**
 * The runner spawned in a clone of a bare `origin`, for the
 * `board-loop*.test.ts` files. Its environment has no `CLAUDECODE` (`bun test`
 * runs inside a session), a state directory and a home of its own, the
 * home's `.claude.json` trusting the clone, and a `PATH` of stubs
 * that each append their name and arguments to one log, so no case reaches
 * GitHub or a registry or starts a session.
 */
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyDir, git } from "./diff-budget.fixture.ts";
import { records as ledger } from "./goal-check.fixture.ts";

export { out } from "./goal-check.fixture.ts";

const runner = join(import.meta.dir, "board-loop.ts");
const REAL_GIT = Bun.which("git") ?? "git";

export const ONE = "## 1. Only\n\n- [ ] 1.1 a\n";
export const THREE =
	"## 1. First\n\n- [x] 1.1 a\n\n## 2. Second\n\n- [ ] 2.1 b\n\n## 3. Third\n\n- [ ] 3.1 c\n";
export const TICKED = "## 1. Only\n\n- [x] 1.1 a\n";

type Tree = Record<string, string>;

/** A complete change directory: `proposed`, as `board-state.ts` reads one. */
export const change = (slug: string, tasks = ONE, after: string[] = []): Tree => {
	const dir = `openspec/changes/${slug}`;
	return {
		[`${dir}/proposal.md`]: `# ${slug}\n`,
		[`${dir}/design.md`]: `# ${slug}\n`,
		[`${dir}/tasks.md`]: tasks,
		[`${dir}/specs/demo/spec.md`]: "# demo\n",
		[`${dir}/.openspec.yaml`]: after.length
			? `after:\n${after.map((s) => `  - ${s}\n`).join("")}`
			: "",
	};
};

/** Writes `tree` into `dir` and commits it. */
export function commit(dir: string, tree: Tree = { "note.txt": `${Math.random()}\n` }) {
	for (const [path, text] of Object.entries(tree)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	git(dir, "add", "-A");
	git(dir, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-qm", "c");
}

/**
 * A bare `origin` whose `main` holds `tree`, and a clone of it on `main`. Its
 * `package.json` names the board `Demo` unless `tree` holds one of its own.
 */
export function clone(tree: Tree = change("demo")) {
	const origin = emptyDir("board-loop-origin-");
	git(origin, "init", "-q", "--bare", "-b", "main");
	const dir = emptyDir("board-loop-clone-");
	git(dir, "init", "-q", "-b", "main");
	git(dir, "remote", "add", "origin", origin);
	commit(dir, { "package.json": '{"harness":{"board":"Demo"}}\n', ...tree });
	git(dir, "push", "-q", "origin", "main");
	return { dir, origin };
}

/** Moves `origin`'s `main` on by one commit made in another checkout. */
export function advance(origin: string, tree?: Tree) {
	const other = emptyDir("board-loop-other-");
	git(other, "clone", "-q", origin, ".");
	commit(other, tree);
	git(other, "push", "-q", "origin", "main");
}

export type Stubs = {
	/** What `gh pr list` prints, or `null` for no `gh` on `PATH`. */
	gh?: string | null;
	ghCode?: number;
	/**
	 * Seconds `gh` hangs, never answering: the stub `exec`s `sleep`, so the
	 * runner's kill ends the process holding the pipe. A delayed answer is the
	 * goal check fixture's `delay`; no runner case needs one.
	 */
	ghSleep?: number;
	/** The exit status of `bun install --frozen-lockfile`. */
	install?: number;
	/** The pinned goal check's last line, which the install writes. */
	verdict?: string;
	/** `false` for an install that leaves no pinned goal check. */
	pinned?: boolean;
	/** The session's exit status, or `null` for no `claude` on `PATH`. */
	claudeCode?: number | null;
	/** Seconds the stage session runs for before exiting. */
	sleep?: number;
	/** Whether the stage session ignores SIGTERM. */
	stubborn?: boolean;
	/** A file the stage session's child, which ignores SIGTERM, writes 8 s in. */
	orphan?: string;
	/** The same for a child of the pick session. */
	pickOrphan?: string;
	/** Whether the stage session sends the runner SIGINT, as Ctrl-C would. */
	interrupt?: boolean;
	/** Whether the stage session rewrites the pinned goal check to read `goal met`. */
	tamper?: boolean;
	/** What the pick session prints: `PICK: demo` unless given. */
	pick?: string;
	/** Seconds the pick session runs for, printing nothing. */
	pickSleep?: number;
	/** Whether the pick session leaves a child running that holds its output open. */
	pickChild?: boolean;
};

/**
 * The stub directory. `bun install` writes the pinned goal check as two lines
 * of text, and any other `bun` call prints the file it is handed, so a verdict
 * names the copy it came from.
 */
function bin(log: string, s: Stubs): string {
	const dir = emptyDir("board-loop-bin-");
	const stub = (name: string, body: string) => {
		const file = join(dir, name);
		writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> '${log}'\n${body}\n`);
		chmodSync(file, 0o755);
	};
	stub("git", `exec '${REAL_GIT}' "$@"`);
	if (s.gh !== null)
		stub("gh", `${s.ghSleep ? `exec /bin/sleep ${s.ghSleep}\n` : ""}printf '%s' '${s.gh ?? "[]"}'\nexit ${s.ghCode ?? 0}`);
	const verdict = s.verdict ?? "goal met: apply demo step 1 at abc1234";
	const pin = "node_modules/harness/bun";
	// `PATH` holds the stubs alone, hence the absolute paths.
	const write = `/bin/mkdir -p ${pin} && printf 'checking\\n%s\\n' '${verdict}' > ${pin}/goal-check.ts; `;
	stub(
		"bun",
		[
			`if [ "$1" = install ]; then ${s.pinned === false ? "" : write}echo 'the install says this'; exit ${s.install ?? 0}; fi`,
			`/bin/cat "$1"`,
		].join("\n"),
	);
	// The stage session's prompt opens with `/goal`; the pick session's does not.
	// An ignored signal stays ignored across `exec`.
	const leave = (file?: string) =>
		file ? `(trap '' TERM; /bin/sleep 8; echo late > '${file}') >/dev/null 2>&1 & ` : "";
	const child = leave(s.orphan);
	const stage = s.sleep
		? `${child}${s.interrupt ? "/bin/sleep 0.5; kill -INT $PPID; " : ""}${s.stubborn ? "trap '' TERM; " : ""}exec /bin/sleep ${s.sleep}`
		: `${child}${s.tamper ? `printf 'goal met: forged\\n' > ${pin}/goal-check.ts; ` : ""}exit ${s.claudeCode ?? 0}`;
	const pick = s.pickSleep
		? `exec /bin/sleep ${s.pickSleep}`
		: `${leave(s.pickOrphan)}${s.pickChild ? "/bin/sleep 30 2>/dev/null & " : ""}printf '%s\\n' '${s.pick ?? "PICK: demo"}'; exit ${s.claudeCode ?? 0}`;
	if (s.claudeCode !== null) stub("claude", `case "$2" in\n/goal*) ${stage} ;;\n*) ${pick} ;;\nesac`);
	return dir;
}

/**
 * A `kill` for `lowered()` whose signal 0 fails as it does for a member another
 * user owns, so a session's group reads as outliving it; real signals still go through.
 */
export const EPERM = `(pid, signal) => { if (signal === 0) throw Object.assign(new Error("EPERM"), { code: "EPERM" }); process.kill(pid, signal); }`;

/**
 * An entry module that runs one pass with the session limit lowered to `ms`,
 * which is how a case reaches the limit without waiting an hour. `kill`, the
 * source of a function, stands in for `process.kill`.
 */
export function lowered(ms: number, kill?: string): string {
	const entry = join(emptyDir("board-loop-entry-"), "entry.ts");
	const args = kill ? `${ms}, ${kill}` : String(ms);
	writeFileSync(
		entry,
		`import { pass } from ${JSON.stringify(runner)};\nprocess.exit(await pass(process.argv.slice(2), ${args}));\n`,
	);
	return entry;
}

/** A `~/.claude.json` whose `projects` trusts each of `dirs`, by real path. */
export const trusting = (...dirs: string[]) =>
	JSON.stringify({
		projects: Object.fromEntries(dirs.map((d) => [realpathSync(d), { hasTrustDialogAccepted: true }])),
	});

/**
 * One pass in `dir`, under the stubs `s`. `args` is only for the usage
 * refusal. The fixture home's `.claude.json` is `claudeJson`, `null` for none,
 * and trusts `dir` unless given.
 */
export function run(
	dir: string,
	args: string[] = [],
	s: Stubs = {},
	opts: { env?: Record<string, string>; state?: string; entry?: string; claudeJson?: string | null } = {},
) {
	const log = join(emptyDir("board-loop-log-"), "calls");
	writeFileSync(log, "");
	const state = opts.state ?? emptyDir("board-loop-state-");
	const home = emptyDir("board-loop-home-");
	const claudeJson = opts.claudeJson === undefined ? trusting(dir) : opts.claudeJson;
	if (claudeJson !== null) writeFileSync(join(home, ".claude.json"), claudeJson);
	const call = Bun.spawnSync([process.execPath, opts.entry ?? runner, ...args], {
		cwd: dir,
		env: {
			PATH: bin(log, s),
			HOME: home,
			XDG_STATE_HOME: state,
			...opts.env,
		},
	});
	const text = `${call.stdout}${call.stderr}`.trim();
	return {
		code: call.exitCode,
		text,
		last: call.stdout.toString().trim().split("\n").at(-1) ?? "",
		calls: readFileSync(log, "utf8"),
		state,
	};
}

/** The `loop` records in a state directory's ledger. */
export const records = (state: string) => ledger(state, "loop");
