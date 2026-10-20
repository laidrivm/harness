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
