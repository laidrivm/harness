import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	cleanup,
	commit,
	DONE,
	end,
	git,
	OPEN,
	prompt,
	repo,
	runLines as run,
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";
import { decide, mark } from "./turn-gate.ts";

/**
 * What the turn gate makes of the pre-PR runner's records: which discharge a
 * turn, whatever its message, and what an absent or damaged ledger reads as.
 * Bracketed numbers are the proposal-stage `/zombies` ideas. `XDG_STATE_HOME`
 * points at a directory of each case's own, and is restored after the file.
 */

const saved = process.env.XDG_STATE_HOME;
afterAll(() => {
	process.env.XDG_STATE_HOME = saved;
	cleanup();
});

let state = "";
beforeEach(() => {
	state = store();
	process.env.XDG_STATE_HOME = state;
});

// A `PASS` gate line, which the gate does not read: the records alone decide.
const REPORTED = `${SILENT}\n\nTRIAGE gate: PASS — 1 groups.`;

/** A repository whose turn has committed the last task of its group. */
function finished() {
	const dir = repo({ [TASKS]: OPEN });
	const marks = store();
	mark(prompt(dir), marks);
	commit(dir, { [TASKS]: DONE });
	return { dir, marks, tip: git(dir, "rev-parse", "HEAD") };
}

/** Appends raw lines to this case's ledger. */
function ledger(...lines: string[]) {
	mkdirSync(join(state, "harness"), { recursive: true });
	writeFileSync(join(state, "harness", "gates.jsonl"), lines.join(""));
}

const real = (dir: string) => realpathSync(dir);

describe("which record discharges a turn", () => {
	// spec: commit-gates/the-turn-reports-its-gates
	test("a record for the tip ends the turn [21]", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir)));
		expect(decide(end(dir, REPORTED), marks)).toBeUndefined();
	});

	// spec: commit-gates/gate-lines-with-no-run-behind-them
	test("without one the turn is refused, naming the tip and the runner [22]", () => {
		const { dir, marks, tip } = finished();
		const reason = decide(end(dir, REPORTED), marks) ?? "";
		expect([reason.includes(tip), reason.includes("pre-pr.ts")]).toEqual([
			true,
			true,
		]);
	});

	test("the tip's record is found among other projects' and gates' [23]", () => {
		const { dir, marks, tip } = finished();
		ledger(
			run(tip, "/elsewhere"),
			run(tip, real(dir), { gate: "command-guard" }),
			run(tip, real(dir)),
			run("0".repeat(40), real(dir)),
		);
		expect(decide(end(dir, REPORTED), marks)).toBeUndefined();
	});

	// spec: commit-gates/a-run-record-for-an-earlier-commit
	test("records for earlier commits only do not discharge [24]", () => {
		const { dir, marks } = finished();
		ledger(run(git(dir, "rev-parse", "HEAD~1"), real(dir)));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	test("a prefix of the tip does not match [25]", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip.slice(0, 12), real(dir)));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	// spec: gate-ledger/a-skill-record-at-the-tip
	test("a skill call recorded for the tip does not discharge (judgement-step-record [25])", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir), { gate: "skill", decision: "called", rule: "zombies" }).split("\n")[0]);
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	// spec: commit-gates/a-run-record-from-another-checkout
	test("a record for the tip from another clone does not discharge", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, `${real(dir)}-clone`));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	// spec: commit-gates/a-worktree-nested-inside-the-checkout
	test("a record naming a path under this checkout does not discharge", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, join(real(dir), ".worktrees", "other")));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	test("a tip read from the remote-tracking ref needs that ref's record [26]", () => {
		const dir = repo({ [TASKS]: OPEN });
		const marks = store();
		const at = git(dir, "rev-parse", "HEAD");
		mark(prompt(dir), marks);
		commit(dir, { [TASKS]: DONE });
		const pushed = git(dir, "rev-parse", "HEAD");
		git(dir, "push");
		git(dir, "reset", "--hard", at);
		ledger(run(pushed, real(dir)));
		expect(decide(end(dir, REPORTED), marks)).toBeUndefined();
	});

	test("a `fail` record of both steps does not discharge [29]", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir), { decision: "fail" }));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	test("a `turn-gate` record naming the tip does not discharge [32]", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir), { gate: "turn-gate" }));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});
});

describe("the hook reads the runner's records, not the message", () => {
	/** Decides the same mark twice: a refusal, then what the bound makes of it. */
	const twice = (dir: string, marks: string, message?: string) => [
		typeof decide(end(dir, message), marks),
		decide(end(dir, message), marks),
	];

	// spec: commit-gates/a-run-record-and-no-gate-line
	test("a silent turn with a passing run of the tip ends", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir)));
		expect(decide(end(dir, SILENT), marks)).toBeUndefined();
	});

	// spec: commit-gates/a-bare-marker-with-nothing-after-it
	test("a bare `BLOCKED` with a passing run ends", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir)));
		expect(decide(end(dir, "BLOCKED"), marks)).toBeUndefined();
	});

	// spec: commit-gates/a-run-that-failed
	test("a failed project checks' record beside the budget's pass refuses once, then releases", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir), {}, ["diff-budget"]), run(tip, real(dir), { decision: "fail" }, ["project-checks"]));
		expect(twice(dir, marks, REPORTED)).toEqual(["string", undefined]);
	});

	// spec: commit-gates/one-step-s-record-alone
	test("the diff budget's pass alone refuses", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir), {}, ["diff-budget"]));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	// spec: commit-gates/blocked-without-a-run
	// spec: commit-gates/the-turn-names-what-only-the-user-can-settle
	test("a named `BLOCKED` with no record refuses once, then the mark releases it", () => {
		const { dir, marks } = finished();
		expect(twice(dir, marks, "BLOCKED — pick a name for the flag.")).toEqual(["string", undefined]);
	});

	// spec: commit-gates/the-final-message-cannot-be-read
	test("an event with no final message and no record refuses", () => {
		const { dir, marks } = finished();
		expect(decide(end(dir), marks)).toBeString();
	});

	// spec: stage-goal/the-line-the-turn-gate-reads
	test("the goal check's `goal met` line ends a turn with a passing run, and is refused once without one", () => {
		const [met, ran, bare] = ["goal met: apply c step 1 at 1234567", finished(), finished()] as const;
		ledger(run(ran.tip, real(ran.dir)));
		expect([decide(end(ran.dir, met), ran.marks), ...twice(bare.dir, bare.marks, met)]).toEqual([undefined, "string", undefined]);
	});

	// spec: commit-gates/a-task-group-is-completed-and-the-turn-ends-silently
	test("the refusal names the group, the tip, the runner, that it is not repeated, and the whole final message", () => {
		const { dir, marks, tip } = finished();
		const reason = decide(end(dir, SILENT), marks) ?? "";
		for (const part of ["1. Group", tip, "pre-pr.ts", "not repeated", "whole final message"])
			expect(reason).toContain(part);
	});
});

describe("a ledger the gate cannot use", () => {
	// spec: commit-gates/no-ledger-at-all
	test("no ledger file means one refusal, then a release [19]", () => {
		const { dir, marks } = finished();
		const first = decide(end(dir, REPORTED), marks);
		const second = decide(end(dir, REPORTED), marks);
		expect([typeof first, second]).toEqual(["string", undefined]);
	});

	test("an empty ledger reads as no record [20]", () => {
		const { dir, marks } = finished();
		ledger("");
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	test("a torn line does not hide the record after it [30]", () => {
		const { dir, marks, tip } = finished();
		ledger('{"gate":"pre-pr","comm\n', run(tip, real(dir)));
		expect(decide(end(dir, REPORTED), marks)).toBeUndefined();
	});

	test("a ledger path that is a directory reads as no record [31]", () => {
		const { dir, marks } = finished();
		mkdirSync(join(state, "harness", "gates.jsonl"), { recursive: true });
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});
});

describe("the runner's path in the refusal", () => {
	/**
	 * Runs a copy of the gate installed at `at` inside the repository, for a
	 * session whose working directory is `from` within it.
	 */
	function refusal(at: string, from = "") {
		const dir = repo({ [TASKS]: OPEN });
		const cwd = join(dir, from);
		const tmp = store();
		mark(prompt(cwd), join(tmp, "turn-gate"));
		commit(dir, { [TASKS]: DONE });
		const bin = join(dir, at);
		mkdirSync(bin, { recursive: true });
		for (const file of [
			"turn-gate.ts",
			"branch-state.ts",
			"gate-ledger.ts",
			"goal-rounds.ts",
		])
			copyFileSync(join(import.meta.dir, file), join(bin, file));
		const call = Bun.spawnSync(["bun", join(bin, "turn-gate.ts"), "stop"], {
			cwd,
			env: { PATH: process.env.PATH, TMPDIR: tmp, XDG_STATE_HOME: state },
			stdin: Buffer.from(JSON.stringify(end(cwd, REPORTED))),
		});
		return call.stderr.toString();
	}

	test("from a subdirectory, it is the path that reaches the runner from there", () => {
		expect(refusal("bun", "openspec")).toContain(" ../bun/pre-pr.ts");
	});

	test("from the harness tree, it is `bun/pre-pr.ts` [27]", () => {
		expect(refusal("bun")).toContain(" bun/pre-pr.ts");
	});

	test("from an installed copy, it is under `node_modules/harness` [28]", () => {
		expect(refusal("node_modules/harness/bun")).toContain(
			" node_modules/harness/bun/pre-pr.ts",
		);
	});
});
