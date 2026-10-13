import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { TURN_STOP } from "./bootstrap.ts";
import { CEILING, countRound, resetRounds } from "./goal-rounds.ts";
import {
	cleanup,
	commit,
	DONE,
	end,
	OPEN,
	prompt,
	repo,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";

/**
 * The round ceiling: the turn gate's `Stop` half ends a goal run at its
 * twentieth continued stop since the session's last prompt. A count is
 * arranged in-process through the counter, and the stop under test is the
 * gate spawned as the hook runs it. Bracketed numbers are the proposal-stage
 * `/zombies` run's, as `stage-goal`'s tasks.md places them.
 */

afterAll(cleanup);

const script = join(import.meta.dir, "turn-gate.ts");

/** A stop the goal's own hook continued, which is what the ceiling counts. */
const again = (session = "s1") => ({
	session_id: session,
	stop_hook_active: true,
});

/** Counts `n` continued stops against the mark at `mark`. */
function rounds(mark: string, n: number, session = "s1"): void {
	for (let i = 0; i < n; i++) countRound(again(session), mark);
}

/** A mark path in a store of its own, its count started as a prompt does. */
function marked(): string {
	const mark = join(store(), "s1");
	resetRounds(mark);
	return mark;
}

describe("the count", () => {
	test("a stop the goal did not continue counts nothing [37]", () => {
		const mark = marked();
		rounds(mark, CEILING - 1);
		const plain = { session_id: "s1", stop_hook_active: false };
		expect(countRound(plain, mark)).toBeUndefined();
	});

	test("with no mark nothing is counted [38]", () => {
		const mark = join(store(), "s1");
		rounds(mark, CEILING - 1);
		expect(countRound(again(), mark)).toBeUndefined();
	});

	test("a stop past the ceiling with no new mark ends again [43]", () => {
		const mark = marked();
		rounds(mark, CEILING);
		expect(countRound(again(), mark)).toStartWith("goal-ceiling:");
	});

	test('the string "true" is not counted [45]', () => {
		const mark = marked();
		rounds(mark, CEILING - 1);
		const text = { session_id: "s1", stop_hook_active: "true" };
		expect(countRound(text, mark)).toBeUndefined();
	});

	test("the reason names the count, a resume and `/goal clear` [46]", () => {
		const mark = marked();
		rounds(mark, CEILING - 1);
		const reason = countRound(again(), mark);
		expect([`${CEILING} continued stops`, "--resume s1", "/goal clear"].filter(
			(part) => !reason?.includes(part),
		)).toEqual([]);
	});

	test("a counter that holds no whole number ends nothing", () => {
		const mark = join(store(), "s1");
		writeFileSync(`${mark}.rounds`, "garbage");
		rounds(mark, CEILING - 1);
		expect(countRound(again(), mark)).toBeUndefined();
	});

	test("an unwritable counter decides as without a ceiling [52]", () => {
		const mark = marked();
		rounds(mark, CEILING - 1);
		chmodSync(`${mark}.rounds`, 0o444);
		expect(countRound(again(), mark)).toBeUndefined();
	});
});

/**
 * Runs one half. `TMPDIR` points the mark store at the case's own directory,
 * and `XDG_STATE_HOME` the gate ledger, at `tmp` unless the case names one.
 */
function run(
	half: "mark" | "stop",
	event: unknown,
	cwd: string,
	tmp: string,
	state = tmp,
) {
	const call = Bun.spawnSync(["bun", script, half], {
		cwd,
		env: { PATH: process.env.PATH, TMPDIR: tmp, XDG_STATE_HOME: state },
		stdin: Buffer.from(
			typeof event === "string" ? event : JSON.stringify(event),
		),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: call.exitCode,
		out: call.stdout.toString(),
		err: call.stderr.toString(),
	};
}

/** The stop event of a goal run's continued turn, ending on a question. */
const stop = (dir: string, session = "s1") => ({
	...end(dir, SILENT, session),
	stop_hook_active: true,
});

/**
 * A repository whose session the gate marked, with `n` continued stops
 * counted since; `done` commits the group's last task after the mark, so the
 * gate would refuse the turn.
 */
function counted(n: number, done = false) {
	const dir = repo({ [TASKS]: OPEN });
	const tmp = store();
	run("mark", prompt(dir), dir, tmp);
	if (done) commit(dir, { [TASKS]: DONE });
	rounds(join(tmp, "turn-gate", "s1"), n);
	return { dir, tmp };
}

/** The `continue: false` answer the gate printed, or nothing. */
const ended = (out: string) => (out ? JSON.parse(out) : undefined);

describe("the stop under the ceiling", () => {
	// spec: stage-goal/below-the-ceiling
	test("the nineteenth continued stop prints nothing and is refused as without a ceiling [39]", () => {
		const { dir, tmp } = counted(CEILING - 2, true);
		expect(run("stop", stop(dir), dir, tmp)).toMatchObject({ code: 2, out: "" });
	});

	// spec: stage-goal/at-the-ceiling
	test("the twentieth prints `continue: false` with a `goal-ceiling:` reason and exits 0 [40]", () => {
		const { dir, tmp } = counted(CEILING - 1);
		const { code, out } = run("stop", stop(dir), dir, tmp);
		expect({ code, end: ended(out) }).toEqual({
			code: 0,
			end: { continue: false, stopReason: expect.stringMatching(/^goal-ceiling: /) },
		});
	});

	// spec: stage-goal/a-new-prompt
	test("a mark after eighteen starts the count again [41]", () => {
		const { dir, tmp } = counted(CEILING - 2);
		run("mark", prompt(dir), dir, tmp);
		rounds(join(tmp, "turn-gate", "s1"), CEILING - 2);
		expect(run("stop", stop(dir), dir, tmp)).toEqual({ code: 0, out: "", err: "" });
	});

	// spec: stage-goal/two-sessions
	test("another session's prompt leaves this session's count alone [42]", () => {
		const { dir, tmp } = counted(CEILING - 1);
		run("mark", prompt(dir, "s2"), dir, tmp);
		expect(ended(run("stop", stop(dir), dir, tmp).out)).toMatchObject({
			continue: false,
		});
	});

	// spec: stage-goal/the-ceiling-and-a-refusal-at-the-same-stop
	test("where the gate would refuse, the ceiling wins, with exit 0 and nothing on stderr [44]", () => {
		const { dir, tmp } = counted(CEILING - 1, true);
		const { code, out, err } = run("stop", stop(dir), dir, tmp);
		expect({ code, err, end: ended(out)?.continue }).toEqual({
			code: 0,
			err: "",
			end: false,
		});
	});

	// spec: stage-goal/a-headless-run-at-the-ceiling
	test("the end is recorded as `goal` / `rounds` / `ceiling` [47]", () => {
		const { dir, tmp } = counted(CEILING - 1);
		run("stop", stop(dir), dir, tmp);
		const lines = readFileSync(join(tmp, "harness", "gates.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(lines).toEqual([
			expect.objectContaining({
				gate: "goal",
				rule: "rounds",
				decision: "ceiling",
				session: "s1",
			}),
		]);
	});

	test("the answer comes through the bootstrap's `Stop` text with exit 0 [48]", () => {
		const { dir, tmp } = counted(CEILING - 1);
		// This checkout installed as the project's harness package.
		mkdirSync(join(dir, "node_modules"));
		symlinkSync(join(import.meta.dir, ".."), join(dir, "node_modules", "harness"));
		const call = Bun.spawnSync(["sh", "-c", TURN_STOP], {
			cwd: dir,
			env: {
				PATH: process.env.PATH,
				CLAUDE_PROJECT_DIR: dir,
				TMPDIR: tmp,
				XDG_STATE_HOME: tmp,
			},
			stdin: Buffer.from(JSON.stringify(stop(dir))),
		});
		expect({
			code: call.exitCode,
			end: ended(call.stdout.toString())?.continue,
		}).toEqual({ code: 0, end: false });
	});

	// spec: stage-goal/an-unwritable-ledger-at-the-ceiling
	test("an unwritable ledger still ends the session [51]", () => {
		const { dir, tmp } = counted(CEILING - 1);
		const file = join(tmp, "not-a-dir");
		writeFileSync(file, "");
		const { code, out } = run("stop", stop(dir), dir, tmp, file);
		expect({ code, reason: ended(out)?.stopReason }).toEqual({
			code: 0,
			reason: expect.stringMatching(/^goal-ceiling: /),
		});
	});
});

describe("what the ceiling cannot read", () => {
	// spec: stage-goal/an-unreadable-event
	test("an event that is not JSON counts nothing [49]", () => {
		const { dir, tmp } = counted(CEILING - 1);
		expect(run("stop", "not json", dir, tmp)).toEqual({ code: 0, out: "", err: "" });
	});

	// spec: stage-goal/an-unreadable-event
	test("a session id unsafe as a file name counts nothing [50]", () => {
		const { dir, tmp } = counted(0);
		// Where a path built from the id would land: the store's parent.
		const escaped = join(tmp, "x");
		resetRounds(escaped);
		rounds(escaped, CEILING - 1, "../x");
		expect(run("stop", stop(dir, "../x"), dir, tmp).out).toBe("");
	});
});
