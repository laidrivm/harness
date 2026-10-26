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
		const doc = "- `/coderabbit-local [base]` — at most three reviews.\n- `/coderabbit [pr]` — chews.\n";
		expect(bullet(doc, CODERABBIT)).toBe("`/coderabbit [pr]` — chews. ");
	});

	// spec: agent-autonomy/a-fourth-round-with-a-finding-to-apply-attended
	// spec: agent-autonomy/the-rounds-are-counted-from-the-pull-request
	test("caps rounds at three and blocks the fourth [10, 13]", () => {
		const text = bullet(read("core/review-toolkit.md"), CODERABBIT) ?? "";
		expect(text).toContain("three rounds");
		expect(text).toContain("CODERABBIT gate: BLOCKED");
	});

	// spec: agent-autonomy/a-fourth-round-with-a-finding-to-apply-unattended
	test("hands the cap on as a card, posting nothing in the pull request [12, 15]", () => {
		const text = bullet(read("core/review-toolkit.md"), CODERABBIT) ?? "";
		expect(text).toMatch(/\(unattended: card — [^)\s][^)]*\)/);
		expect(text).toContain("`task-board`");
		expect(text).toContain("posts nothing in the pull request");
	});
});

const LOCAL = "`/coderabbit-local [base]` —";
const STEP_5 = "5. `/coderabbit-local`";
const DOCS_PATH = "A branch of documentation, rules or config";
const CODE_REVIEW = "`/code-review` —";
const toolkit = () => read("core/review-toolkit.md");

describe("the local review runs only while no pull request is open", () => {
	const sites: [string, (doc: string) => string | undefined][] = [
		["the /coderabbit-local bullet", (doc) => bullet(doc, LOCAL)],
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

	test.each(sites.slice(1))("%s points at the measurement", (_, find) => {
		expect(find(toolkit()) ?? "").toContain("the `/code-review` bullet");
	});

	test("a numbered step is found without the blank line a paragraph needs", () => {
		const doc = "4. `/triage`.\n5. `/coderabbit-local` last.\n\nNext.\n";
		expect(block(doc, STEP_5)).toBe("5. `/coderabbit-local` last.");
	});
});

describe("the /code-review bullet measures Claude's review beside the CLI", () => {
	// spec: local-review-loop/a-branch-measured-beside-the-cli
	test("runs it at effort high in a fresh subagent at the CLI's first commit, applying both", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		for (const words of [
			"`/code-review high`",
			"fresh subagent",
			"the commit of the CLI's first pass",
			"verified findings of both are applied",
		])
			expect(text).toContain(words);
	});

	// spec: local-review-loop/a-branch-measured-beside-the-cli
	test("gives the subagent its target, never its working directory", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		expect(text).toContain("The subagent is given its target explicitly");
		expect(text).toContain("the first pass's commit SHA");
		expect(text).toContain("its working directory is the project's main checkout");
		expect(text).toContain("It reports the SHA it reviewed");
		expect(text).toContain(
			"a review of another SHA, or one that names files the branch did not change, read another tree and counts as a run that does not return",
		);
	});

	// spec: local-review-loop/the-cli-is-unavailable
	test("leaves a branch whose CLI is unavailable unmeasured", () => {
		expect(bullet(toolkit(), CODE_REVIEW) ?? "").toContain(
			"A branch whose CLI is unavailable has no first pass and goes unmeasured",
		);
	});

	// spec: local-review-loop/a-branch-measured-beside-the-cli
	test("records each verified defect under the section's heading line, or `none`", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		for (const words of [
			"a line reading `## Review measurement`",
			"one line per verified defect",
			"its file and line, what it was and which reviewer flagged it",
			"the single line `none` when neither flagged one",
		])
			expect(text).toContain(words);
	});

	// spec: local-review-loop/a-pull-request-that-only-names-the-section
	test("lists the candidates closed and merged alike, counting only an exact heading line", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		expect(text).toContain(
			"`gh pr list --repo <repo> --state all --search '\"Review measurement\" in:body' --json number,body --limit 1000`",
		);
		expect(text).toContain("only a body with a line exactly `## Review measurement` counts as measured");
	});

	// spec: local-review-loop/a-finding-of-claude-s-review-the-agent-would-skip
	test("is no gate: a skipped finding keeps its reason and the CLI's gate line", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		expect(text).toContain("is no gate");
		expect(text).toContain("skipped with its reason in the report");
		expect(text).toContain("the gate line stays as `/coderabbit-local` set it");
	});

	// spec: local-review-loop/claude-s-review-does-not-return
	test("a run that does not return leaves the pull request unmeasured", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		expect(text).toContain("A run that does not return —");
		expect(text).toContain("— leaves no section and is not counted, and the report names why");
	});

	// spec: local-review-loop/the-fifth-measured-pull-request
	test("files an idea card once CodeRabbit has reviewed the fifth", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		expect(text).toContain("an `idea` card");
		expect(text).toContain("once CodeRabbit has reviewed the fifth");
		expect(text).toContain("the session that disposes of that review");
		expect(text).toContain(
			"the defects only the CLI flagged, only `/code-review` flagged, both flagged, and what CodeRabbit then raised and the agent applied",
		);
	});

	// spec: local-review-loop/the-measurement-ends
	test("ends at the tenth, and takes no evidence from /ponytail-review", () => {
		const text = bullet(toolkit(), CODE_REVIEW) ?? "";
		expect(text).toContain("ends at the tenth: after it, `/coderabbit-local` runs alone and the body carries no section");
		expect(text).toContain("`/ponytail-review`'s record is no evidence about it");
	});
});
