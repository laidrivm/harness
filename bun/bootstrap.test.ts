/**
 * The bootstrap hook and the turn gate's, Notion guard's, question gate's and
 * loop guard's registrations run as Claude Code runs them: the command
 * through a shell, the event as JSON on stdin, in a project with no harness
 * installed and then with one.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BOOTSTRAP,
	HOOKS,
	NOTION_GUARD,
	QUESTION_GATE,
	TURN_MARK,
	TURN_STOP,
} from "./bootstrap.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A project directory, with a stand-in guard installed when `guard` is set. */
function project(guard?: string): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-bootstrap-"));
	made.push(dir);
	if (guard !== undefined) {
		mkdirSync(join(dir, "node_modules/harness/bun"), { recursive: true });
		writeFileSync(
			join(dir, "node_modules/harness/bun/command-guard.ts"),
			guard,
		);
	}
	return dir;
}

/** The hook's verdict in `dir` on `input`, exactly as given on stdin. */
function raw(dir: string, input: string) {
	const run = Bun.spawnSync(["sh", "-c", BOOTSTRAP], {
		cwd: dir,
		env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
		stdin: new TextEncoder().encode(input),
	});
	return { code: run.exitCode, stderr: run.stderr.toString() };
}

/** The hook's verdict on `command` in `dir`. */
const hook = (dir: string, command: string) =>
	raw(dir, JSON.stringify({ tool_name: "Bash", tool_input: { command } }));

describe("before the install", () => {
	test.each(["bun install", "bun i", "bun install --frozen-lockfile"])(
		"%s runs",
		(command) => {
			expect(hook(project(), command).code).toBe(0);
		},
	);

	test.each([
		["any other command", "git status"],
		["an install that names a package", "bun install lodash"],
		["an install with another flag", "bun install --registry https://x.test"],
		["an install from another directory", "bun install --cwd ../other"],
		["an install with a command chained after it", "bun install && git status"],
		["an install with a command chained before it", "git status; bun install"],
	])("%s is blocked, naming bun install", (_, command) => {
		const { code, stderr } = hook(project(), command);
		expect(code).toBe(2);
		expect(stderr).toContain("bun install");
	});

	test("input that is not JSON blocks rather than letting through", () => {
		// The parse throws, bun exits 1, and the hook turns that into 2.
		expect(raw(project(), "bun install").code).toBe(2);
	});
});

describe("after the install", () => {
	test("the guard decides, and a command it allows runs", () => {
		const dir = project("process.exit(0);\n");
		expect(hook(dir, "git status").code).toBe(0);
	});

	test("a command the guard blocks stays blocked", () => {
		const dir = project("console.error('guarded'); process.exit(2);\n");
		const { code, stderr } = hook(dir, "bun install");
		expect(code).toBe(2);
		expect(stderr).toContain("guarded");
	});

	test("a guard that fails to run blocks rather than letting through", () => {
		// Exit 1 is non-blocking to Claude Code; the hook turns it into 2.
		const dir = project("throw new Error('broken');\n");
		expect(hook(dir, "git status").code).toBe(2);
	});
});

/** A project with `script` installed as `file`, the turn gate by default. */
function gated(
	script?: string,
	prefix = "harness-turn-gate-",
	file = "turn-gate.ts",
): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	made.push(dir);
	if (script !== undefined) {
		mkdirSync(join(dir, "node_modules/harness/bun"), { recursive: true });
		writeFileSync(join(dir, "node_modules/harness/bun", file), script);
	}
	return dir;
}

/**
 * A registration's verdict in `dir`, as Claude Code runs it: the turn gate's
 * on an empty event, the Notion guard's on any.
 */
function turn(command: string, dir: string) {
	const run = Bun.spawnSync(["sh", "-c", command], {
		cwd: dir,
		env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: dir },
		stdin: new TextEncoder().encode("{}"),
	});
	return {
		code: run.exitCode,
		stdout: run.stdout.toString(),
		stderr: run.stderr.toString(),
	};
}

/** Refuses, naming the half it was run as. */
const REFUSES = "console.error(process.argv[2]); process.exit(2);\n";

describe("the turn gate before the install", () => {
	// spec: commit-gates/a-consumer-clone-before-install
	test("the turn ends, with nothing printed [1]", () => {
		expect(turn(TURN_STOP, gated())).toEqual({ code: 0, stdout: "", stderr: "" });
	});

	test("the prompt goes through, with nothing added to it [2]", () => {
		const { code, stdout } = turn(TURN_MARK, gated());
		expect({ code, stdout }).toEqual({ code: 0, stdout: "" });
	});
});

describe("the turn gate after the install", () => {
	test("a refusal leaves exactly 2, with its reason [3]", () => {
		expect(turn(TURN_STOP, gated(REFUSES))).toMatchObject({
			code: 2,
			stderr: "stop\n",
		});
	});

	test("the mark text runs the mark half", () => {
		expect(turn(TURN_MARK, gated(REFUSES)).stderr).toBe("mark\n");
	});

	test("a gate that fails to run ends the turn rather than holding it [4]", () => {
		expect(turn(TURN_STOP, gated("throw (\n")).code).not.toBe(2);
	});

	test("a project path holding a space still reaches the gate [5]", () => {
		const dir = gated(REFUSES, "harness turn gate ");
		expect(turn(TURN_STOP, dir).code).toBe(2);
	});
});

/** A project with `script` installed as the Notion guard. */
const guarded = (script: string) =>
	gated(script, "harness-notion-guard-", "notion-guard.ts");

describe("the Notion guard's registration", () => {
	test("before the install, the call goes through with nothing printed", () => {
		expect(turn(NOTION_GUARD, gated())).toEqual({
			code: 0,
			stdout: "",
			stderr: "",
		});
	});

	test("after the install, a refusal leaves exactly 2, with its reason", () => {
		const refuses = "console.error('refused'); process.exit(2);\n";
		expect(turn(NOTION_GUARD, guarded(refuses))).toMatchObject({
			code: 2,
			stderr: "refused\n",
		});
	});

	test("a guard that fails to run lets the call through", () => {
		expect(turn(NOTION_GUARD, guarded("throw (\n")).code).not.toBe(2);
	});
});

describe("the question gate's registration", () => {
	const gate = (script: string) =>
		gated(script, "harness-question-gate-", "question-gate.ts");

	test("before the install, nothing is printed, so the prompt stands", () => {
		expect(turn(QUESTION_GATE, gated())).toEqual({
			code: 0,
			stdout: "",
			stderr: "",
		});
	});

	test("after the install, the gate's answer reaches Claude Code", () => {
		expect(turn(QUESTION_GATE, gate("console.log('allow');\n")).stdout).toBe(
			"allow\n",
		);
	});

	test("a gate that fails to run prints no answer", () => {
		expect(turn(QUESTION_GATE, gate("throw (\n")).stdout).toBe("");
	});
});

describe("the loop guard's registrations", () => {
	/** The text `HOOKS` registers the guard with on `event`. */
	const on = (event: string) => {
		const hook = HOOKS.find(
			(h) => h.event === event && h.name === "harness loop guard",
		);
		expect(hook).toBeDefined();
		return hook?.command ?? "";
	};
	const events = ["PreToolUse", "PostToolUseFailure"];

	// spec: loop-guard/before-the-install
	test.each(events)("on %s, before the install, exit 0 with nothing printed [35]", (event) => {
		expect(turn(on(event), gated())).toEqual({ code: 0, stdout: "", stderr: "" });
	});

	test.each(events)("on %s, after the install, pass on the guard's answer", (event) => {
		const answers = "console.log('warned'); console.error('refused'); process.exit(2);\n";
		const dir = gated(answers, "harness-loop-guard-", "loop-guard.ts");
		expect(turn(on(event), dir)).toEqual({
			code: 2,
			stdout: "warned\n",
			stderr: "refused\n",
		});
	});
});
