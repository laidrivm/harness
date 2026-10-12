import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, event, fabricate, run } from "./command-guard.fixture.ts";

/**
 * The quoting cases of `command-parse.test.ts` that nest a substitution, a
 * case statement or a group inside another — split off when that file passed
 * its line cap. Exercised through the guard for the reason that file gives.
 */

afterAll(cleanup);

describe("quoting that hides the command from a naive tokeniser", () => {
	test("a command after a substitution inside quotes blocks", () => {
		// The substitution suspends the enclosing double quote; the closing one
		// used to be read as an opening quote instead, and everything after it —
		// the separator included — was swallowed into one quoted word.
		expect(
			run(event('echo "$(true)"; git commit -m fix'), fabricate("main")).code,
		).toBe(2);
	});

	test("a case pattern inside a substitution does not close it either", () => {
		// A `)` ending a case pattern closes nothing the scan opened, so popping
		// there restored the enclosing quote while the substitution was still
		// open and swallowed the commit after it.
		expect(
			run(
				event('echo "$(case x in a) git commit -m fix ;; esac)"'),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("a pattern's own parenthesis and alternation open nothing", () => {
		// `(` opening a pattern is not a subshell and `|` between alternatives is
		// not a pipe: reading them as shell syntax suspended a frame the
		// substitution's `)` then restored, and counted the literal `case` in the
		// pattern as a keyword — the closing quote swallowed the commit.
		expect(
			run(
				event('echo "$(case x in (foo|case) true ;; esac)"; git commit -m fix'),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("a parenthesised pattern after the first is read as one too", () => {
		// The scan re-enters a pattern at `;;`, without which the second pattern's
		// `(` suspends a frame nothing restores.
		expect(
			run(
				event(
					'echo "$(case x in a) true ;; (b|case) true ;; esac)"; git commit -m fix',
				),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("the word case as an argument opens none inside a substitution", () => {
		// The one input that still tells the two apart once the depth travels on
		// the stack: counting it here leaves the substitution unable to close.
		expect(
			run(
				event('echo "$(echo case; true)"; git commit -m fix'),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("the word case as an argument opens no case statement", () => {
		// Counting it would leave the stack unpopped, and the real closing quote
		// then reads as an opening one — the bug the stack exists to stop.
		expect(
			run(
				event('echo case; echo "$(true)"; git commit -m fix'),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("a substitution inside a case pattern still closes", () => {
		// The case depth travels on the suspended stack: an outer `case` left
		// standing stopped the inner `$( … )` closing, and everything after it
		// went into a quote read as opening.
		expect(
			run(
				event('case x in a) echo "$(true)"; git commit -m fix ;; esac'),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("a case nested in a case closes in the right order", () => {
		expect(
			run(
				event(
					'echo "$(case x in a) case y in b) git commit -m fix ;; esac ;; esac)"',
				),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("a command after the case closes is still read", () => {
		// The one case that notices whether `esac` lowers the count: without it
		// the closing `)` never pops, and everything after the substitution is
		// swallowed by a quote read as opening.
		expect(
			run(
				event('echo "$(case x in a) true ;; esac)"; git commit -m fix'),
				fabricate("main"),
			).code,
		).toBe(2);
	});

	test("a stray esac leaves the count at zero", () => {
		expect(run(event("esac; git commit -m fix"), fabricate("main")).code).toBe(
			2,
		);
	});

	test("a case statement outside any substitution still blocks", () => {
		expect(
			run(event("case x in a) git commit -m fix ;; esac"), fabricate("main"))
				.code,
		).toBe(2);
	});

	test("a group inside a substitution does not close the substitution", () => {
		// The inner `)` closes the group, not the `$(`. Restoring the enclosing
		// quote there put the rest of the substitution back inside quotes, and
		// the commit went unchecked.
		expect(
			run(event('echo "$( ( true ); git commit -m fix )"'), fabricate("main"))
				.code,
		).toBe(2);
	});

	test("a command after a backtick substitution inside quotes blocks", () => {
		expect(
			run(event('echo "`true`"; git commit -m fix'), fabricate("main")).code,
		).toBe(2);
	});
});
