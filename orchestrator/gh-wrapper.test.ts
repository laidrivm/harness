import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "../bun/diff-budget.fixture.ts";
import { ALLOWED } from "../bun/github-app-mint.ts";

/**
 * The image's `gh` wrapper (`session-runner-image` design, *The gh wrapper*), run under sh and
 * dash with stubs for the real gh and the mint that record what each was handed.
 */

afterAll(cleanup);

const wrapper = join(import.meta.dir, "runner/gh");
// The wrapper's own `id -un`, not `userInfo()`, which bun answers "unknown" with in the runner container.
const me = Bun.spawnSync(["id", "-un"]).stdout.toString().trim();
if (!me) throw new Error("id -un printed no user name");

type Run = { code: number; err: string; mintArgs?: string[]; ghArgs?: string[]; ghToken?: string; ghStdin?: string };

/** The wrapper with `args`, as the session user unless `user` names another, with `env` added and the mint exiting `mintCode` or printing `minted`. */
function run(
	shell: string,
	args: string[],
	opts: { env?: Record<string, string>; user?: string; mintCode?: number; minted?: string } = {},
): Run {
	const dir = emptyDir("orchestrator-gh-");
	const mint = join(dir, "mint");
	const real = join(dir, "gh");
	// The mint drains its stdin as a bun start may, so a wrapper that hands it git's stdin starves gh of it.
	writeFileSync(
		mint,
		`#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' "$@" >"${dir}/mint.args"\n[ ${opts.mintCode ?? 0} = 0 ] || { echo "mint: refused" >&2; exit ${opts.mintCode}; }\nprintf '${opts.minted ?? "minted-token\\n"}'\n`,
		{ mode: 0o755 },
	);
	writeFileSync(
		real,
		`#!/bin/sh\nprintf '%s\\n' "$@" >"${dir}/gh.args"\nprintf '%s' "\${GH_TOKEN-unset}" >"${dir}/gh.token"\ncat >"${dir}/gh.stdin"\n`,
		{ mode: 0o755 },
	);
	const r = Bun.spawnSync([shell, wrapper, ...args], {
		env: {
			PATH: process.env.PATH ?? "",
			GH_WRAPPER_REAL: real,
			GH_WRAPPER_MINT: mint,
			GH_WRAPPER_USER: opts.user ?? me,
			...opts.env,
		},
		stdin: Buffer.from("protocol=https\nhost=github.com\n"),
	});
	const file = (name: string) => {
		try {
			return readFileSync(join(dir, name), "utf8");
		} catch {
			return undefined;
		}
	};
	const lines = (name: string) => file(name)?.split("\n").slice(0, -1);
	return {
		code: r.exitCode,
		err: r.stderr.toString(),
		mintArgs: lines("mint.args"),
		ghArgs: lines("gh.args"),
		ghToken: file("gh.token"),
		ghStdin: file("gh.stdin"),
	};
}

const PAIRS = [
	"contents=write",
	"pull_requests=write",
	"checks=read",
	"actions=read",
	"statuses=read",
	"workflows=write",
];

for (const shell of ["sh", "dash"])
	describe(`the gh wrapper under ${shell}`, () => {
		// spec: orchestrator/a-call-with-no-token
		test("with no GH_TOKEN as the session user, mints for laidrivm/harness with decision 39 б's pairs and hands gh the token in its environment alone", () => {
			const r = run(shell, ["pr", "list"]);
			expect(r.code).toBe(0);
			expect(r.mintArgs).toEqual(["laidrivm/harness", ...PAIRS]);
			expect(r.ghArgs).toEqual(["pr", "list"]);
			expect(r.ghToken).toBe("minted-token");
			expect(r.ghArgs?.join(" ")).not.toContain("minted-token");
		});

		test("an argument holding a space, and an empty one, reach gh as single words", () => {
			const args = ["pr", "create", "--title", "two words", "--body", ""];
			expect(run(shell, args).ghArgs).toEqual(args);
		});

		test("an empty GH_TOKEN mints as an unset one does", () => {
			const r = run(shell, ["pr", "list"], { env: { GH_TOKEN: "" } });
			expect(r.mintArgs).toEqual(["laidrivm/harness", ...PAIRS]);
			expect(r.ghToken).toBe("minted-token");
		});

		// spec: orchestrator/git-reaches-github
		test("as git's credential helper, gh gets git's stdin, which the mint never reads", () => {
			const r = run(shell, ["auth", "git-credential", "get"]);
			expect(r.ghArgs).toEqual(["auth", "git-credential", "get"]);
			expect(r.ghToken).toBe("minted-token");
			expect(r.ghStdin).toBe("protocol=https\nhost=github.com\n");
		});

		// spec: orchestrator/a-token-already-set
		test("a set GH_TOKEN reaches gh unchanged, and the mint does not run", () => {
			const r = run(shell, ["pr", "list"], { env: { GH_TOKEN: "narrow" } });
			expect([r.code, r.ghToken, r.mintArgs]).toEqual([0, "narrow", undefined]);
		});

		// spec: orchestrator/another-user
		test("another user runs gh as it is, and the mint does not run", () => {
			const r = run(shell, ["pr", "list"], { user: `not-${me}` });
			expect([r.code, r.ghArgs, r.ghToken, r.mintArgs]).toEqual([0, ["pr", "list"], "unset", undefined]);
		});

		// spec: orchestrator/the-mint-fails
		for (const status of [2, 75])
			test(`a mint exiting ${status} exits the wrapper ${status}, its stderr passed through, and gh never runs`, () => {
				const r = run(shell, ["pr", "list"], { mintCode: status });
				expect([r.code, r.ghArgs]).toEqual([status, undefined]);
				expect(r.err).toContain("mint: refused");
			});

		// spec: orchestrator/the-mint-answers-with-no-token
		test("a mint exiting 0 with no token exits the wrapper 1, naming it, and gh never runs", () => {
			const r = run(shell, ["pr", "list"], { minted: "" });
			expect([r.code, r.ghArgs]).toEqual([1, undefined]);
			expect(r.err).toContain("the mint printed no token");
		});
	});

// spec: orchestrator/a-permission-the-mint-does-not-hold
test("every pair the wrapper asks for is in the mint's fixed set", () => {
	const asked = run("sh", []).mintArgs?.slice(1) ?? [];
	expect(asked).not.toEqual([]);
	const outside = asked.filter((pair) => {
		const [name = "", level = ""] = pair.split("=");
		return !Object.hasOwn(ALLOWED, name) || !ALLOWED[name]?.includes(level);
	});
	expect(outside).toEqual([]);
});
