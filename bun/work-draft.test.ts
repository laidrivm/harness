/**
 * `bun bun/work.ts draft --pr <n>` run as a session runs it, over
 * `work-resolve.fixture.ts`'s checkout and `gh` stub: the arguments, the
 * draft, the refusals, and the rule naming the command. Bracketed numbers are
 * the proposal-stage `/zombies` ideas.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, git } from "./diff-budget.fixture.ts";
import { USAGE } from "./work.ts";
import { checkout } from "./work-finish.fixture.ts";
import { A, type Gh, resolve } from "./work-resolve.fixture.ts";

afterAll(() => {
	cleanup();
});

/** Pull request 7 of `o/demo` as REST answers it: open and ready unless `fields` say otherwise. */
const seven = (fields: object = {}) => ({
	number: 7,
	state: "open",
	merged_at: null,
	draft: false,
	head: { sha: A },
	base: { ref: "main" },
	...fields,
});

const draft = (
	gh: Gh = { pulls: [seven()] },
	args = ["--pr", "7"],
	extra: { cwd?: string; env?: Record<string, string> } = {},
) => resolve({ args: ["draft", ...args], gh, ...extra });

const UNDO = ["pr", "ready", "7", "-R", "o/demo", "--undo"];

describe("the arguments", () => {
	// spec: work-draft/no-pull-request-named
	// spec: work-draft/a-malformed-number
	// spec: work-draft/two-pull-requests-named
	test.each([
		["no argument [1]", []],
		["--pr 7 --pr 8 [4]", ["--pr", "7", "--pr", "8"]],
		["--pr 0 [5]", ["--pr", "0"]],
		["--pr 07 [6]", ["--pr", "07"]],
		["--pr 7x [7]", ["--pr", "7x"]],
		["--pr with no value [8]", ["--pr"]],
		["--pr= [8]", ["--pr="]],
		["a positional 7 [9]", ["7"]],
		["an unknown --card beside --pr 7 [10]", ["--pr", "7", "--card", "40f39875c31b817bbb4fef9526c2302a"]],
	])("%s prints the usage and exits 2, calling no gh", async (_, given) => {
		const run = await draft(undefined, given);
		expect([run.code, run.err.trim(), run.gh]).toEqual([2, USAGE.join("\n"), []]);
	});
});

describe("the draft", () => {
	// spec: work-draft/a-ready-pull-request
	test("an open ready #7 is undone once and named with its full head [2]", async () => {
		const run = await draft();
		expect([run.code, run.lines, run.readies]).toEqual([0, [`draft: #7 marked draft, head ${A}`], [UNDO]]);
	});

	// spec: work-draft/already-a-draft
	test("an open draft makes no gh pr ready call and names its head [3]", async () => {
		const run = await draft({ pulls: [seven({ draft: true })] });
		expect([run.code, run.lines, run.readies]).toEqual([0, [`draft: #7 already a draft, head ${A}`], []]);
	});
});

describe("the refusals", () => {
	/** A run that refused: exit 1, one line opening `draft: refused —` and holding each of `said`, no `gh pr ready`. */
	function refused(run: Awaited<ReturnType<typeof draft>>, ...said: string[]) {
		expect([run.code, run.lines.length, run.readies]).toEqual([1, 1, []]);
		expect(run.lines[0]).toStartWith("draft: refused — ");
		for (const part of said) expect(run.lines[0]).toContain(part);
	}

	// spec: work-draft/a-merged-pull-request
	test("a merged #7 is refused as merged [15]", async () => {
		refused(await draft({ pulls: [seven({ state: "closed", merged_at: "2026-11-06T00:00:00Z" })] }), "#7", "merged");
	});

	test("a closed #7 is refused as closed [16]", async () => {
		refused(await draft({ pulls: [seven({ state: "closed" })] }), "#7", "closed");
	});

	test("a merged #7 with no head is refused as merged, not unread (local review)", async () => {
		refused(
			await draft({ pulls: [seven({ state: "closed", merged_at: "2026-11-06T00:00:00Z", head: null })] }),
			"merged",
		);
	});

	// spec: work-draft/an-unread-pull-request
	test("a read exiting non-zero is refused as unread [17]", async () => {
		refused(await draft({ pullsCode: [1] }), "cannot read #7");
	});

	test.each([
		["seven hex digits", "1a2b3c4"],
		["upper case", A.toUpperCase()],
		["none", undefined],
	])("a head of %s is refused as unread [11]", async (_, sha) => {
		refused(await draft({ pulls: [seven({ head: { sha } })] }), "cannot read #7");
	});

	// spec: work-draft/no-repository-in-origin
	test("an origin of one path segment is refused naming origin, with no gh call [18]", async () => {
		const cwd = checkout();
		git(cwd, "remote", "set-url", "origin", "https://github.com/demo");
		const run = await draft(undefined, undefined, { cwd });
		refused(run, "origin");
		expect(run.gh).toEqual([]);
	});

	/** A run whose undo failed: exit 1, one line opening `draft: failed —` that claims no state. */
	function failed(run: Awaited<ReturnType<typeof draft>>) {
		expect([run.code, run.lines, run.readies]).toEqual([
			1,
			["draft: failed — gh pr ready --undo failed, so #7 could not be confirmed a draft"],
			[UNDO],
		]);
	}

	// spec: work-draft/the-undo-fails
	test("an undo exiting non-zero fails, claiming no state [19]", async () => {
		failed(await draft({ pulls: [seven()], readyCode: 1 }));
	});

	// 5 s: the limit also kills the `git` and read stubs, bun scripts that start slowly under load.
	test("an undo killed at HARNESS_GH_TIMEOUT_MS fails the same way [20]", async () => {
		failed(await draft({ pulls: [seven()], readyHangs: true }, undefined, { env: { HARNESS_GH_TIMEOUT_MS: "5000" } }));
	}, 20_000);
});

describe("the rule naming the command", () => {
	const doc = (name: string) => readFileSync(join(import.meta.dir, "..", "core", name), "utf8");
	const flat = (text: string) => text.replace(/\s+/g, " ");
	/** The bullets of `rules.md`'s sublist `name`, each on one line. */
	const sublist = (name: string) => {
		const text =
			doc("rules.md")
				.split(`#### ${name}\n`)[1]
				?.split(/\n#{2,4} /)[0] ?? "";
		return text.split(/\n- /).slice(1).map(flat);
	};

	// spec: work-draft/the-rulebook-names-the-command
	test("a Process rule runs draft before follow-up, handed to a subagent or carried by the session [21]", () => {
		const rule = sublist("Process").find((r) => r.includes("work.ts draft --pr"));
		expect(rule).toBeDefined();
		expect(rule).toContain("bun node_modules/harness/bun/work.ts draft --pr <n>");
		expect(rule).toContain("(`bun bun/work.ts` in the harness itself)");
		expect(rule).toContain("subagent");
		expect(rule).toContain("yourself");
	});

	test("the Safety rule naming the scripts granted a gh write names draft", () => {
		const rule = sublist("Safety").find((r) => r.includes("bun bun/work.ts finish"));
		expect(rule).toContain("`bun bun/work.ts draft` the one it grants a switch to draft");
	});

	test("git-and-prs.md's draft rule names the command, no longer a hand-run undo [22]", () => {
		const text = flat(doc("git-and-prs.md"));
		expect(text).toContain("work.ts draft --pr <n>");
		expect(text).not.toContain("by hand (`gh pr ready <n> --undo`) as it starts");
	});
});
