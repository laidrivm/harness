import { afterAll, describe, expect, test } from "bun:test";
import {
	cleanup,
	detached,
	event,
	fabricate,
	run,
} from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses by the name a command carries: a commit on
 * main, and the `gh` writes that publish under the user's. What the reading of
 * the command line gets wrong is `command-parse.test.ts`'s; what a push
 * reaches is `command-guard-push.test.ts`'s.
 */

afterAll(cleanup);

describe("an event the guard cannot read", () => {
	test("a payload with no command blocks", () => {
		const { code, reason } = run(
			{ tool_name: "Bash", tool_input: {} },
			fabricate("main"),
		);
		expect(code).toBe(2);
		expect(reason).toContain("tool_input.command");
	});

	test("a payload that is not JSON blocks", () => {
		expect(run("not json at all", fabricate("main")).code).toBe(2);
	});

	test("a command that is not a string blocks", () => {
		expect(run(event(["git", "commit"]), fabricate("main")).code).toBe(2);
	});

	test("a commit outside a work tree blocks", () => {
		// No `git init` here: `symbolic-ref` fails, and a branch the guard
		// cannot read must not resolve to "not main".
		const { code, reason } = run(event("git commit -m x"), fabricate());
		expect(code).toBe(2);
		expect(reason).toContain("current branch");
	});

	test("a commit on a detached HEAD blocks", () => {
		expect(run(event("git commit -m x"), detached()).code).toBe(2);
	});
});

describe("committing while HEAD is on main", () => {
	test("a plain commit blocks", () => {
		const { code, reason } = run(event("git commit -m fix"), fabricate("main"));
		expect(code).toBe(2);
		expect(reason).toContain("Branch first");
	});

	test("a commit reached through a compound command blocks", () => {
		expect(
			run(event('git add -A && git commit -m "fix"'), fabricate("main")).code,
		).toBe(2);
	});

	test("a commit whose compound command starts with something else blocks", () => {
		// The `if` field matches each subcommand, so the guard is reached; it
		// must find the git command past the first one for that to matter.
		expect(
			run(event("bun test && git commit -m fix"), fabricate("main")).code,
		).toBe(2);
	});

	test("a commit after a semicolon blocks", () => {
		expect(
			run(event("git status; git commit -m fix"), fabricate("main")).code,
		).toBe(2);
	});

	test("a commit on its own line blocks", () => {
		expect(
			run(event("bun test\ngit commit -m fix"), fabricate("main")).code,
		).toBe(2);
	});

	test("a commit behind a leading assignment blocks", () => {
		expect(
			run(event("GIT_TRACE=1 git commit -m fix"), fabricate("main")).code,
		).toBe(2);
	});

	test("a commit behind a global option blocks", () => {
		expect(
			run(
				event("git -c core.hooksPath=/dev/null commit -m fix"),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("the word commit inside an argument does not block", () => {
		expect(
			run(event('git log --grep="git commit"'), fabricate("main")).code,
		).toBe(0);
	});

	test("a separator inside quotes does not start a new command", () => {
		// Splitting here would leave the fragment `git commit -m x"`, and a
		// read command would be blocked as a commit.
		expect(
			run(event('git log --grep="x; git commit -m x"'), fabricate("main")).code,
		).toBe(0);
	});

	test("a commit inside a command substitution blocks", () => {
		expect(
			run(event("echo $(git commit -m fix)"), fabricate("main")).code,
		).toBe(2);
	});

	test("a commit inside backticks blocks", () => {
		expect(run(event("echo `git commit -m fix`"), fabricate("main")).code).toBe(
			2,
		);
	});

	test("a commit inside a substitution within double quotes blocks", () => {
		// The shell substitutes inside double quotes, so quote tracking alone
		// would hide this one.
		expect(
			run(event('echo "$(git commit -m fix)"'), fabricate("main")).code,
		).toBe(2);
	});

	test("a commit aimed at another repository reads that repository", () => {
		// `-C` names where the commit lands; the guard's own cwd is irrelevant.
		const elsewhere = fabricate("main");
		expect(
			run(event(`git -C ${elsewhere} commit -m fix`), fabricate("feat/x")).code,
		).toBe(2);
	});

	test("a commit aimed at a feature branch elsewhere does not block", () => {
		const elsewhere = fabricate("feat/x");
		expect(
			run(event(`git -C ${elsewhere} commit -m fix`), fabricate("main")).code,
		).toBe(0);
	});

	test("a commit aimed at an unreadable target blocks", () => {
		expect(
			run(event("git -C /nonexistent/xyz commit -m fix"), fabricate("feat/x"))
				.code,
		).toBe(2);
	});

	test("a branch merely starting with main does not block", () => {
		expect(run(event("git commit -m fix"), fabricate("mainline")).code).toBe(0);
	});

	test("a commit on a feature branch does not block", () => {
		expect(run(event("git commit -m fix"), fabricate("feat/x")).code).toBe(0);
	});

	test("a non-git command does not block", () => {
		expect(run(event("bun test"), fabricate("main")).code).toBe(0);
	});
});

describe("gh commands that publish on the user's behalf", () => {
	const anywhere = () => fabricate("feat/x");

	test("a pull request comment blocks", () => {
		const { code, reason } = run(
			event('gh pr comment 37 --body "fixed"'),
			anywhere(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("publishes text");
	});

	test("an issue comment blocks", () => {
		expect(run(event("gh issue comment 12 --body x"), anywhere()).code).toBe(2);
	});

	test("a review blocks", () => {
		expect(run(event("gh pr review 37 --approve"), anywhere()).code).toBe(2);
	});

	test("an absolute path to gh blocks", () => {
		// This is what the deny entry cannot see and the guard can.
		expect(
			run(event("/opt/homebrew/bin/gh pr comment 37 --body x"), anywhere())
				.code,
		).toBe(2);
	});

	test("a write behind a global flag blocks", () => {
		expect(
			run(event("gh --repo a/b pr comment 37 --body x"), anywhere()).code,
		).toBe(2);
	});

	test("opening a pull request does not block", () => {
		expect(run(event("gh pr create --title x --body y"), anywhere()).code).toBe(
			0,
		);
	});

	test("reading a pull request does not block", () => {
		expect(run(event("gh pr view 37 --json state"), anywhere()).code).toBe(0);
	});

	test("listing issues does not block", () => {
		expect(run(event("gh issue list"), anywhere()).code).toBe(0);
	});
});
