/**
 * What the flake watch names, what it records, and how it fails open. What
 * counts as the same tree and as a test run is `flake-watch-tree.test.ts`'s.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { HOOKS } from "./bootstrap.ts";
import {
	cleanup,
	failed,
	failing,
	hint,
	ledger,
	PASSING,
	passed,
	play,
	repo,
	run,
	script,
	temp,
} from "./flake-watch.fixture.ts";
import { read } from "./flake-watch.ts";

afterAll(cleanup);

const command = (c: string) => ({ tool_input: { command: c } });

describe("the empty case", () => {
	// spec: flaky-tests/a-failure-alone
	test("a failing event with no store exits 0, says nothing and records nothing [1]", () => {
		const tmp = temp();
		expect(play([failed(repo())], tmp)).toBe("");
		expect(existsSync(ledger(tmp))).toBe(false);
	});

	// spec: flaky-tests/a-pass-with-no-failure-before-it
	test("a passing event with no store exits 0 with no output [2]", () => {
		expect(play([passed(repo())])).toBe("");
	});

	// spec: flaky-tests/a-failing-command-that-is-not-a-test-run
	test("a call whose output holds no reporter text writes no store entry [3]", () => {
		const tmp = temp();
		const dir = repo();
		play([failed(dir, "Exit code 128\nfatal: not a git command"), passed(dir)], tmp);
		// The pass makes the directory, as every test run does; no entry is written.
		expect(readdirSync(join(tmp, "flake-watch"))).toEqual([]);
	});
});

describe("the one case", () => {
	// spec: flaky-tests/failed-then-passed-unchanged flaky-tests/a-flaky-run-found
	test("a fail, then a pass on the same tree, names the test without its duration [4]", () => {
		const dir = repo();
		const said = hint(play([failed(dir), passed(dir)]));
		expect(said).toStartWith("flake-watch:");
		expect(said).toContain(": grp > flips.");
		expect(said).not.toContain("0.41ms");
		expect(said).toContain("`flaky` finding");
		expect(said).toContain("file a card");
	});

	// spec: flaky-tests/a-finding-recorded gate-ledger/a-flaky-run-named
	test("the hint adds one record, holding the commit and nothing of the run [5]", () => {
		const tmp = temp();
		const dir = repo();
		const secret = { tool_input: { command: "bun test hunter2" } };
		const error = `Exit code 1\n${failing("grp > swordfish")}`;
		play([failed(dir, error, secret), passed(dir, PASSING, secret)], tmp);
		const text = readFileSync(ledger(tmp), "utf8");
		const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: dir });
		expect(text.trim().split("\n").map((l) => JSON.parse(l))).toMatchObject([
			{
				gate: "flake-watch",
				decision: "flaky",
				rule: "fail-then-pass",
				commit: head.stdout.toString().trim(),
			},
		]);
		for (const word of ["swordfish", "hunter2", "bun test", "(fail)"])
			expect(text).not.toContain(word);
	});
});

describe("the many cases", () => {
	// spec: flaky-tests/two-failing-runs-then-a-pass
	test("fails naming a, then b, then a pass, name both [6]", () => {
		const dir = repo();
		const fail = (name: string) => failed(dir, failing(name));
		const said = hint(play([fail("a"), fail("b"), passed(dir)]));
		expect(said).toContain(": a, b.");
	});

	test("one name failing twice is named once [7]", () => {
		const dir = repo();
		const said = hint(play([failed(dir), failed(dir), passed(dir)]));
		expect(said?.split("grp > flips")).toHaveLength(2);
	});

	// spec: flaky-tests/a-different-command-passes
	test("with commands A and B interleaved, B's pass says nothing [8]", () => {
		const dir = repo();
		const b = command("bun test bun/a.test.ts");
		expect(play([failed(dir), passed(dir, PASSING, b)])).toBe("");
	});

	test("with commands A and B interleaved, A's later pass names the test [8]", () => {
		const dir = repo();
		const b = command("bun test bun/a.test.ts");
		const steps = [failed(dir), passed(dir, PASSING, b), passed(dir)];
		expect(hint(play(steps))).toContain(": grp > flips.");
	});

	// spec: flaky-tests/another-session-s-failure
	test.each([
		["another session [9]", { session_id: "s2" }],
		["a sub-agent of its own session [10]", { agent_id: "a1" }],
	])("a pass in %s says nothing", (_, over) => {
		const dir = repo();
		expect(play([failed(dir), passed(dir, PASSING, over)])).toBe("");
	});

	test("two processes writing at once leave a store that parses [11]", async () => {
		const tmp = temp();
		const dir = repo();
		const calls = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
			Bun.spawn(["bun", script], {
				cwd: tmp,
				env: { PATH: process.env.PATH, TMPDIR: tmp, XDG_STATE_HOME: tmp },
				stdin: Buffer.from(
					JSON.stringify(failed(dir, undefined, command(`bun test ${n}`))),
				),
			}),
		);
		await Promise.all(calls.map((call) => call.exited));
		const store = join(tmp, "flake-watch");
		const texts = readdirSync(store).map((f) => readFileSync(join(store, f), "utf8"));
		expect(() => texts.map((text) => JSON.parse(text))).not.toThrow();
	});
});

describe("the interface cases", () => {
	// spec: flaky-tests/a-push-whose-pre-push-hook-runs-the-suite
	test("a pass answers under each event `HOOKS` registers it on [24] [44]", () => {
		const dir = repo();
		// A push refused after its suite passed is a pass seen on a failure.
		const pass = {
			PostToolUse: passed(dir),
			PostToolUseFailure: failed(dir, `${PASSING}\nerror: failed to push`),
		};
		const events = HOOKS.filter((h) => h.name === "harness flake watch").map(
			(h) => h.event as keyof typeof pass,
		);
		expect(events).toEqual(["PostToolUse", "PostToolUseFailure"]);
		const answered = events.map(
			(event) =>
				JSON.parse(play([failed(dir), pass[event]])).hookSpecificOutput.hookEventName,
		);
		expect(answered).toEqual(events);
	});

	test("the installed bun's reporter is read for the name and the count [25]", () => {
		const dir = temp();
		const body = 'import { describe, expect, test } from "bun:test";\n' +
			'describe("grp", () => test("flips", () => expect(1).toBe(2)));\n';
		writeFileSync(join(dir, "x.test.ts"), body);
		const call = Bun.spawnSync(["bun", "test"], {
			cwd: dir,
			env: { PATH: process.env.PATH },
		});
		const output = call.stdout.toString() + call.stderr.toString();
		expect(read(output)).toEqual({ passing: false, names: ["grp > flips"] });
		// The count alone, with every name line gone, still reads as failing.
		expect(read(output.replace(/^\(fail\).*$/gm, ""))?.passing).toBe(false);
	});

	test("a pass whose summary arrives only on stderr is read [26]", () => {
		const dir = repo();
		const pass = passed(dir);
		pass.tool_response = { ...pass.tool_response, stdout: "", stderr: PASSING };
		expect(hint(play([failed(dir), pass]))).toContain("grp > flips");
	});

	test("the store file is private", () => {
		const tmp = temp();
		play([failed(repo())], tmp);
		const store = join(tmp, "flake-watch");
		const [file = ""] = readdirSync(store);
		expect(statSync(join(store, file)).mode & 0o777).toBe(0o600);
	});
});

describe("the exception cases", () => {
	// spec: flaky-tests/an-unreadable-event
	test("an event that is not JSON exits 0 with no output [27]", () => {
		expect(run(temp(), "not json")).toBe("");
	});

	test("a session id holding `/` and `..` decides nothing [28]", () => {
		const dir = repo();
		const over = { session_id: "../s1" };
		expect(play([failed(dir, undefined, over), passed(dir, PASSING, over)])).toBe("");
	});

	// spec: flaky-tests/outside-a-repository
	test("a directory that is not a git working tree decides nothing [29]", () => {
		const dir = temp();
		expect(play([failed(dir), passed(dir)])).toBe("");
	});

	// spec: flaky-tests/an-unwritable-store
	test("with the store unwritable, a fail and a pass say nothing [30]", () => {
		const tmp = temp();
		writeFileSync(join(tmp, "flake-watch"), ""); // a file where the store goes
		const dir = repo();
		expect(play([failed(dir), passed(dir)], tmp)).toBe("");
	});

	test("a store directory others can open decides nothing", () => {
		const tmp = temp();
		mkdirSync(join(tmp, "flake-watch"), { mode: 0o777 });
		chmodSync(join(tmp, "flake-watch"), 0o777); // past the umask
		const dir = repo();
		expect(play([failed(dir), passed(dir)], tmp)).toBe("");
	});

	// The race CodeRabbit named on #192 (another user makes the directory
	// between a check and the read) has no deterministic window, so these pin
	// the order that closes it: the directory is made and checked before any read.
	test("a test run makes the private store directory before it reads the store", () => {
		const tmp = temp();
		play([passed(repo())], tmp);
		expect(statSync(join(tmp, "flake-watch")).mode & 0o777).toBe(0o700);
	});

	test("a store file in a directory others can open is neither read nor written", () => {
		const tmp = temp();
		const store = join(tmp, "flake-watch");
		mkdirSync(store, { mode: 0o777 });
		chmodSync(store, 0o777); // past the umask
		writeFileSync(join(store, "s1"), "{}");
		const dir = repo();
		expect(play([failed(dir), passed(dir)], tmp)).toBe("");
		expect(readFileSync(join(store, "s1"), "utf8")).toBe("{}");
	});

	test("a garbage store file counts as empty [31]", () => {
		const tmp = temp();
		mkdirSync(join(tmp, "flake-watch"), { mode: 0o700 });
		writeFileSync(join(tmp, "flake-watch", "s1"), "{garbage");
		const dir = repo();
		expect(hint(play([failed(dir), passed(dir)], tmp))).toContain("grp > flips");
	});

	test("with the ledger unwritable, the hint is still given [32]", () => {
		const tmp = temp();
		writeFileSync(join(tmp, "harness"), ""); // a file where its directory goes
		const dir = repo();
		expect(hint(play([failed(dir), passed(dir)], tmp))).toContain("grp > flips");
	});
});

describe("the simple scenarios", () => {
	const fails = `Exit code 1\n${failing("grp > flips")}`;
	// spec: flaky-tests/a-script-that-wraps-the-suite
	//   flaky-tests/a-push-whose-pre-push-hook-runs-the-suite
	//   flaky-tests/a-piped-run-that-hides-the-exit-code
	test.each([
		["bun run test", "[35]", fails, PASSING],
		["git push", "[36]", `${fails}\nerror: failed to push`, `${PASSING}\nTo o.git`],
		["bun test 2>&1 | tail -40", "[37]", undefined, PASSING],
	])("%s %s failing, then passing, is named", (c, _, error, stdout) => {
		const dir = repo();
		const first =
			error === undefined
				? passed(dir, failing("grp > flips"), command(c))
				: failed(dir, error, command(c));
		const said = hint(play([first, passed(dir, stdout, command(c))]));
		expect(said).toContain("grp > flips");
	});
});
