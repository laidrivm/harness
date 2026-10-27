import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { ran } from "./gate-ledger.ts";

/**
 * The skill-call hook, spawned as the platform runs it: one event on stdin, a
 * state directory of the case's own, and `CLAUDE_PROJECT_DIR` naming the main
 * checkout. Bracketed numbers are the proposal-stage `/zombies` ideas.
 */

afterAll(cleanup);

const HOOK = join(import.meta.dir, "skill-record.ts");
const SESSION = "s-1";

// Every GIT_* removed: under a hook that exports GIT_DIR, git would read another repository.
const env = (extra: Record<string, string> = {}) => ({
	...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
	...extra,
});

const git = (cwd: string, ...args: string[]) => {
	const config = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
	const p = Bun.spawnSync(["git", ...config, ...args], { cwd, env: env() });
	if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr}`);
	return p.stdout.toString().trim();
};

/** A repository at one commit, and a worktree of it at a second. */
function scratch() {
	const main = realpathSync(emptyDir("skill-record-"));
	git(main, "init", "-q", "-b", "main");
	writeFileSync(join(main, "a.txt"), "a\n");
	git(main, "add", "a.txt");
	git(main, "commit", "-qm", "one");
	const tree = join(realpathSync(emptyDir("skill-record-wt-")), "w");
	git(main, "worktree", "add", "-q", "-b", "w", tree);
	writeFileSync(join(tree, "b.txt"), "b\n");
	git(tree, "add", "b.txt");
	git(tree, "commit", "-qm", "two");
	return { main, tree, head: (dir: string) => git(dir, "rev-parse", "HEAD") };
}

const called = (skill: unknown, cwd: string, args = "") => ({
	hook_event_name: "PostToolUse",
	session_id: SESSION,
	cwd,
	tool_name: "Skill",
	tool_input: { skill, args },
	tool_response: { success: true },
});

const typed = (name: string, cwd: string, type = "slash_command", args = "") => ({
	hook_event_name: "UserPromptExpansion",
	session_id: SESSION,
	cwd,
	expansion_type: type,
	command_name: name,
	command_args: args,
	prompt: `/${name} ${args}`,
});

/** The hook run on each event in turn, in one state directory; the ledger's lines after. */
function hook(main: string, ...events: unknown[]) {
	const state = emptyDir("skill-record-state-");
	const runs = events.map((event) =>
		Bun.spawnSync(["bun", HOOK], {
			stdin: Buffer.from(typeof event === "string" ? event : JSON.stringify(event)),
			env: env({ XDG_STATE_HOME: state, CLAUDE_PROJECT_DIR: main }),
		}),
	);
	let text = "";
	try {
		text = readFileSync(join(state, "harness", "gates.jsonl"), "utf8");
	} catch {}
	return {
		text,
		records: text.split("\n").filter(Boolean).map((line) => JSON.parse(line)),
		outs: runs.map((r) => [r.exitCode, r.stdout.toString()]),
	};
}

describe("a skill call is recorded", () => {
	// spec: gate-ledger/a-skill-claude-calls-in-a-worktree
	test("a Skill call in a worktree names the worktree's HEAD and top level [3, 19, 20]", () => {
		const { main, tree, head } = scratch();
		const r = hook(main, called("zombies", tree));
		expect(r.records).toEqual([
			expect.objectContaining({ gate: "skill", decision: "called", rule: "zombies", commit: head(tree), project: tree, session: SESSION }),
		]);
	});

	// spec: gate-ledger/a-skill-the-user-types
	test("a typed /triage names the main checkout's HEAD [4]", () => {
		const { main, head } = scratch();
		const r = hook(main, typed("triage", main));
		expect(r.records.map((x) => [x.rule, x.commit, x.project])).toEqual([["triage", head(main), main]]);
	});

	test("ran() finds it under the gate skill and its rule, and the runner's asks do not [24]", () => {
		const { main, tree, head } = scratch();
		const r = hook(main, called("zombies", tree));
		const commit = head(tree);
		expect([
			ran(commit, tree, "called", r.text, "zombies", "skill"),
			ran(commit, tree, undefined, r.text, "zombies", "skill"),
			ran(commit, tree, undefined, r.text),
			ran(commit, tree, "pass", r.text, "diff-budget"),
		]).toEqual([true, true, false, false]);
	});

	test("two calls append two records, in order [5]", () => {
		const { main } = scratch();
		const r = hook(main, called("zombies", main), typed("triage", main));
		expect(r.records.map((x) => x.rule)).toEqual(["zombies", "triage"]);
	});

	test("a cwd in a subdirectory records the top level [8]", () => {
		const { main } = scratch();
		mkdirSync(join(main, "sub"));
		expect(hook(main, called("zombies", join(main, "sub"))).records[0]?.project).toBe(main);
	});

	// spec: gate-ledger/a-skill-called-with-only-an-untracked-file
	test("an untracked file alone still records [9]", () => {
		const { main } = scratch();
		writeFileSync(join(main, "new.txt"), "n\n");
		expect(hook(main, called("zombies", main)).records).toHaveLength(1);
	});

	// spec: gate-ledger/a-skill-called-with-arguments
	test("the arguments appear nowhere, and the record holds the six keys and the commit [16, 17]", () => {
		const { main } = scratch();
		const args = "/Users/someone/secret.txt ghp_TOKEN123";
		const r = hook(main, called("zombies", main, args), typed("triage", main, "slash_command", args));
		expect([r.text.includes("secret.txt"), r.text.includes("ghp_TOKEN123")]).toEqual([false, false]);
		const keys = ["at", "commit", "decision", "gate", "project", "rule", "session"];
		expect(r.records.map((x) => Object.keys(x).sort())).toEqual([keys, keys]);
	});

	test("prints nothing and exits 0 when it records [18]", () => {
		const { main } = scratch();
		const r = hook(main, called("zombies", main));
		expect([r.records.length, r.outs]).toEqual([1, [[0, ""]]]);
	});
});

describe("no record, exit 0 and nothing printed", () => {
	const nothing = (r: ReturnType<typeof hook>) => {
		expect(r.text).toBe("");
		expect(r.outs.every(([code, out]) => code === 0 && out === "")).toBe(true);
	};

	// spec: gate-ledger/an-mcp-prompt-the-user-types
	test("for an MCP server's prompt", () => {
		const { main } = scratch();
		nothing(hook(main, typed("triage", main, "mcp_prompt")));
	});

	test.each([
		["empty stdin [1]", ""],
		["stdin that is not JSON [21]", "{not json"],
		["neither a skill nor a command name [2]", { hook_event_name: "PostToolUse", session_id: SESSION, tool_input: {} }],
	])("for %s", (_, event) => {
		const { main } = scratch();
		nothing(hook(main, typeof event === "string" ? event : { ...event, cwd: main }));
	});

	test.each([
		["an empty name [7]", ""],
		["a name that is not a string [15]", 42],
	])("for %s", (_, name) => {
		const { main } = scratch();
		nothing(hook(main, called(name, main)));
	});

	// spec: gate-ledger/a-skill-called-on-an-uncommitted-edit
	test.each([
		["a staged edit [10]", true],
		["an unstaged edit [11]", false],
	])("for %s", (_, staged) => {
		const { main } = scratch();
		writeFileSync(join(main, "a.txt"), "changed\n");
		if (staged) git(main, "add", "a.txt");
		nothing(hook(main, called("zombies", main)));
	});

	// spec: gate-ledger/a-skill-called-outside-a-repository
	test.each([
		["a repository with no commit [12]", () => {
			const dir = realpathSync(emptyDir("skill-record-bare-"));
			git(dir, "init", "-q");
			return dir;
		}],
		["a cwd that is no repository [13]", () => realpathSync(emptyDir("skill-record-none-"))],
		["a cwd that does not exist [14]", () => join(realpathSync(emptyDir("skill-record-gone-")), "missing")],
	])("for %s", (_, dir) => {
		const { main } = scratch();
		nothing(hook(main, called("zombies", dir())));
	});
});

// spec: gate-ledger/a-skill-called-while-the-ledger-cannot-be-written
test("an unwritable state directory: exit 0, nothing printed [22]", () => {
	const { main } = scratch();
	const state = join(emptyDir("skill-record-file-"), "state");
	writeFileSync(state, "a file, not a directory\n");
	const p = Bun.spawnSync(["bun", HOOK], {
		stdin: Buffer.from(JSON.stringify(called("zombies", main))),
		env: env({ XDG_STATE_HOME: state, CLAUDE_PROJECT_DIR: main }),
	});
	expect([p.exitCode, p.stdout.toString()]).toEqual([0, ""]);
});
