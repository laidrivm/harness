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
	SILENT,
	store,
	TASKS,
} from "./turn-gate.fixture.ts";
import { decide, mark } from "./turn-gate.ts";

/**
 * What the turn gate makes of the pre-PR runner's record: which record
 * discharges a reported turn, and what an absent or damaged ledger reads as.
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

/** One ledger line as the runner writes it. */
const run = (commit: string, project: string, extra: object = {}) =>
	`${JSON.stringify({
		at: "2026-10-13T00:00:00.000Z",
		gate: "pre-pr",
		decision: "pass",
		rule: "diff-budget",
		project,
		session: null,
		commit,
		...extra,
	})}\n`;

const real = (dir: string) => realpathSync(dir);

describe("which record discharges a reported turn", () => {
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

	// spec: commit-gates/a-run-record-from-another-checkout
	test("a record for the tip from another clone does not discharge", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, `${real(dir)}-clone`));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});

	// spec: commit-gates/a-run-from-a-subdirectory
	test("a record from a subdirectory of this checkout discharges", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, join(real(dir), "openspec")));
		expect(decide(end(dir, REPORTED), marks)).toBeUndefined();
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

	// spec: commit-gates/a-run-that-failed
	test("a `fail` record discharges [29]", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir), { decision: "fail" }));
		expect(decide(end(dir, REPORTED), marks)).toBeUndefined();
	});

	test("a `turn-gate` record naming the tip does not discharge [32]", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir), { gate: "turn-gate" }));
		expect(decide(end(dir, REPORTED), marks)).toBeString();
	});
});

describe("what the message still has to carry", () => {
	// spec: commit-gates/a-run-record-and-no-gate-line
	test("a record with no gate line is refused [33]", () => {
		const { dir, marks, tip } = finished();
		ledger(run(tip, real(dir)));
		expect(decide(end(dir, SILENT), marks)).toBeString();
	});

	// spec: commit-gates/blocked-without-a-run
	test("a named `BLOCKED` with no record ends the turn [34]", () => {
		const { dir, marks } = finished();
		const message = "BLOCKED — pick a name for the flag.";
		expect(decide(end(dir, message), marks)).toBeUndefined();
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
	/** Runs a copy of the gate installed at `at` inside the repository. */
	function refusal(at: string) {
		const dir = repo({ [TASKS]: OPEN });
		const tmp = store();
		mark(prompt(dir), join(tmp, "turn-gate"));
		commit(dir, { [TASKS]: DONE });
		const bin = join(dir, at);
		mkdirSync(bin, { recursive: true });
		for (const file of ["turn-gate.ts", "gate-ledger.ts"])
			copyFileSync(join(import.meta.dir, file), join(bin, file));
		const call = Bun.spawnSync(["bun", join(bin, "turn-gate.ts"), "stop"], {
			cwd: dir,
			env: { PATH: process.env.PATH, TMPDIR: tmp, XDG_STATE_HOME: state },
			stdin: Buffer.from(JSON.stringify(end(dir, REPORTED))),
		});
		return call.stderr.toString();
	}

	test("from the harness tree, it is `bun/pre-pr.ts` [27]", () => {
		expect(refusal("bun")).toContain(" bun/pre-pr.ts");
	});

	test("from an installed copy, it is under `node_modules/harness` [28]", () => {
		expect(refusal("node_modules/harness/bun")).toContain(
			" node_modules/harness/bun/pre-pr.ts",
		);
	});
});
