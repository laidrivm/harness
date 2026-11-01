import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ATTEMPT,
	BLOCKED,
	BOT,
	type Host,
	SECRET,
	SHA,
	answer,
	api,
	deliver,
	host,
	payload,
	rev,
	start,
	stop,
} from "./ci-run.fixture.ts";
import { cleanup } from "./diff-budget.fixture.ts";

/**
 * The CI flow's session after its comment, run through the event handler
 * against the stand-in `ci-run.fixture.ts` serves. [n]: `ci-run-agent`'s
 * `/zombies` items.
 */

afterAll(cleanup);
beforeAll(start);
afterAll(stop);

describe("the session after the comment", () => {
	/** What the stub session does in the clone, as shell, before it prints its answer. */
	const act = (h: Host, script: string, outcome?: string) => {
		writeFileSync(join(h.home, "claude-act"), script);
		if (outcome) writeFileSync(join(h.home, "claude-out"), answer(outcome));
	};
	const commit = "echo b > b.txt && git add b.txt && git commit -qm b\n";
	const on = (h: Host) => rev(h.clone, "--abbrev-ref", "HEAD");
	const pushed = (h: Host) => rev(h.bare, "refs/heads/feat/x");
	const log = (h: Host) => join(h.logs, "5-1.log");
	const seen = (h: Host, file: string) => readFileSync(join(h.home, file), "utf8");

	// spec: orchestrator/a-failed-run-on-a-steps-pull-request
	test("resumes the table's session in the clone, the event's attempt's logs in the file its prompt names [30, 41]", async () => {
		const h = host();
		act(h, `cp "${log(h)}" "$HOME/seen-log"\ngit rev-parse HEAD > "$HOME/seen-head"\n`);
		const r = await deliver(h, payload());
		expect([r.code, r.line]).toEqual([0, `event: handled — attempt 1/3 posted on #7; ${BLOCKED}`]);
		const argv = seen(h, "claude-argv");
		for (const flag of ["-r", h.session, "--json-schema", "--output-format", "json", "--permission-mode", "auto", "--permission-prompts", "none"])
			expect(argv.split("\n")).toContain(flag);
		expect(argv).toContain(log(h));
		expect(argv).toContain("1/3");
		expect(seen(h, "claude-pwd").trim()).toBe(realpathSync(h.clone));
		expect([seen(h, "seen-log"), seen(h, "seen-head").trim()]).toEqual(["the failed job's log\n", SHA]);
	});

	// spec: orchestrator/a-fix
	test("fixed with a new commit on the branch: pushed as the App, not forced; the clone back and the log gone [52]", async () => {
		const h = host();
		act(h, commit, "fixed");
		const r = await deliver(h, payload());
		expect(r.code).toBe(0);
		expect(r.line).toMatch(/^event: handled — attempt 1\/3 posted on #7; pushed feat\/x at [0-9a-f]{40}$/);
		expect(rev(h.bare, "refs/heads/feat/x^")).toBe(SHA);
		expect([on(h), existsSync(log(h))]).toEqual(["main", false]);
	});

	// spec: orchestrator/a-rewritten-branch
	test.each([
		["no new commit [46]", "", /no commit after/],
		["an amended head [47]", "git commit --amend -qm b\n", /no longer holds/],
		["another branch [48]", `git switch -qc other && ${commit}`, /on other, not feat\/x/],
	])("fixed with %s pushes nothing, exits 1 naming which, and cleans up [52]", async (_, script, reason) => {
		const h = host();
		act(h, script, "fixed");
		const r = await deliver(h, payload());
		expect(r.code).toBe(1);
		expect(r.line).toMatch(reason);
		expect([pushed(h), on(h), existsSync(log(h))]).toEqual([SHA, "main", false]);
	});

	test("a refused push is neither forced nor retried, exit 1 [49]", async () => {
		const h = host();
		writeFileSync(join(h.bare, "hooks", "pre-receive"), `#!/bin/sh\necho x >> "${h.root}/receives"\nexit 1\n`, { mode: 0o755 });
		act(h, commit, "fixed");
		const r = await deliver(h, payload());
		expect([r.code, readFileSync(join(h.root, "receives"), "utf8")]).toEqual([1, "x\n"]);
		expect(r.line).toMatch(/refused the push of feat\/x/);
		expect(pushed(h)).toBe(SHA);
	});

	// spec: orchestrator/blocked-or-no-answer
	test.each([
		["an outcome outside the schema", answer("done")],
		["no answer at all", ""],
	])("%s: nothing pushed, exit 1 after the cleanup [50, 52]", async (_, out) => {
		const h = host();
		act(h, commit);
		writeFileSync(join(h.home, "claude-out"), out);
		const r = await deliver(h, payload());
		expect(r.code).toBe(1);
		expect(r.line).toMatch(/no answer that matches the schema/);
		expect([pushed(h), on(h), existsSync(log(h))]).toEqual([SHA, "main", false]);
	});

	// spec: orchestrator/a-session-that-left-changes-uncommitted
	test.each([
		["a tracked change", "fixed", `${commit}echo c >> a.txt\n`],
		["an untracked file", "blocked", "echo c > c.txt\n"],
	])("%s left behind (%s): nothing pushed, the clone left as it is, the log kept, exit 1 naming it [66]", async (_, outcome, script) => {
		const h = host();
		act(h, script, outcome);
		const r = await deliver(h, payload());
		expect(r.code).toBe(1);
		expect(r.line).toContain(h.clone);
		expect([pushed(h), on(h), existsSync(log(h))]).toEqual([SHA, "feat/x", true]);
	});

	// spec: orchestrator/the-fourth-failure
	test("past the limit the session gets the limit prompt, and a fixed answer pushes nothing [32]", async () => {
		const h = host();
		api.comments = [1, 2, 3].map((n) => ({ user: { login: BOT }, body: `${ATTEMPT} ${n}/3 — run at ${String(n).repeat(40)}` }));
		act(h, commit, "fixed");
		const r = await deliver(h, payload());
		expect(r.line).toBe("event: handled — #7 used its 3 attempts: limit posted; the session answered fixed, nothing pushed");
		expect(seen(h, "claude-argv")).toContain("three");
		expect(pushed(h)).toBe(SHA);
	});

	// spec: orchestrator/no-token-in-the-session
	test("the session's environment holds no token, App setting or webhook secret [53]", async () => {
		const h = host();
		await deliver(h, payload());
		const env = seen(h, "claude-env");
		for (const name of ["GH_TOKEN", "GIT_CONFIG_COUNT", "HARNESS_GITHUB_APP_ID", "HARNESS_GITHUB_APP_KEY", "PASS_SECRETS"])
			expect(env).not.toContain(`${name}=`);
		expect(env).not.toContain(SECRET);
		expect(env).not.toContain("installation-token");
		// Its commits are the App's bot's, as a stage session's are.
		expect(env).toContain(`GIT_AUTHOR_NAME=${BOT}`);
	});

	test("gh only reads the event's attempt's failed logs: no rerun, cancel or delete [54]", async () => {
		const h = host();
		act(h, commit, "fixed");
		await deliver(h, payload());
		// Beside the draft toggle, which the next cases pin.
		expect(seen(h, "gh-calls").replace(/^pr ready .*\n/gm, "")).toBe("run view 5 -R o/r --attempt 1 --log-failed\n");
	});

	const [UNDO, RUN, READY] = ["pr ready 7 -R o/r --undo", "run view 5 -R o/r --attempt 1 --log-failed", "pr ready 7 -R o/r"];
	// spec: orchestrator/the-ci-flow-works-on-a-draft
	test.each([
		["fixed and pushed: ready right after the push", commit, "fixed", [UNDO, RUN, "pushed", READY]],
		["fixed with no new commit: ready, as no push will come", "", "fixed", [UNDO, RUN, READY]],
		["flaky: ready, as no push will come", "", "flaky", [UNDO, RUN, READY]],
		["blocked, a question on the card: left draft", "", "blocked", [UNDO, RUN]],
	])("%s; draft before the session", async (_, script, outcome, calls) => {
		const h = host();
		writeFileSync(join(h.bare, "hooks", "post-receive"), `#!/bin/sh\necho pushed >> "${h.home}/gh-calls"\n`, { mode: 0o755 });
		act(h, `cp "$HOME/gh-calls" "$HOME/gh-at-session"\n${script}`, outcome);
		await deliver(h, payload());
		expect(seen(h, "gh-at-session")).toBe(`${UNDO}\n${RUN}\n`);
		expect(seen(h, "gh-calls").trim().split("\n")).toEqual(calls);
	});

	// spec: orchestrator/a-ready-github-refuses
	test("a pull request gh cannot mark ready after the push: exit 1 naming it, the push kept", async () => {
		const h = host();
		writeFileSync(join(h.home, "gh-refuse"), "");
		act(h, commit, "fixed");
		const r = await deliver(h, payload());
		expect(r.code).toBe(1);
		expect(r.line).toMatch(/; pushed feat\/x at [0-9a-f]{40}; #7 could not be marked ready$/);
		expect(rev(h.bare, "refs/heads/feat/x^")).toBe(SHA);
	});
});
