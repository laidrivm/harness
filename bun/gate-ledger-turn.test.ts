import { afterAll, describe, expect, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	cleanup,
	commit,
	DONE,
	end,
	OPEN,
	prompt,
	repo,
	runLines,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";

/**
 * What the turn gate records in the gate ledger. Its own file beside
 * `gate-ledger.test.ts`, which holds the writer's and the guard's cases and
 * stands near the line cap. Each case spawns `turn-gate.ts` as the hooks do,
 * with an environment built from what it needs: `TMPDIR` for the marks, and
 * `HOME` and `XDG_STATE_HOME` so nothing reaches the user's own ledger.
 */

afterAll(cleanup);

const script = `${import.meta.dir}/turn-gate.ts`;
const GATES = "TRIAGE gate: PASS — 2 groups, nothing above Low risk.";

type Turn = { dir: string; tmp: string; state: string };

function run(half: "mark" | "stop", event: unknown, turn: Turn) {
	const call = Bun.spawnSync(["bun", script, half], {
		cwd: turn.dir,
		env: {
			PATH: process.env.PATH,
			TMPDIR: turn.tmp,
			HOME: turn.tmp,
			XDG_STATE_HOME: turn.state,
		},
		stdin: Buffer.from(
			typeof event === "string" ? event : JSON.stringify(event),
		),
		stderr: "pipe",
	});
	return { code: call.exitCode, reason: call.stderr.toString() };
}

/** A repository marked at `OPEN`, then given `after` as the turn's commit. */
function turn(after: string | undefined, state = store()): Turn {
	const t = { dir: repo({ [TASKS]: OPEN }), tmp: store(), state };
	run("mark", prompt(t.dir), t);
	if (after !== undefined) commit(t.dir, { [TASKS]: after });
	return t;
}

const stop = (t: Turn, message: string) => run("stop", end(t.dir, message), t);

const ledger = (state: string) => join(state, "harness", "gates.jsonl");

/** The records written so far, oldest first; none when the file is absent. */
const records = (state: string) =>
	existsSync(ledger(state))
		? readFileSync(ledger(state), "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line))
		: [];
const decisions = (state: string) => records(state).map((r) => r.decision);

/** Writes the pre-PR runner's records of the turn's tip, one per step, as `pre-pr.ts` does. */
function runner(t: Turn) {
	const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: t.dir });
	mkdirSync(join(t.state, "harness"), { recursive: true });
	appendFileSync(ledger(t.state), runLines(head.stdout.toString().trim(), realpathSync(t.dir)));
}
const turnGate = (state: string) =>
	records(state)
		.filter((r) => r.gate === "turn-gate")
		.map((r) => r.decision);

describe("a turn that completed a group", () => {
	test("a refusal records turn-gate, refused, pre-pr-sequence", () => {
		const t = turn(DONE);
		stop(t, SILENT);
		expect(records(t.state)).toEqual([
			expect.objectContaining({
				gate: "turn-gate",
				decision: "refused",
				rule: "pre-pr-sequence",
				project: realpathSync(t.dir),
				session: "s1",
			}),
		]);
	});

	// spec: gate-ledger/refused-then-ended-without-gates
	test("a refused turn ended with a named BLOCKED and no run records a release, not a pass", () => {
		const t = turn(DONE);
		stop(t, SILENT);
		stop(t, "BLOCKED — the user must choose the id list.");
		expect(decisions(t.state)).toEqual(["refused", "released"]);
	});

	test("a turn with the runner's passing record records a pass, a gate line or not", () => {
		const t = turn(DONE);
		runner(t);
		stop(t, GATES);
		expect(turnGate(t.state)).toEqual(["passed"]);
	});

	test("a turn with no runner record records a refusal, gate lines and all", () => {
		const t = turn(DONE);
		stop(t, GATES);
		expect(decisions(t.state)).toEqual(["refused"]);
	});

	// spec: gate-ledger/a-turn-refused-then-let-through
	test("a refused turn continued to a passing run records a refusal, then a pass", () => {
		const t = turn(DONE);
		stop(t, SILENT);
		runner(t);
		stop(t, GATES);
		expect(turnGate(t.state)).toEqual(["refused", "passed"]);
	});

	// spec: gate-ledger/refused-then-ended-without-gates
	test("a refused turn ended again without a passing run records a release", () => {
		const t = turn(DONE);
		stop(t, SILENT);
		stop(t, SILENT);
		expect(decisions(t.state)).toEqual(["refused", "released"]);
	});
});

describe("a turn the ledger says nothing about", () => {
	// spec: gate-ledger/a-turn-that-completed-nothing
	test("a turn that completed nothing leaves the file absent", () => {
		const t = turn(OPEN);
		stop(t, SILENT);
		expect(existsSync(ledger(t.state))).toBe(false);
	});

	test("a turn with no mark leaves the file absent", () => {
		const t = { dir: repo({ [TASKS]: OPEN }), tmp: store(), state: store() };
		commit(t.dir, { [TASKS]: DONE });
		stop(t, SILENT);
		expect(existsSync(ledger(t.state))).toBe(false);
	});

	test("an event that is not JSON leaves the file absent", () => {
		const t = turn(DONE);
		run("stop", "not json", t);
		expect(existsSync(ledger(t.state))).toBe(false);
	});

	// spec: gate-ledger/a-gate-line-without-a-completed-group
	test("a turn that commits, completes no group and prints a gate line records no pass", () => {
		const t = turn(OPEN);
		stop(t, GATES);
		expect(existsSync(ledger(t.state))).toBe(false);
	});
});

// spec: gate-ledger/an-unwritable-ledger-at-the-turn-s-end
test("an unwritable ledger still refuses the turn with its reason", () => {
	const state = join(store(), "file");
	writeFileSync(state, "");
	const t = turn(DONE, state);
	expect(stop(t, SILENT)).toEqual({
		code: 2,
		reason: expect.stringContaining("no passing pre-PR run"),
	});
});
