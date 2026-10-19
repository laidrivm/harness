/**
 * `transcript-archive.ts` as Claude Code runs it at `SessionEnd`: what an
 * ended session leaves in the archive, with which modes and which record.
 * The faults, the lock and the prune are in `transcript-archive-faults.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
} from "node:fs";
import { join } from "node:path";
import { git } from "./command-guard.fixture.ts";
import {
	archive,
	cleanup,
	copyOf,
	event,
	machine,
	session,
} from "./transcript-archive.fixture.ts";

afterAll(cleanup);

const read = (path: string) => readFileSync(path, "utf8");
const record = (path: string) => JSON.parse(read(`${path}.meta.json`));
const today = () => new Date().toISOString().slice(0, 10);

/** Every path under `dir`, relative to it, directories included. */
const tree = (dir: string) =>
	(readdirSync(dir, { recursive: true }) as string[]).sort();

describe("an ended session's copy", () => {
	// spec: transcript-archive/a-session-with-subagents
	test("holds the transcript and every file under <id>/, byte for byte [4]", () => {
		const m = machine();
		const files = { "subagents/agent-1.jsonl": "{}\n", "tool-results/r.txt": "out" };
		const path = session(m, "s1", '{"a":1}\n', files);
		expect(archive(m, event(m, path))).toBe(0);
		const copy = copyOf(m, "s1");
		expect(read(`${copy}.jsonl`)).toBe('{"a":1}\n');
		for (const [name, body] of Object.entries(files))
			expect(read(join(copy, name))).toBe(body);
	});

	// spec: transcript-archive/a-session-with-no-sibling-directory
	test("of a session with no <id>/ has none [1]", () => {
		const m = machine();
		archive(m, event(m, session(m, "s1")));
		expect(existsSync(`${copyOf(m, "s1")}.jsonl`)).toBe(true);
		expect(existsSync(copyOf(m, "s1"))).toBe(false);
	});

	test("of an empty transcript is empty [2]", () => {
		const m = machine();
		archive(m, event(m, session(m, "s1", "")));
		expect(read(`${copyOf(m, "s1")}.jsonl`)).toBe("");
	});

	test("sits beside another session's in the same project [6]", () => {
		const m = machine();
		archive(m, event(m, session(m, "s1", "one\n")));
		archive(m, event(m, session(m, "s2", "two\n")));
		expect(read(`${copyOf(m, "s1")}.jsonl`)).toBe("one\n");
		expect(read(`${copyOf(m, "s2")}.jsonl`)).toBe("two\n");
	});

	test("keeps its source's modification time [15]", () => {
		const m = machine();
		const path = session(m, "s1");
		const then = new Date("2026-05-01T12:00:00Z");
		utimesSync(path, then, then);
		archive(m, event(m, path));
		expect(statSync(`${copyOf(m, "s1")}.jsonl`).mtimeMs).toBe(then.getTime());
	});

	test("lands under $HOME/.local/state when XDG_STATE_HOME is relative [14]", () => {
		const m = machine();
		archive(m, event(m, session(m, "s1")), { XDG_STATE_HOME: "state" });
		const home = join(m.home, ".local", "state", "harness", "transcripts");
		expect(existsSync(join(home, "-work-p", "s1.jsonl"))).toBe(true);
	});
});

describe("archiving a session again", () => {
	// spec: transcript-archive/a-resumed-session-ends-again
	test("leaves one copy of the longer transcript and the second reason [7]", () => {
		const m = machine();
		const path = session(m, "s1", "one\n");
		archive(m, event(m, path, { reason: "clear" }));
		appendFileSync(path, "two\n");
		archive(m, event(m, path, { reason: "logout" }));
		const copy = copyOf(m, "s1");
		expect(read(`${copy}.jsonl`)).toBe("one\ntwo\n");
		expect(record(copy).reason).toBe("logout");
		expect(readdirSync(join(copy, "..")).sort()).toEqual(["s1.jsonl", "s1.meta.json"]);
	});

	// spec: transcript-archive/a-resumed-session-ends-again
	test("removes from the copy a file that left <id>/ [8]", () => {
		const m = machine();
		const path = session(m, "s1", "x\n", { "subagents/a.jsonl": "a", "subagents/b.jsonl": "b" });
		archive(m, event(m, path));
		rmSync(join(path, "..", "s1", "subagents", "b.jsonl"));
		archive(m, event(m, path));
		expect(tree(copyOf(m, "s1"))).toEqual(["subagents", "subagents/a.jsonl"]);
	});

	// spec: transcript-archive/a-session-with-no-sibling-directory
	test("removes the copy's <id>/ once the source has none [8]", () => {
		const m = machine();
		const path = session(m, "s1", "x\n", { "subagents/a.jsonl": "a" });
		archive(m, event(m, path));
		rmSync(join(path, "..", "s1"), { recursive: true });
		archive(m, event(m, path));
		expect(existsSync(copyOf(m, "s1"))).toBe(false);
	});
});

describe("the archive's modes", () => {
	// spec: transcript-archive/a-permissive-umask
	test("are 0600 for each file and 0700 for each directory under umask 022 [12]", () => {
		const m = machine();
		const path = session(m, "s1", "x\n", { "subagents/a.jsonl": "a" });
		chmodSync(path, 0o644);
		archive(m, event(m, path));
		const root = join(m.state, "harness", "transcripts");
		const modes = [root, ...tree(root).map((p) => join(root, p))].map((p) => {
			const stat = statSync(p);
			return [stat.isDirectory(), stat.mode & 0o777];
		});
		expect(modes).toHaveLength(7);
		for (const [isDir, mode] of modes) expect(mode).toBe(isDir ? 0o700 : 0o600);
	});

	// spec: transcript-archive/a-permissive-umask
	test("make a transcripts/ that was 0755 0700 [13]", () => {
		const m = machine();
		const root = join(m.state, "harness", "transcripts");
		mkdirSync(root, { recursive: true, mode: 0o755 });
		chmodSync(root, 0o755);
		archive(m, event(m, session(m, "s1")));
		expect(statSync(root).mode & 0o777).toBe(0o700);
	});
});

describe("the record", () => {
	// spec: transcript-archive/a-session-on-a-branch
	test("of a session in a checkout names its cwd, branch, HEAD, reason and date [5] [17]", () => {
		const m = machine();
		git(m.cwd, "init", "-q", "-b", "spec/demo");
		git(m.cwd, "commit", "-q", "--allow-empty", "-m", "x");
		const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: m.cwd });
		archive(m, event(m, session(m, "s1"), { reason: "prompt_input_exit" }));
		expect(record(copyOf(m, "s1"))).toEqual({
			session_id: "s1",
			cwd: m.cwd,
			branch: "spec/demo",
			head: head.stdout.toString().trim(),
			reason: "prompt_input_exit",
			archived: today(),
		});
	});

	// spec: transcript-archive/a-session-outside-any-repository
	test("of a session outside any repository has a null branch and head [16]", () => {
		const m = machine();
		archive(m, event(m, session(m, "s1")));
		expect(record(copyOf(m, "s1"))).toEqual({
			session_id: "s1",
			cwd: m.cwd,
			branch: null,
			head: null,
			reason: "other",
			archived: today(),
		});
	});
});

describe("the consumer's tree", () => {
	// spec: transcript-archive/nothing-lands-in-the-tree
	test("shows nothing new in git status after a session ends there [30]", () => {
		const m = machine();
		git(m.cwd, "init", "-q", "-b", "main");
		git(m.cwd, "commit", "-q", "--allow-empty", "-m", "x");
		archive(m, event(m, session(m, "s1")), { CLAUDE_PROJECT_DIR: m.cwd });
		expect(existsSync(`${copyOf(m, "s1")}.jsonl`)).toBe(true);
		const status = Bun.spawnSync(["git", "status", "--porcelain", "--ignored"], {
			cwd: m.cwd,
		});
		expect(status.stdout.toString()).toBe("");
	});
});
