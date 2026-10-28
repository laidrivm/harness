/**
 * The wrap-up's `first review` line (first-review-yield): step 5 of the
 * `session-wrapup` skill names the line, the `gh` reads that find a pull
 * request's first reviewed commit, and how the session counts what CodeRabbit
 * raised on it. The skill is prose the session follows, so its text is the
 * subject; each case reads it, so a missing file fails the case, not the file.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PATH = join(import.meta.dir, "..", "core", "skills", "session-wrapup", "SKILL.md");
const flat = (text: string) => text.replace(/\s+/g, " ");
const skill = () => readFileSync(PATH, "utf8");
/** Step 5, whitespace normalised so a wrapped phrase still matches. */
const step = () => flat(skill().split("## 5. Pipeline yield")[1]?.split("\n## ")[0] ?? "");

/**
 * The reads, in the order the step names them — first written as design.md
 * decision 5's, a copy kept here because the change's design.md moves to the
 * archive and this pin outlives it.
 */
const READS = [
	`gh pr list --state all --search "updated:>=<since>" --limit 1000 --json number`,
	`gh pr list --state open --limit 1000 --json number`,
	`gh api 'repos/{owner}/{repo}/pulls/<n>/commits' --paginate --jq '.[].sha'`,
	`gh api 'repos/{owner}/{repo}/commits/<sha>/check-runs?filter=all' --paginate --jq '.check_runs[] | select(.name == "CodeRabbit" and .conclusion == "success") | [.completed_at, .output.summary] | @tsv'`,
	`gh api 'repos/{owner}/{repo}/commits/<sha>/statuses' --paginate --jq '.[] | select(.context == "CodeRabbit" and .state == "success") | [.created_at, .description] | @tsv'`,
	`gh api 'repos/{owner}/{repo}/commits/<sha>/pulls' --jq '.[].number'`,
	`gh api 'repos/{owner}/{repo}/pulls/<n>/reviews' --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]" and .commit_id == "<sha>") | [.id, .body] | @tsv'`,
	`gh api 'repos/{owner}/{repo}/pulls/<n>/reviews/<id>/comments' --paginate --jq '.[].body'`,
	`gh api 'repos/{owner}/{repo}/issues/<n>/comments' --paginate --jq '.[] | select(.user.login == "coderabbitai[bot]") | .body'`,
];

test("step 5 names each read verbatim, in order", () => {
	const text = step();
	const at = READS.map((read) => text.indexOf(flat(read)));
	expect(at.every((i) => i >= 0)).toBe(true);
	expect(at).toEqual([...at].sort((a, b) => a - b));
});

// spec: agent-rulebook/a-major-on-the-first-reviewed-commit
test("counts only the earliest commit with a success result reading Review completed", () => {
	const text = step();
	expect(text).toContain("oldest first");
	// One phrase: a draft skip is a `success` status too, so the text must stay a condition.
	expect(text).toContain("the earliest with a `success` result reading `Review completed`");
	expect(text).toContain("`- first review: k of n without Major+");
	expect(text).toContain("(Major+)");
});

// spec: agent-rulebook/a-first-review-with-no-findings
test("reads a first review with no bot review as zero findings", () => {
	expect(step()).toContain(
		"none is zero findings, which the bot's walkthrough confirms with «No actionable comments were generated» only while its `Commit` names that commit",
	);
});

// spec: agent-rulebook/a-pull-request-the-bot-did-not-review
test("names an unreviewed pull request unmeasured and reads it again later", () => {
	const text = step();
	expect(text).toContain("`(unmeasured)` and in neither number");
	expect(text).toContain("names as measured; one named `(unmeasured)` is read again");
});

// spec: agent-rulebook/a-commit-the-bot-reviewed-for-another-pull-request
test("counts a check run linking this /pull/<n>, or a status on a commit only this pull request holds", () => {
	const text = step();
	expect(text).toContain("summary links its `/pull/<n>` (the whole number, not the start of a longer one)");
	expect(text).toContain("a status on a commit `commits/<sha>/pulls` lists under this pull request alone");
});

// spec: agent-rulebook/a-major-later-dismissed
test("counts a dismissed Major", () => {
	expect(step()).toContain("Critical or Major as Major+, never re-graded, a dismissed one included");
});

// spec: agent-rulebook/nothing-reviewed-since-the-previous-entry
test("writes none reviewed when nothing was, or there is no CodeRabbit", () => {
	expect(step()).toContain(
		"`- first review: none reviewed` when none was measured, or the project has no CodeRabbit, still naming any `#c (unmeasured)` after a dash",
	);
});

test("takes <since> as the day before the previous heading and adds every open pull request", () => {
	const text = step();
	expect(text).toContain("`<since>` as the day before the date in the previous entry's heading");
	expect(text).toContain("the numbers of the two `gh pr list` reads below, each once");
});

test("takes the gates line's start from the previous entry holding a gates line, so a baseline entry moves no window", () => {
	expect(step()).toContain("`<gates-since>` from the date in the heading of the previous entry that holds a `gates` line");
	expect(step()).toContain('--arg since "<gates-since>"');
});

test("tells the session to read the severity word, both markup forms as examples, and marks an inferred one", () => {
	const text = step();
	expect(text).toContain("Read each finding's severity word yourself");
	expect(text).toContain("`<picture>…</picture> Major**`");
	expect(text).toContain("`_🟠 Major_`");
	expect(text).toContain("examples, not a pattern");
	expect(text).toContain("`#a (Major+, inferred)` or `#a (inferred)`");
});

test("allowed-tools holds the two gh reads", () => {
	const allowed = /^allowed-tools: "(.*)"$/m.exec(skill())?.[1].split(", ") ?? [];
	expect(allowed).toContain("Bash(gh api:*)");
	expect(allowed).toContain("Bash(gh pr list:*)");
});

test("the example block holds a first review line, and the description names the count", () => {
	expect(step().split("Example:")[1]).toContain("- first review: ");
	expect(/^description: .*first CodeRabbit review/m.test(skill())).toBe(true);
});
