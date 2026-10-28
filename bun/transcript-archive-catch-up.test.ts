/**
 * `transcript-archive.ts --catch-up`, which the wrap-up runs: it archives
 * every session under Claude Code's `projects/` that no hook archived, or
 * whose copy has fallen behind, and prints one count line.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	appendFileSync,
	chmodSync,
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { git } from "./command-guard.fixture.ts";
import {
	ago,
	archive,
	catchUp,
	cleanup,
	copyOf,
	DAY,
	event,
	machine,
	put,
	session,
} from "./transcript-archive.fixture.ts";

afterAll(cleanup);
const read = (path: string) => readFileSync(path, "utf8");
const record = (path: string) => JSON.parse(read(`${path}.meta.json`));
const today = () => new Date().toISOString().slice(0, 10);
const line = (archived: number, skipped: number, pruned: number, failed: number) =>
	`catch-up: archived ${archived}, skipped ${skipped}, pruned ${pruned}, failed ${failed}\n`;
/** A transcript line as Claude Code writes it, with its `cwd` and `gitBranch`. */
const turn = (cwd: string, gitBranch: string) =>
	`${JSON.stringify({ type: "user", cwd, gitBranch, sessionId: "s1" })}\n`;
/** Sets the `archived` date of session `id`'s record back to a past day. */
function backdate(copy: string): void {
	writeFileSync(`${copy}.meta.json`, JSON.stringify({ ...record(copy), archived: "2026-01-01" }));
}

describe("a catch-up", () => {
	test("over no projects/ prints a line of zeros and exits 0 [3] [18]", () => {
		const m = machine();
		expect(catchUp(m)).toEqual({ code: 0, out: line(0, 0, 0, 0) });
	});

	// spec: transcript-archive/a-session-the-board-loop-killed
	test("archives a killed session with the transcript's last cwd and branch, and a null head [27]", () => {
		const m = machine();
		session(m, "s1", turn("/w/a", "feat/a") + turn("/w/b", "feat/b"), { "subagents/a.jsonl": "a" });
		expect(catchUp(m)).toEqual({ code: 0, out: line(1, 0, 0, 0) });
		expect(read(join(copyOf(m, "s1"), "subagents", "a.jsonl"))).toBe("a");
		expect(record(copyOf(m, "s1"))).toEqual({
			session_id: "s1",
			cwd: "/w/b",
			branch: "feat/b",
			head: null,
			reason: "catch-up",
			archived: today(),
		});
	});

	test("gives null cwd and branch to a transcript that carries neither [26]", () => {
		const m = machine();
		session(m, "s1", '{"type":"summary"}\nnot json\n');
		catchUp(m);
		expect(record(copyOf(m, "s1"))).toMatchObject({ cwd: null, branch: null, reason: "catch-up" });
	});

	// spec: transcript-archive/a-transcript-that-lagged-its-hook
	test("re-copies a transcript that grew after its hook, keeping the hook's record [28]", () => {
		const m = machine();
		const path = session(m, "s1", "one\n");
		archive(m, event(m, path, { reason: "logout" }));
		appendFileSync(path, "two\n");
		expect(catchUp(m).out).toBe(line(1, 0, 0, 0));
		expect(read(`${copyOf(m, "s1")}.jsonl`)).toBe("one\ntwo\n");
		expect(record(copyOf(m, "s1"))).toMatchObject({ cwd: m.cwd, reason: "logout" });
	});

	// spec: transcript-archive/an-unchanged-session
	test("skips an unchanged session and rewrites neither copy nor record [29]", () => {
		const m = machine();
		const path = session(m, "s1", "x\n", { "tool-results/r.txt": "r" });
		archive(m, event(m, path));
		const copy = copyOf(m, "s1");
		// Every write is a rename onto the name, so an unchanged inode is an unwritten file.
		const files = [`${copy}.jsonl`, `${copy}.meta.json`, join(copy, "tool-results", "r.txt")];
		const before = files.map((file) => statSync(file).ino);
		expect(catchUp(m).out).toBe(line(0, 1, 0, 0));
		expect(files.map((file) => statSync(file).ino)).toEqual(before);
	});

	// spec: transcript-archive/a-copy-whose-record-was-never-written
	test("gives a record to a matching copy that has none", () => {
		const m = machine();
		archive(m, event(m, session(m, "s1")));
		rmSync(`${copyOf(m, "s1")}.meta.json`);
		expect(catchUp(m).out).toBe(line(1, 0, 0, 0));
		expect(record(copyOf(m, "s1")).reason).toBe("catch-up");
	});

	// spec: transcript-archive/a-record-that-does-not-parse
	test.each([["not JSON", "{"], ["a JSON array", "[]"]])(
		"writes a whole catch-up record over one that is %s [41]",
		(_, text) => {
			const m = machine();
			archive(m, event(m, session(m, "s1"), { reason: "logout" }));
			writeFileSync(`${copyOf(m, "s1")}.meta.json`, text);
			catchUp(m);
			expect(record(copyOf(m, "s1"))).toMatchObject({ reason: "catch-up", head: null, archived: today() });
		},
	);

	// spec: transcript-archive/a-change-under-the-sibling-directory-only
	test("copies a file added under <id>/ and removes one gone from it, the transcript unchanged", () => {
		const m = machine();
		const path = session(m, "s1", "x\n", { "subagents/a.jsonl": "a", "subagents/b.jsonl": "b" });
		archive(m, event(m, path));
		put(join(path, "..", "s1", "subagents", "c.jsonl"), "c");
		rmSync(join(path, "..", "s1", "subagents", "b.jsonl"));
		expect(catchUp(m).out).toBe(line(1, 0, 0, 0));
		expect(readdirSync(join(copyOf(m, "s1"), "subagents")).sort()).toEqual(["a.jsonl", "c.jsonl"]);
	});

	// spec: transcript-archive/one-unreadable-session
	// Root reads a mode-000 file, so the case would archive both sessions.
	test.skipIf(process.getuid?.() === 0)(
		"archives the others when one transcript cannot be read, counting one failure [25] (skipped as root, which reads it anyway)",
		() => {
			const m = machine();
			const bad = session(m, "s1");
			session(m, "s2", "ok\n", {}, "-work-q");
			chmodSync(bad, 0o000);
			const run = catchUp(m);
			chmodSync(bad, 0o600);
			expect(run).toEqual({ code: 0, out: line(1, 0, 0, 1) });
			expect(read(`${copyOf(m, "s2", "-work-q")}.jsonl`)).toBe("ok\n");
		},
	);

	// Root reads a mode-000 directory, so the case would pass without the catch.
	test.skipIf(process.getuid?.() === 0)(
		"archives and prunes the others when a project directory cannot be listed, counting one failure (skipped as root, which lists it anyway)",
		() => {
			const m = machine();
			const bad = join(session(m, "s1"), "..");
			session(m, "s2", "ok\n", {}, "-work-q");
			const old = join(m.state, "harness", "transcripts", "-gone-clone", "old.jsonl");
			put(old, "x");
			utimesSync(old, ago(181 * DAY), ago(181 * DAY));
			chmodSync(bad, 0o000);
			const run = catchUp(m);
			chmodSync(bad, 0o700);
			expect(run).toEqual({ code: 0, out: line(1, 0, 1, 1) });
			expect(read(`${copyOf(m, "s2", "-work-q")}.jsonl`)).toBe("ok\n");
			expect(existsSync(old)).toBe(false);
		},
	);

	// spec: transcript-archive/a-live-transcript-past-the-period
	test("neither archives nor fails a live transcript last modified 181 days ago [11]", () => {
		const m = machine();
		const path = session(m, "s1");
		utimesSync(path, ago(181 * DAY), ago(181 * DAY));
		expect(catchUp(m).out).toBe(line(0, 0, 0, 0));
		expect(existsSync(`${copyOf(m, "s1")}.jsonl`)).toBe(false);
	});

	// spec: transcript-archive/a-session-past-the-period
	test("prunes a copy past the period in a project with no live session", () => {
		const m = machine();
		const old = join(m.state, "harness", "transcripts", "-gone-clone", "old.jsonl");
		put(old, "x");
		utimesSync(old, ago(181 * DAY), ago(181 * DAY));
		expect(catchUp(m).out).toBe(line(0, 0, 1, 0));
		expect(existsSync(old)).toBe(false);
	});
});

describe("a catch-up beside the hook", () => {
	// spec: transcript-archive/two-exports-of-one-session-at-once
	test("skips and counts a session another export holds [39]", () => {
		const m = machine();
		session(m, "s1");
		put(`${copyOf(m, "s1")}.lock`, "");
		expect(catchUp(m).out).toBe(line(0, 1, 0, 0));
		expect(existsSync(`${copyOf(m, "s1")}.jsonl`)).toBe(false);
	});

	// spec: transcript-archive/two-exports-of-one-session-at-once
	test("leaves the hook's record whichever of the two exports runs first [39]", () => {
		const m = machine();
		const first = session(m, "s1", "x\n");
		catchUp(m);
		archive(m, event(m, first, { reason: "logout" }));
		expect(record(copyOf(m, "s1")).reason).toBe("logout");
		const second = session(m, "s2", "x\n");
		archive(m, event(m, second, { reason: "clear" }));
		appendFileSync(second, "y\n");
		catchUp(m);
		expect(record(copyOf(m, "s2")).reason).toBe("clear");
	});

	// spec: transcript-archive/a-catch-up-record-after-a-branch-switch
	test("refreshes a catch-up record's branch and date after a branch switch [40]", () => {
		const m = machine();
		const path = session(m, "s1", turn("/w", "feat/a"));
		catchUp(m);
		backdate(copyOf(m, "s1"));
		appendFileSync(path, turn("/w", "feat/b"));
		catchUp(m);
		expect(record(copyOf(m, "s1"))).toMatchObject({ branch: "feat/b", archived: today() });
	});

	test("keeps a hook record's cwd, branch, head and reason, giving it the new date [40]", () => {
		const m = machine();
		git(m.cwd, "init", "-q", "-b", "spec/demo");
		git(m.cwd, "commit", "-q", "--allow-empty", "-m", "x");
		const path = session(m, "s1", turn(m.cwd, "spec/demo"));
		archive(m, event(m, path, { reason: "prompt_input_exit" }));
		const hook = record(copyOf(m, "s1"));
		backdate(copyOf(m, "s1"));
		appendFileSync(path, turn("/elsewhere", "feat/other"));
		catchUp(m);
		expect(record(copyOf(m, "s1"))).toEqual({ ...hook, archived: today() });
	});
});

describe("the wrap-up", () => {
	const skill = read(join(import.meta.dir, "..", "core", "skills", "session-wrapup", "SKILL.md"));
	const commands = [
		"bun bun/transcript-archive.ts --catch-up",
		"bun node_modules/harness/bun/transcript-archive.ts --catch-up",
	];

	// spec: transcript-archive/a-wrap-up-after-a-killed-session
	test("names both spellings of the catch-up in step 3 and in allowed-tools [36]", () => {
		const step = skill.split("## 3. Workflow state")[1]?.split("\n## ")[0] ?? "";
		const allowed = /^allowed-tools: "(.*)"$/m.exec(skill)?.[1].split(", ") ?? [];
		for (const command of commands) {
			expect(step).toContain(`\`${command}\``);
			expect(allowed).toContain(`Bash(${command})`);
		}
	});

	test("names the archive in the Rules line on what the skill may write", () => {
		const rule = skill.split("\n").find((l) => l.startsWith("- The only files this skill may touch"));
		expect(rule).toContain("transcript archive");
	});
});
