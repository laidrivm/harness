import { afterAll, describe, expect, test } from "bun:test";
import {
	cleanup,
	commit,
	DONE,
	end,
	OPEN,
	prompt,
	repo,
	SILENT,
	store,
} from "./turn-gate.fixture.ts";
import { decide, mark } from "./turn-gate.ts";

/**
 * How `turn-gate.ts` reads every active task list, at the mark and at the
 * tip, in one `git cat-file --batch`: each answer must land on its own path,
 * whatever the files hold. Bracketed numbers are the proposal-stage `/zombies`
 * ideas, as `tasks.md` numbers them.
 */

afterAll(cleanup);

const path = (name: string) => `openspec/changes/${name}/tasks.md`;

/** Commits `after` over `before` under one mark, and decides a silent turn. */
function silentTurn(
	before: Record<string, string>,
	after: Record<string, string>,
) {
	const dir = repo(before);
	const marks = store();
	mark(prompt(dir), marks);
	commit(dir, after);
	return decide(end(dir, SILENT), marks) ?? "";
}

/** How many groups a refusal names. */
const named = (reason: string) => reason.split('" in ').length - 1;

describe("one batch read across every active task list", () => {
	test("of thirteen changes, the one completed is the one named [16]", () => {
		const names = "abcdefghijklm".split("");
		const reason = silentTurn(
			Object.fromEntries(names.map((n) => [path(n), OPEN])),
			{ [path("g")]: DONE },
		);
		expect(reason).toContain("openspec/changes/g/");
		expect(named(reason)).toBe(1);
	});

	test("a line shaped like a batch header stays inside its file [17]", () => {
		const fake = `${OPEN}\n${"a".repeat(40)} blob 30\n## 9. Fake\n\n- [x] 9.1 z\n`;
		const reason = silentTurn(
			{ [path("a")]: fake, [path("b")]: OPEN },
			{ [path("b")]: DONE },
		);
		expect(reason).toContain("openspec/changes/b/");
		expect(named(reason)).toBe(1);
	});

	test("a multi-byte character does not shift the next file's framing", () => {
		const dashes = OPEN.replace("a\n", `${"—".repeat(40)}\n`);
		const reason = silentTurn(
			{ [path("a")]: dashes, [path("b")]: OPEN },
			{ [path("b")]: DONE },
		);
		expect(reason).toContain("openspec/changes/b/");
		expect(named(reason)).toBe(1);
	});

	test("an empty task list at the mark reads as no groups [18]", () => {
		const reason = silentTurn(
			{ [path("a")]: "", [path("b")]: OPEN },
			{ [path("b")]: DONE },
		);
		expect(reason).toContain("openspec/changes/b/");
		expect(named(reason)).toBe(1);
	});

	test("a task list the mark lacks reads as empty there [19]", () => {
		const reason = silentTurn(
			{ [path("b")]: OPEN },
			{ [path("a")]: OPEN, [path("b")]: DONE },
		);
		expect(reason).toContain("openspec/changes/b/");
		expect(named(reason)).toBe(1);
	});
});
