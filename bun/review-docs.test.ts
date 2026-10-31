import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "./root.ts";
import { tracked } from "./tracked.ts";

const made: string[] = [];

afterAll(() => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const read = (path: string) => readFileSync(join(root, path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

const WRITES = "Send, reply, comment or review under the user's name";
const CODERABBIT = "`/coderabbit [pr]` —";

/** The top-level bullet that opens with `opening`, whitespace normalised; a wrapped opening still matches. */
function bullet(doc: string, opening: string): string | undefined {
	const items = doc.split(/^- /m).slice(1);
	// Up to the first line that is no bullet's continuation: blank, or a heading.
	const found = items.map((item) => item.split(/\n(?:\s*\n|#)/)[0]).find((item) => flat(item).startsWith(opening));
	return found === undefined ? undefined : flat(found);
}

/** The paragraph or numbered step that opens with `opening`, whitespace normalised. */
function block(doc: string, opening: string): string | undefined {
	const found = doc.split(/\n\s*\n|\n(?=\d+\. )/).find((part) => flat(part).trim().startsWith(opening));
	return found === undefined ? undefined : flat(found);
}

/** The App's slug, read from the bullet's backticked `<slug>[bot]` login. */
function slugIn(text: string): string {
	const login = text.match(/`([^`]*)\[bot\]`/);
	if (!login?.[1]?.trim()) throw new Error(`no \`<slug>[bot]\` login in the bullet: ${text.slice(0, 60)}`);
	return login[1];
}

/** The files `git ls-files bun` lists that hold `slug`. */
function holders(dir: string, slug: string): string[] {
	// An empty slug is in every file: refuse rather than fail every one.
	if (!slug.trim()) throw new Error("no slug to search for");
	return tracked(dir)
		.files.filter((path) => path.startsWith("bun/"))
		.filter((path) => readFileSync(join(dir, path), "utf8").includes(slug));
}

describe("the bullet on writing under the user's name", () => {
	// spec: agent-permissions/a-pull-request-the-runner-opened-as-the-bot
	test("names the App by its slug and the login it writes as [1, 2]", () => {
		const text = bullet(read("core/git-and-prs.md"), WRITES) ?? "";
		const slug = slugIn(text);
		expect(text).toContain(`\`${slug}\``);
		expect(text).toContain(`\`${slug}[bot]\``);
	});

	test("a bullet with no login, or an empty slug, fails naming the bullet [1, 4]", () => {
		for (const text of [`${WRITES} only through a call.`, `${WRITES}: \`[bot]\`.`, `${WRITES}: \` [bot]\`.`])
			expect(() => slugIn(text)).toThrow(`in the bullet: ${WRITES}`);
		expect(() => holders(root, "")).toThrow("no slug");
		expect(() => holders(root, " ")).toThrow("no slug");
	});

	test("an opening wrapped across a line break is still found [3]", () => {
		const doc = "# Doc\n\n- Send, reply, comment or review\n  under the user's name, as `x-app[bot]`.\n- Next.\n";
		expect(slugIn(bullet(doc, WRITES) ?? "")).toBe("x-app");
	});

	// spec: agent-permissions/a-session-that-would-comment-as-the-bot
	test("says who writes as the bot, and keeps the gh writes refused [5, 6]", () => {
		const text = bullet(read("core/git-and-prs.md"), WRITES) ?? "";
		for (const words of ["runner", "orchestrator", "never from inside a session", "the `gh` writes stay refused"])
			expect(text).toContain(words);
	});
});

describe("the App's name in code", () => {
	// spec: agent-permissions/the-bot-s-name-is-read-from-github-not-spelt-in-code
	test("no tracked file under bun/ holds the slug the doc names [7]", () => {
		const slug = slugIn(bullet(read("core/git-and-prs.md"), WRITES) ?? "");
		expect(holders(root, slug)).toEqual([]);
	});

	test("a tracked file holding the slug fails, an untracked one does not [7, 8]", () => {
		const dir = mkdtempSync(join(tmpdir(), "review-docs-"));
		made.push(dir);
		mkdirSync(join(dir, "bun"));
		writeFileSync(join(dir, "bun/tracked.ts"), 'const app = "made-up-app";\n');
		writeFileSync(join(dir, "bun/loose.ts"), 'const app = "made-up-app";\n');
		expect(Bun.spawnSync(["git", "init", "-q"], { cwd: dir }).exitCode).toBe(0);
		expect(Bun.spawnSync(["git", "add", "bun/tracked.ts"], { cwd: dir }).exitCode).toBe(0);
		expect(holders(dir, "made-up-app")).toEqual(["bun/tracked.ts"]);
	});
});

describe("the /coderabbit bullet", () => {
	test("is found by its opening, never by the local bullet's three reviews [10]", () => {
		const doc = "- `/code-review` — at most three reviews.\n- `/coderabbit [pr]` — chews.\n";
		expect(bullet(doc, CODERABBIT)).toBe("`/coderabbit [pr]` — chews. ");
	});

	// spec: agent-autonomy/a-fourth-round-with-a-finding-to-apply-attended
	// spec: agent-autonomy/the-rounds-are-counted-from-the-pull-request
	test("caps rounds at three and blocks the fourth [10, 13]", () => {
		const text = bullet(read("core/review-toolkit.md"), CODERABBIT) ?? "";
		expect(text).toContain("three rounds");
		expect(text).toContain("CODERABBIT gate: BLOCKED");
	});

	// The skill fixes the gate line's form, so the cap goes in the report line above it.
	// spec: agent-autonomy/a-fourth-round-with-a-finding-to-apply-attended
	test("names the cap in the line before the skill's own BLOCKED gate line", () => {
		const text = bullet(read("core/review-toolkit.md"), CODERABBIT) ?? "";
		expect(text).toContain("names the cap in the line before its gate line");
		expect(text).toContain("`CODERABBIT gate: BLOCKED — N findings, M undispositioned.`");
		expect(text).not.toContain("BLOCKED` naming the cap");
	});

	// spec: agent-autonomy/a-fourth-round-with-a-finding-to-apply-unattended
	test("hands the cap on as a card, posting nothing in the pull request [12, 15]", () => {
		const text = bullet(read("core/review-toolkit.md"), CODERABBIT) ?? "";
		expect(text).toMatch(/\(unattended: card — [^)\s][^)]*\)/);
		expect(text).toContain("`task-board`");
		expect(text).toContain("posts nothing in the pull request");
	});

	// The local review's base, changed-file check and gate line have no meaning on a pull request.
	test("shares /code-review's finding-disposal terms alone, keeping its pull-request behaviour", () => {
		const text = bullet(read("core/review-toolkit.md"), CODERABBIT) ?? "";
		expect(text).toContain("on `/code-review`'s finding-disposal terms alone");
		expect(text).toContain("not its base, its changed-file check, its grading or its `CODE-REVIEW` gate line");
		expect(text).toContain("CodeRabbit grades its own findings and a Major it raised stays a Major");
		expect(text).toContain("Once a PR is open, say so and stop");
		expect(text).not.toContain("/coderabbit-local");
	});
});

const LOCAL = "`/code-review` —";
// The form code-review-replaces-cli probed (design.md decision 1): the range after the level is the diff read.
const BASE_FORM = "`/code-review high <base>...HEAD` from the branch's own worktree";
const CLI = "`/coderabbit-local [base]` —";
const STEP_5 = "5. `/code-review`";
const DOCS_PATH = "A documentation branch, as the runner classifies one";
const toolkit = () => read("core/review-toolkit.md");

describe("the local review runs only while no pull request is open", () => {
	const sites: [string, (doc: string) => string | undefined][] = [
		["the /code-review bullet", (doc) => bullet(doc, LOCAL)],
		["step 5", (doc) => block(doc, STEP_5)],
		["the documentation-branch path", (doc) => block(doc, DOCS_PATH)],
	];

	// spec: local-review-loop/a-code-branch-reaches-the-end-of-the-sequence
	// spec: local-review-loop/a-push-into-an-open-pull-request
	test.each(sites)("%s runs it only with no pull request open, a draft counting as open", (_, find) => {
		const text = find(toolkit()) ?? "";
		expect(text).toContain("only while no pull request is open on the branch");
		expect(text).toContain("a draft counting as open");
		expect(text).toContain("a push into an open one skips it while the earlier steps run");
	});

	// spec: local-review-loop/the-pull-request-s-state-cannot-be-read
	test.each(sites)("%s runs it on a state the read could not get", (_, find) => {
		const text = find(toolkit()) ?? "";
		expect(text).toContain("a state the read could not get runs it");
		expect(text).toContain("the report says the state was unread");
	});

	// spec: local-review-loop/a-branch-whose-pull-request-was-closed-unmerged
	test("the bullet runs it again once the only pull request closed unmerged", () => {
		const text = bullet(toolkit(), LOCAL) ?? "";
		expect(text).toContain("closed unmerged has none open");
		expect(text).toContain("never infer it from what the push carries");
	});

	// spec: local-review-loop/a-push-into-an-open-pull-request
	test.each(sites.slice(1))("%s has the report say CodeRabbit reviews that head", (_, find) => {
		expect(find(toolkit()) ?? "").toContain("its report says CodeRabbit reviews the head on the pull request");
	});

	// spec: local-review-loop/a-push-into-an-open-pull-request
	test.each(sites.slice(0, 2))("%s says a draft's head is reviewed once it is marked ready", (_, find) => {
		expect(find(toolkit()) ?? "").toContain("a draft's once it is marked ready");
	});

	// spec: local-review-loop/a-code-branch-reaches-the-end-of-the-sequence
	// spec: local-review-loop/a-documentation-branch
	test.each(sites)("%s names `/code-review high`", (_, find) => {
		expect(find(toolkit()) ?? "").toContain("`/code-review high");
	});

	test.each(sites.slice(1))("%s points at the bullet's terms", (_, find) => {
		expect(find(toolkit()) ?? "").toContain("the `/code-review` bullet");
	});

	test("a numbered step is found without the blank line a paragraph needs", () => {
		const doc = "4. `/triage`.\n5. `/code-review` last.\n\nNext.\n";
		expect(block(doc, STEP_5)).toBe("5. `/code-review` last.");
	});
});

describe("the /code-review bullet is the local review", () => {
	// spec: local-review-loop/a-code-branch-reaches-the-end-of-the-sequence
	test("names the runner's base in the form the probe found working", () => {
		expect(bullet(toolkit(), LOCAL) ?? "").toContain(BASE_FORM);
	});

	test("names no argument that posts or applies findings, in the bullet, step 5 or the documentation path", () => {
		for (const text of [bullet(toolkit(), LOCAL), block(toolkit(), STEP_5), block(toolkit(), DOCS_PATH)]) {
			expect(text).toContain("`/code-review high");
			for (const flag of ["--comment", "--fix", "--post", "ultra"]) expect(text).not.toContain(flag);
		}
	});

	// spec: local-review-loop/a-finding-the-review-gives-no-severity
	test("has the session grade each finding Trivial to Critical and name the grade", () => {
		const text = bullet(toolkit(), LOCAL) ?? "";
		for (const grade of ["🔵 Trivial", "🟡 Minor", "🟠 Major", "🔴 Critical"]) expect(text).toContain(grade);
		expect(text).toContain("names the grade beside each finding in its report");
	});

	test("has the session write the `CODE-REVIEW gate:` line", () => {
		const text = bullet(toolkit(), LOCAL) ?? "";
		expect(text).toContain("the session writes the `CODE-REVIEW gate:` line");
		expect(text).toContain("the built-in skill prints none");
	});

	// spec: local-review-loop/the-review-does-not-return
	test("reports a review that does not return, or that read another diff, and pushes on", () => {
		const text = bullet(toolkit(), LOCAL) ?? "";
		expect(text).toContain("A review that does not return —");
		expect(text).toContain("or whose findings name no file the branch's diff changes");
		expect(text).toContain("is reported and the push goes on without the gate");
	});

	test("the /coderabbit-local bullet is in no sequence and no gate", () => {
		const text = bullet(toolkit(), CLI) ?? "";
		expect(text).toContain("in no sequence and no gate");
		expect(text).toContain("the guideline files that the config's `code_guidelines` patterns match");
	});

	test("the doc holds no measurement", () => {
		expect(flat(toolkit())).not.toContain("Review measurement");
	});
	// Its `Skill(code-review)` allow entry is pinned in pre-pr-steps.test.ts, beside every judgement step's.
});

describe("an unattended pull request opens over the local review's gate", () => {
	const autonomy = () => read("core/autonomy.md");

	// spec: agent-autonomy/the-pull-request-opens-over-a-proposed-dismissal
	test("`CODE-REVIEW` reading `OPEN` only over a proposed Major or Critical dismissal", () => {
		expect(bullet(autonomy(), "`CODE-REVIEW` reading `OPEN`")?.trim()).toBe(
			"`CODE-REVIEW` reading `OPEN` only over a 🟠 Major or 🔴 Critical dismissal it proposes;",
		);
	});

	// spec: agent-autonomy/the-pull-request-opens-over-a-major-left-unresolved
	test("`CODE-REVIEW` reading `BLOCKED` only over a Major or above the third pass left", () => {
		expect(bullet(autonomy(), "`CODE-REVIEW` reading `BLOCKED`")?.trim()).toBe(
			"`CODE-REVIEW` reading `BLOCKED` only over a 🟠 Major or 🔴 Critical that the third pass left unresolved.",
		);
		expect(autonomy()).not.toContain("CODERABBIT-LOCAL");
	});
});
