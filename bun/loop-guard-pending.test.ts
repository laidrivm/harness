import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { after, before, cleanup, failure, run, SILENT, temp } from "./loop-guard.fixture.ts";

/**
 * The one failure the loop guard does not count: `gh pr checks` exiting 8,
 * which gh documents as *Checks pending*, when the command is gh's alone.
 * What counts as one call otherwise is `loop-guard.test.ts`'s.
 */

// Every case spawns the hook synchronously several times; bun's 5 s default fails them on a busy laptop.
setDefaultTimeout(20_000);

afterAll(cleanup);

/** gh's answer while a check is still pending, as the hook receives it: gh off a terminal prints tab-separated rows. */
const PENDING =
	"Exit code 8\nCodeRabbit\tpending\t0\thttps://github.com/laidrivm/harness/pull/437\ntest\tpass\t1m5s\thttps://github.com/laidrivm/harness/actions/runs/1\n";

/** Every word of the set, a tab separator and a redirect: the line the shells run below. */
const EVERY_WORD = "gh pr checks 437 -R o/r\t--interval=30 a.b:c@d_e-f 2>&1";

/** A failure of `command` with `error`. */
const read = (command: string, error = PENDING) => failure({ tool_input: { command }, error });

/** The answers to `n` identical failures, then to the call about to run again. */
function answers(n: number, event: ReturnType<typeof read>) {
	const tmp = temp();
	const fails = Array.from({ length: n }, () => run(tmp, event));
	return [...fails, run(tmp, before({ tool_input: event.tool_input, tool_name: event.tool_name }))];
}

/** The `additionalContext` the third of three identical failures adds. */
function third(event: object): string {
	const { out } = after([event, event], event);
	return out ? JSON.parse(out).hookSpecificOutput.additionalContext : "";
}

describe("a pending checks read is not counted", () => {
	// spec: loop-guard/checks-still-pending-read-four-times
	test("`gh pr checks 437` exiting 8 four times warns of nothing and runs a fifth time", () => {
		expect(answers(4, read("gh pr checks 437"))).toEqual(Array(5).fill(SILENT));
	});

	// spec: loop-guard/a-repository-flag-and-a-redirect
	test.each(["gh pr checks 437 -R laidrivm/harness 2>&1", "gh pr checks 437 --repo laidrivm/harness", EVERY_WORD])(
		"`%s` exiting 8 three times is not counted",
		(command) => {
			expect(answers(3, read(command))).toEqual(Array(4).fill(SILENT));
		},
	);

	test("a bare `gh pr checks` exiting 8 is not counted", () => {
		expect(answers(3, read("gh pr checks"))).toEqual(Array(4).fill(SILENT));
	});

	test("an error that is `Exit code 8` with no output is not counted", () => {
		expect(answers(3, read("gh pr checks 437", "Exit code 8"))).toEqual(Array(4).fill(SILENT));
	});

	// The 8's output is the 1's, so, counted, it would fold into their fingerprint.
	test("a skipped read leaves the count as it was", () => {
		const failed = read("gh pr checks 437", "Exit code 1\nX lint\t1m5s\n");
		const pending = read("gh pr checks 437", "Exit code 8\nX lint\t1m5s\n");
		const { out } = after([failed, failed, pending], failed);
		expect(JSON.parse(out).hookSpecificOutput.additionalContext).toContain("3 times");
	});
});

describe("every other failure is counted", () => {
	// spec: loop-guard/a-failed-check
	test("`gh pr checks 437` exiting 1 warns on the third failure", () => {
		expect(third(read("gh pr checks 437", "Exit code 1\nX lint\t1m5s\n"))).toContain("3 times");
	});

	// spec: loop-guard/the-read-inside-a-compound-command
	test.each([
		"gh pr checks 437 | cut -f1",
		"gh pr checks 437; gh pr checks 438",
		"gh pr checks 437 && true",
		"gh pr checks 437\nfalse",
		'gh pr checks "$N"',
		"gh pr checks $(cat n)",
	])("`%s` exiting 8 warns on the third failure", (command) => {
		expect(third(read(command))).toContain("3 times");
	});

	// spec: loop-guard/a-word-outside-the-set
	test.each([
		"gh pr checks fix+retry",
		"gh pr checks 4372>&1",
		"gh pr checks $N 2>&1",
		"gh pr checks *",
		"gh pr checks ~",
	])("`%s` exiting 8 warns on the third failure", (command) => {
		expect(third(read(command))).toContain("3 times");
	});

	// spec: loop-guard/another-command-exiting-8
	test("`bun test` exiting 8 warns on the third failure", () => {
		expect(third(read("bun test"))).toContain("3 times");
	});

	test("an error whose first line is `Exit code 80` warns on the third failure", () => {
		expect(third(read("gh pr checks 437", "Exit code 80\n"))).toContain("3 times");
	});

	test("a tool other than Bash with that command and `Exit code 8` warns on the third failure", () => {
		const event = { ...read("gh pr checks 437", "Exit code 8"), tool_name: "Monitor" };
		expect(third(event)).toContain("Monitor");
	});
});

/** Runs `command` under `shell` with `gh` a function returning 8. */
function exit(shell: string, command: string): number | null {
	const script = `gh() { return 8; }\n${command}\n`;
	const env = { PATH: process.env.PATH };
	const args = shell === "zsh" ? [shell, "-f", "-c", script] : [shell, "-c", script];
	return Bun.spawnSync(args, { env, stdout: "ignore", stderr: "ignore" }).exitCode;
}

// design.md, *Match the whole command*: a line the exemption matches is one
// simple command, so its exit code is gh's, except where zsh's `=word` fails
// the line before gh runs — with 1, never the 8 the exemption holds.
// A shell not installed is reported as a skip, never dropped from the count.
describe("the shells read a matched line as gh's call alone", () => {
	for (const shell of ["dash", "bash", "zsh"]) {
		test.skipIf(!Bun.which(shell))(`under ${shell}, every word of the set and a redirect exit 8`, () => {
			expect(exit(shell, EVERY_WORD)).toBe(8);
		});

		test.skipIf(!Bun.which(shell))(`under ${shell}, a leading \`=\` word exits ${shell === "zsh" ? 1 : 8}`, () => {
			expect(exit(shell, "gh pr checks =nosuchcmd")).toBe(shell === "zsh" ? 1 : 8);
		});
	}
});
