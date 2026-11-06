import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOOKS } from "./bootstrap.ts";
import { cleanupTranscripts, reply, transcript } from "./context-window.fixture.ts";
import { CEILING, countRound } from "./goal-rounds.ts";
import {
	cleanup,
	commit,
	DONE,
	end,
	git,
	OPEN,
	prompt,
	repo,
	runLines,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";
import { decide, mark } from "./turn-gate.ts";

/**
 * The context-window check where the turn gate runs it: after the gate's own
 * decision, under its mark. `XDG_STATE_HOME` points the gate ledger at a
 * directory of each case's own, and is restored after the file.
 */

const saved = process.env.XDG_STATE_HOME;
afterAll(() => {
	process.env.XDG_STATE_HOME = saved;
	cleanup();
	cleanupTranscripts();
});

let state = "";
beforeEach(() => {
	state = store();
	process.env.XDG_STATE_HOME = state;
});

const GATE = "holds no passing pre-PR run";
const WRAPUP = "/session-wrapup";

/** A repository marked by a prompt, and a transcript whose last reply reads `size`. */
function session(size: number, files: Record<string, string> = { [TASKS]: OPEN }) {
	const dir = repo(files);
	const marks = store();
	mark(prompt(dir), marks);
	const talk = transcript(reply(size));
	const stop = (...sizes: number[]) => {
		talk.add(...sizes.map((n) => reply(n)));
		return decide({ ...end(dir, SILENT), transcript_path: talk.path }, marks);
	};
	return { dir, marks, talk, stop, prompt: () => mark(prompt(dir), marks) };
}

describe("in process", () => {
	// spec: context-window/the-turn-gate-refuses-at-the-same-stop commit-gates/a-refusal-for-the-run-then-a-full-context
	test("the gate's refusal comes alone, its next stop ends, and the next turn is asked", () => {
		const s = session(850_000);
		commit(s.dir, { [TASKS]: DONE });
		const refused = s.stop();
		const next = s.stop();
		s.prompt();
		expect({
			gate: refused?.includes(GATE),
			alone: refused?.includes(WRAPUP),
			next,
			asked: s.stop()?.includes(WRAPUP),
		}).toEqual({ gate: true, alone: false, next: undefined, asked: true });
	});

	// spec: context-window/the-continued-turn-completes-a-group commit-gates/a-refusal-for-size-then-a-completed-group
	test("a refusal for size, then a completed group: the gate refuses the next stop", () => {
		const s = session(850_000);
		expect(s.stop()).toContain(WRAPUP);
		commit(s.dir, { [TASKS]: DONE });
		expect(s.stop()).toContain(GATE);
	});

	// spec: context-window/a-message-queued-into-the-continued-turn
	test("a prompt into the turn continued for size leaves the mark", () => {
		const s = session(850_000);
		s.stop();
		const file = join(s.marks, "s1");
		const at = readFileSync(file, "utf8");
		commit(s.dir, { "a.txt": "1" });
		s.prompt();
		expect(readFileSync(file, "utf8")).toBe(at);
	});

	// spec: context-window/the-turn-gate-refuses-the-first-stop-after-a-compaction
	test("a stop the gate refuses still re-arms the ask for the next context", () => {
		const s = session(805_000);
		expect(s.stop()).toContain(WRAPUP);
		expect(s.stop()).toBeUndefined();
		s.prompt();
		commit(s.dir, { [TASKS]: DONE });
		expect(s.stop(150_000)).toContain(GATE);
		expect(s.stop()).toBeUndefined();
		s.prompt();
		expect(s.stop(805_000)).toContain(WRAPUP);
	});

	// spec: context-window/outside-a-repository commit-gates/outside-a-repository-a-full-context
	test("an empty mark, written outside a repository, ends at any size", () => {
		const dir = store();
		const marks = store();
		mark(prompt(dir), marks);
		const talk = transcript(reply(850_000));
		expect(readFileSync(join(marks, "s1"), "utf8")).toBe("");
		expect(decide({ ...end(dir, SILENT), transcript_path: talk.path }, marks)).toBeUndefined();
	});

	// spec: context-window/on-a-detached-head
	test("a marked commit, then a detached `HEAD`, ends at any size", () => {
		const s = session(850_000);
		git(s.dir, "checkout", "--detach");
		expect(s.stop()).toBeUndefined();
	});

	// spec: context-window/no-mark
	test("a session no `mark` ran for ends", () => {
		const dir = repo();
		const talk = transcript(reply(850_000));
		expect(decide({ ...end(dir, SILENT), transcript_path: talk.path }, store())).toBeUndefined();
	});

	// spec: context-window/a-subagent-s-stop
	test("nothing is registered on `SubagentStop`", () => {
		const settings = JSON.parse(readFileSync(join(import.meta.dir, "../.claude/settings.json"), "utf8"));
		expect({
			hooks: HOOKS.filter((hook) => hook.event === "SubagentStop"),
			settings: settings.hooks?.SubagentStop,
		}).toEqual({ hooks: [], settings: undefined });
	});
});

describe("as the hook", () => {
	const script = join(import.meta.dir, "turn-gate.ts");

	/** Runs the stop half with the mark store in `tmp`, and the ledger in this case's state. */
	function stop(event: object, cwd: string, tmp: string) {
		const call = Bun.spawnSync(["bun", script, "stop"], {
			cwd,
			env: { PATH: process.env.PATH, TMPDIR: tmp, XDG_STATE_HOME: state },
			stdin: Buffer.from(JSON.stringify(event)),
		});
		return { code: call.exitCode, out: call.stdout.toString(), err: call.stderr.toString() };
	}

	/** The ledger's records as `gate decision rule`. */
	const records = () => {
		const file = join(state, "harness", "gates.jsonl");
		return existsSync(file)
			? readFileSync(file, "utf8")
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line))
					.map(({ gate, decision, rule }) => `${gate} ${decision} ${rule}`)
			: [];
	};

	/** A repository whose prompt the gate marked in `tmp`'s store, and a transcript at `size`. */
	function marked(size: number) {
		const dir = repo({ [TASKS]: OPEN });
		const tmp = store();
		mark(prompt(dir), join(tmp, "turn-gate"));
		const talk = transcript(reply(size));
		return { dir, tmp, event: { ...end(dir, SILENT), transcript_path: talk.path } };
	}

	// spec: context-window/a-refusal-over-a-passing-run
	test("a refusal over a passing run records one wrap-up and two passes", () => {
		const { dir, tmp, event } = marked(810_000);
		commit(dir, { [TASKS]: DONE });
		mkdirSync(join(state, "harness"), { recursive: true });
		writeFileSync(join(state, "harness", "gates.jsonl"), runLines(git(dir, "rev-parse", "HEAD"), realpathSync(dir)));
		const codes = [stop(event, dir, tmp).code, stop(event, dir, tmp).code];
		expect({ codes, records: records().filter((r) => !r.startsWith("pre-pr")) }).toEqual({
			codes: [2, 0],
			records: [
				"turn-gate passed pre-pr-sequence",
				"context-window refused wrapup",
				"turn-gate passed pre-pr-sequence",
			],
		});
	});

	// spec: context-window/a-stop-below-the-threshold
	test("a stop at 400 000 records nothing for size", () => {
		const { dir, tmp, event } = marked(400_000);
		expect(stop(event, dir, tmp).code).toBe(0);
		expect(records().filter((r) => r.startsWith("context-window"))).toEqual([]);
	});

	// spec: context-window/the-ceiling-at-the-same-stop
	test("the twentieth continued stop ends the session and asks nothing", () => {
		const { dir, tmp, event } = marked(850_000);
		const again = { ...event, stop_hook_active: true };
		for (let i = 0; i < CEILING - 1; i++) countRound(again, join(tmp, "turn-gate", "s1"));
		const { code, out, err } = stop(again, dir, tmp);
		expect({ code, err, end: JSON.parse(out).continue }).toEqual({ code: 0, err: "", end: false });
	});

	// spec: context-window/the-ceiling-stop-re-arms-it
	test("the ceiling's stop under half the threshold removes the wrap-up mark", () => {
		const { dir, tmp, event } = marked(150_000);
		const file = join(tmp, "turn-gate", "s1");
		writeFileSync(`${file}.wrapup`, "");
		const again = { ...event, stop_hook_active: true };
		for (let i = 0; i < CEILING - 1; i++) countRound(again, file);
		expect(JSON.parse(stop(again, dir, tmp).out).continue).toBe(false);
		expect(existsSync(`${file}.wrapup`)).toBe(false);
	});
});
