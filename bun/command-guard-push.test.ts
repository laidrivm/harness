import { afterAll, describe, expect, test } from "bun:test";
import {
	cleanup,
	detached,
	event,
	fabricate,
	run,
} from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses about a push: the force flags, and the
 * destinations it cannot show to exclude main. Its own file because the two
 * halves of the prohibition divide where the guard's own reasons do — a commit
 * or a `gh` write is refused by the name it carries, a push by where it would
 * reach.
 */

afterAll(cleanup);

/** Every push case runs from a branch, unless it is about pushing from main. */
const branch = () => fabricate("feat/x");

describe("force-pushing", () => {
	test("the flag last still blocks", () => {
		const { code, reason } = run(
			event("git push origin feat/x --force"),
			branch(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("force-pushing");
	});

	test("a lease-guarded force blocks", () => {
		expect(run(event("git push --force-with-lease"), branch()).code).toBe(2);
	});

	test("a lease with a value blocks", () => {
		expect(
			run(event("git push --force-with-lease=feat/x:abc123"), branch()).code,
		).toBe(2);
	});

	test("a dry run does not exempt a force", () => {
		// What a probe of this gate is run with, so it stays a probe: the flag
		// decides, not whether the push would have changed anything.
		expect(
			run(event("git push --dry-run --force-with-lease"), branch()).code,
		).toBe(2);
	});

	test("an includes-guarded force blocks", () => {
		expect(run(event("git push --force-if-includes"), branch()).code).toBe(2);
	});

	test("the short flag blocks", () => {
		expect(run(event("git push -f origin feat/x"), branch()).code).toBe(2);
	});

	test("the short flag bundled with another blocks", () => {
		// git reads `-uf` as `-u -f`, so a whole-argument match on `-f` alone
		// would let the bundled spelling through.
		expect(run(event("git push -uf origin feat/x"), branch()).code).toBe(2);
	});

	test("a short flag group without f does not block", () => {
		expect(run(event("git push -qn origin feat/x"), branch()).code).toBe(0);
	});

	test("a quoted separator does not split the flag away", () => {
		// A naive split would leave `git push origin "a` — no force flag in
		// it — and let the rewrite through.
		expect(run(event('git push origin "a;b" --force'), branch()).code).toBe(2);
	});

	test("an abbreviated lease flag blocks", () => {
		// git takes any unambiguous abbreviation, so `--force-w` reaches the
		// same code path as the full spelling.
		expect(run(event("git push --force-w origin feat/x"), branch()).code).toBe(
			2,
		);
	});

	test("an abbreviated includes flag blocks", () => {
		expect(run(event("git push --force-i origin feat/x"), branch()).code).toBe(
			2,
		);
	});

	test("a force-push inside a command substitution blocks", () => {
		expect(
			run(event('echo "$(git push --force origin feat/x)"'), branch()).code,
		).toBe(2);
	});

	test("an ordinary push does not block", () => {
		expect(run(event("git push -u origin feat/x"), branch()).code).toBe(0);
	});

	test("flags that merely share a prefix do not block", () => {
		expect(
			run(event("git push --follow-tags origin feat/x"), branch()).code,
		).toBe(0);
		expect(run(event("git commit --fixup HEAD"), branch()).code).toBe(0);
	});

	test("force in the description alone does not block", () => {
		// The guard reads `tool_input.command`; grepping the payload would
		// block this one on the description.
		expect(
			run(
				event("git push origin feat/x", "force the branch up to date"),
				branch(),
			).code,
		).toBe(0);
	});
});

describe("a push whose destination is main", () => {
	test("named by refspec", () => {
		const { code, reason } = run(event("git push origin HEAD:main"), branch());
		expect(code).toBe(2);
		expect(reason).toContain("main");
	});

	test("named bare, as the only operand", () => {
		expect(run(event("git push origin main"), branch()).code).toBe(2);
	});

	test("named by its full ref", () => {
		// Carries a `+` too, so it blocks as a force before the destination is
		// read — both paths refuse it, which is why the form is worth pinning.
		expect(
			run(event("git push origin +HEAD:refs/heads/main"), branch()).code,
		).toBe(2);
	});

	test("named as a deletion", () => {
		expect(run(event("git push origin :main"), branch()).code).toBe(2);
	});

	test("named by the second of two refspecs", () => {
		// The first operand is allowed; a scan stopping at the first acceptable
		// destination would let this through.
		expect(run(event("git push origin feat/x main"), branch()).code).toBe(2);
	});
});

describe("a push whose destination cannot be bounded", () => {
	test("the matching refspec", () => {
		const { code, reason } = run(event("git push origin :"), branch());
		expect(code).toBe(2);
		// It names no destination, so the reason must not invent one.
		expect(reason).toContain("no bounded destination");
	});

	test("the forcing matching refspec", () => {
		expect(run(event("git push origin +:"), branch()).code).toBe(2);
	});

	test("a wildcard refspec", () => {
		expect(
			run(event("git push origin 'refs/heads/*:refs/heads/*'"), branch()).code,
		).toBe(2);
	});

	test("a leading + on an ordinary refspec is a force", () => {
		const { code, reason } = run(
			event("git push origin +feat/x:feat/x"),
			branch(),
		);
		expect(code).toBe(2);
		expect(reason).toContain("force");
	});

	for (const flag of ["--all", "--branches", "--mirror", "--prune"]) {
		test(`${flag} acts on refs it never names`, () => {
			const { code, reason } = run(event(`git push ${flag} origin`), branch());
			expect(code).toBe(2);
			expect(reason).toContain("no bounded destination");
		});
	}

	test("an abbreviation git would resolve", () => {
		expect(run(event("git push --mir origin"), branch()).code).toBe(2);
	});
});

describe("a push while HEAD is on main", () => {
	const onMain = () => fabricate("main");

	test("with no refspec at all", () => {
		const { code, reason } = run(event("git push"), onMain());
		expect(code).toBe(2);
		expect(reason).toContain("never pushes from there");
	});

	test("aimed at a feature branch", () => {
		expect(run(event("git push origin feat/x"), onMain()).code).toBe(2);
	});

	test("behind an option whose value is a separate word", () => {
		// The form an operand split misreads: `ci.skip` is read as the
		// repository and `origin` as the only refspec, and the push passes.
		expect(run(event("git push -o ci.skip origin"), onMain()).code).toBe(2);
	});
});

describe("pushes the destination check must not block", () => {
	test("a branch whose name merely starts with main", () => {
		expect(run(event("git push origin HEAD:mainline"), branch()).code).toBe(0);
	});

	test("main as the source, not the destination", () => {
		expect(run(event("git push origin main:feat/x"), branch()).code).toBe(0);
	});

	test("HEAD with no destination", () => {
		expect(run(event("git push origin HEAD"), branch()).code).toBe(0);
	});

	test("no refspec on a feature branch", () => {
		expect(run(event("git push"), branch()).code).toBe(0);
	});

	test("main as an option's value", () => {
		// Skipped as `-o`'s value; read as an operand it would refuse the push.
		expect(run(event("git push -o main origin feat/x"), branch()).code).toBe(0);
	});

	test("the end-of-options marker", () => {
		// `--` is a prefix of all four blocked options and none of them, so the
		// prefix match has to exempt it or refuse a valid push.
		expect(run(event("git push -- origin feat/x"), branch()).code).toBe(0);
	});

	test("but the marker does not smuggle a destination past the check", () => {
		expect(run(event("git push -- origin main"), branch()).code).toBe(2);
	});
});

describe("the destination check and the paths around it", () => {
	test("--all blocks on the flag before the branch is read", () => {
		// A detached HEAD blocks for its own reason; this must not be that one.
		const { code, reason } = run(event("git push --all origin"), detached());
		expect(code).toBe(2);
		expect(reason).toContain("no bounded destination");
		expect(reason).not.toContain("could not read the current branch");
	});

	test("a detached HEAD still blocks a push that names a branch", () => {
		const { code, reason } = run(event("git push origin feat/x"), detached());
		expect(code).toBe(2);
		expect(reason).toContain("could not read the current branch");
	});

	test("inside a command substitution", () => {
		expect(
			run(event('echo "$(git push origin HEAD:main)"'), fabricate("feat/x"))
				.code,
		).toBe(2);
	});
});
