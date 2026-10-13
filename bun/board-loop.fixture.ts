/**
 * What the runner's test files need: a dedicated clone of a bare `origin`, and
 * the runner spawned in it as the user would start it. The environment is
 * built from what the case needs. It has no `CLAUDECODE`, because `bun test`
 * itself runs inside a session; `XDG_STATE_HOME` is a directory of its own;
 * and `PATH` holds only stubs, so no case reaches GitHub or a registry or
 * starts a session. Every stub appends its name and arguments to one log, so a
 * case reads which commands ran and in what order.
 *
 * Its own module because the cases split across three files, under the
 * 300-line cap. Each test file registers `diff-budget.fixture.ts`'s `cleanup`.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
	git(dir, "commit", "-qm", "c");
}

const identify = (dir: string) => {
	git(dir, "config", "user.email", "test@example.com");
	git(dir, "config", "user.name", "Test");
};

/** A bare `origin` whose `main` holds `tree`, and a clone of it on `main`. */
export function clone(tree: Tree = change("demo")) {
	const origin = emptyDir("board-loop-origin-");
	git(origin, "init", "-q", "--bare", "-b", "main");
	const dir = emptyDir("board-loop-clone-");
	git(dir, "init", "-q", "-b", "main");
	identify(dir);
	git(dir, "remote", "add", "origin", origin);
	commit(dir, { "package.json": "{}\n", ...tree });
	git(dir, "push", "-q", "origin", "main");
	return { dir, origin };
}

/** Moves `origin`'s `main` on by one commit made in another checkout. */
export function advance(origin: string, tree?: Tree) {
	const other = emptyDir("board-loop-other-");
	git(other, "clone", "-q", origin, ".");
	identify(other);
	commit(other, tree);
	git(other, "push", "-q", "origin", "main");
}

export type Stubs = {
	/** What `gh pr list` prints, or `null` for no `gh` on `PATH`. */
	gh?: string | null;
	ghCode?: number;
	/** The exit status of `bun install --frozen-lockfile`. */
	install?: number;
	/** The goal check's last line. Its exit status follows it, as the check's does. */
	verdict?: string;
	claudeCode?: number;
	/** Seconds the `claude` stub runs for before exiting. */
	sleep?: number;
};

/** The stub directory. `bun` answers both the install and the goal check. */
function bin(log: string, s: Stubs): string {
	const dir = emptyDir("board-loop-bin-");
	const stub = (name: string, body: string) => {
		const file = join(dir, name);
		writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> '${log}'\n${body}\n`);
		chmodSync(file, 0o755);
	};
	stub("git", `exec '${REAL_GIT}' "$@"`);
	if (s.gh !== null)
		stub("gh", `printf '%s' '${s.gh ?? "[]"}'\nexit ${s.ghCode ?? 0}`);
	const verdict = s.verdict ?? "goal met: apply demo step 1 at abc1234";
	stub(
		"bun",
		[
			`if [ "$1" = install ]; then echo 'the install says this'; exit ${s.install ?? 0}; fi`,
			`echo 'checking'`,
			`echo '${verdict}'`,
			`exit ${verdict.startsWith("goal met") ? 0 : 1}`,
		].join("\n"),
	);
	stub("claude", s.sleep ? `exec /bin/sleep ${s.sleep}` : `exit ${s.claudeCode ?? 0}`);
	return dir;
}

/**
 * An entry module that runs one pass with the session limit lowered to `ms`,
 * which is how a case reaches the limit without waiting an hour.
 */
export function lowered(ms: number): string {
	const entry = join(emptyDir("board-loop-entry-"), "entry.ts");
	writeFileSync(
		entry,
		`import { pass } from ${JSON.stringify(runner)};\nprocess.exit(await pass(process.argv.slice(2), ${ms}));\n`,
	);
	return entry;
}

/** One pass in `dir`, naming `args`, under the stubs `s`. */
export function run(
	dir: string,
	args: string[] = ["demo"],
	s: Stubs = {},
	opts: { env?: Record<string, string>; state?: string; entry?: string } = {},
) {
	const log = join(emptyDir("board-loop-log-"), "calls");
	writeFileSync(log, "");
	const state = opts.state ?? emptyDir("board-loop-state-");
	const call = Bun.spawnSync([process.execPath, opts.entry ?? runner, ...args], {
		cwd: dir,
		env: {
			PATH: bin(log, s),
			HOME: emptyDir("board-loop-home-"),
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
