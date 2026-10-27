import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir } from "./diff-budget.fixture.ts";
import { records } from "./pre-pr.fixture.ts";

/**
 * The pre-push hook's draft check, spawned as the hook calls it: the remote's
 * name and URL as arguments, git's ref-update records on standard input, a
 * `gh` stub on `PATH` answering per branch, and no `git` there at all, so a
 * case that passes also shows the check spawned none.
 */

afterAll(cleanup);

const script = join(import.meta.dir, "push-draft.ts");
const SHA = "a".repeat(40);
const OLD = "b".repeat(40);
const ZERO = "0".repeat(40);
const GITHUB = "https://github.com/o/r.git";

/** One ref-update record, pushing `SHA` from `local` to `remote`. */
const update = (remote: string, sha = SHA, local = "refs/heads/feat/x") => `${local} ${sha} ${remote} ${OLD}\n`;

/** A pull request as the REST endpoint lists it. */
const pull = (number: number, draft: boolean) =>
	JSON.stringify([{ number, state: "open", merged_at: null, draft, head: { sha: SHA, repo: { id: 1 } }, base: { repo: { id: 1 } } }]);

const query = (branch: string) => `api repos/o/r/pulls?head=o:${encodeURIComponent(branch)}&state=all&per_page=100`;

type Case = { stdin: string; url?: string; answers?: Record<string, string>; code?: number };

function push(c: Case) {
	const bin = emptyDir("push-draft-bin-");
	const log = join(bin, "calls");
	// Each arm answers the branch whose encoded name the query holds; JSON carries no single quote.
	const arms = Object.entries(c.answers ?? {})
		.map(([branch, json]) => `*head=o:${encodeURIComponent(branch)}\\&*) printf '%s' '${json}' ;;`)
		.join("\n");
	writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\ncase "$*" in\n${arms}\n*) printf '[]' ;;\nesac\nexit ${c.code ?? 0}\n`);
	chmodSync(join(bin, "gh"), 0o755);
	const state = emptyDir("push-draft-state-");
	const run = Bun.spawnSync([process.execPath, script, "origin", c.url ?? GITHUB], {
		stdin: Buffer.from(c.stdin),
		env: { PATH: bin, HOME: emptyDir("push-draft-home-"), XDG_STATE_HOME: state },
	});
	let calls: string[] = [];
	try {
		calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
	} catch {
		// `gh` was never called.
	}
	const ledger = records(state).map(({ gate, decision, rule, commit }) => ({ gate, decision, rule, commit }));
	return { code: run.exitCode, err: run.stderr.toString(), calls, ledger };
}

describe("what the check reads", () => {
	// spec: commit-gates/a-push-with-nothing-to-update
	test("empty standard input makes no gh call and passes", () => {
		expect(push({ stdin: "" })).toMatchObject({ code: 0, calls: [], ledger: [] });
	});

	// spec: commit-gates/a-push-under-another-name
	test("a push of feat/x to refs/heads/release reads release's pull requests", () => {
		const run = push({ stdin: update("refs/heads/release"), answers: { release: pull(9, false) } });
		expect([run.code, run.calls, run.err]).toEqual([1, [query("release")], expect.stringContaining("gh pr ready 9 --undo")]);
	});

	// spec: commit-gates/a-remote-that-is-not-on-github
	test.each([
		["a deletion", update("refs/heads/feat/x", ZERO, "(delete)"), GITHUB],
		["a branch pushed to refs/tags/", update("refs/tags/v1"), GITHUB],
		["a local-path remote", update("refs/heads/feat/x"), "/srv/git/o/r.git"],
		["a file URL", update("refs/heads/feat/x"), "file:///srv/git/o/r.git"],
		["another host", update("refs/heads/feat/x"), "https://gitlab.com/o/r.git"],
		["a host that only starts with github.com", update("refs/heads/feat/x"), "https://github.com.example/o/r.git"],
	])("%s is not read", (_, stdin, url) => {
		expect(push({ stdin, url, answers: { "feat/x": pull(7, false) } })).toMatchObject({ code: 0, calls: [], ledger: [] });
	});

	test.each([
		["https", "https://github.com/o/r.git"],
		["ssh", "ssh://git@github.com/o/r.git"],
		["scp", "git@github.com:o/r"],
		["https with a user", "https://u@github.com/o/r"],
	])("the %s form of a github.com URL is read", (_, url) => {
		expect(push({ stdin: update("refs/heads/feat/x"), url })).toMatchObject({ code: 0, calls: [query("feat/x")] });
	});
});

describe("what the check decides", () => {
	// spec: commit-gates/a-push-into-a-draft
	test("a draft passes", () => {
		expect(push({ stdin: update("refs/heads/feat/x"), answers: { "feat/x": pull(7, true) } })).toMatchObject({ code: 0, ledger: [] });
	});

	// spec: commit-gates/a-push-into-a-ready-pull-request gate-ledger/a-push-into-a-ready-pull-request
	test("an open pull request that is not a draft refuses, naming its undo, with one record of the pushed sha", () => {
		const run = push({ stdin: update("refs/heads/feat/x"), answers: { "feat/x": pull(7, false) } });
		expect(run).toMatchObject({ code: 1, err: expect.stringContaining("gh pr ready 7 --undo") });
		expect(run.ledger).toEqual([{ gate: "push-draft", decision: "block", rule: "ready", commit: SHA }]);
	});

	// spec: commit-gates/a-pull-request-state-the-hook-cannot-read
	test("a failed read refuses, naming gh auth status, with one record of the pushed sha", () => {
		const run = push({ stdin: update("refs/heads/feat/x"), code: 1 });
		expect(run).toMatchObject({ code: 1, err: expect.stringContaining("gh auth status") });
		expect(run.ledger).toEqual([{ gate: "push-draft", decision: "block", rule: "unread", commit: SHA }]);
	});

	test("two records, one of them ready, refuse naming the ready one", () => {
		const ready = "c".repeat(40);
		const stdin = update("refs/heads/feat/a") + update("refs/heads/feat/b", ready, "refs/heads/feat/b");
		const run = push({ stdin, answers: { "feat/a": pull(7, true), "feat/b": pull(8, false) } });
		expect([run.code, run.calls, run.ledger]).toEqual([1, [query("feat/a"), query("feat/b")], [{ gate: "push-draft", decision: "block", rule: "ready", commit: ready }]]);
		expect(run.err).toContain("gh pr ready 8 --undo");
	});
});
