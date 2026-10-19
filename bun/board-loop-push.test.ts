import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, emptyDir, git } from "./diff-budget.fixture.ts";
import { change, clone, commit, lowered, out, records, run, TICKED } from "./board-loop.fixture.ts";

/**
 * The runner's push and pull request after the stage session, and what keeps
 * them from happening. [n]: `github-app-identity`'s `/zombies` ideas.
 */

afterAll(cleanup);

const PUSH = "git push origin refs/heads/feat/demo:refs/heads/feat/demo";
const CREATE = "gh pr create --base main --head feat/demo --title Carry demo --body-file -";
const OPEN = "goal open: apply demo step 1 at abc1234 — no open or merged pull request for feat/demo";

/** The logged calls that start with `call`. */
const calls = (log: string, call: string) => log.split("\n").filter((line) => line.startsWith(call));

/** A `kill` whose signal 0 fails with EPERM for the second group it sees, the stage session's. */
const STAGE_EPERM = `(() => { const seen = []; return (pid, signal) => { if (!seen.includes(pid)) seen.push(pid); if (signal === 0 && seen.indexOf(pid) === 1) throw Object.assign(new Error("EPERM"), { code: "EPERM" }); process.kill(pid, signal); }; })()`;

describe("a step ready to push", () => {
	// spec: board-loop/a-step-ready-to-push
	test("one push of exactly the step's ref, no force, then one pull request, then the full check [17][18]", () => {
		const { dir, origin } = clone();
		const r = run(dir);
		expect(calls(r.calls, "git push")).toEqual([PUSH]);
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE]);
		const lines = r.calls.split("\n");
		const [push, create, verdict] = [
			lines.indexOf(PUSH),
			lines.indexOf(CREATE),
			lines.findIndex((line) => line.endsWith("goal-check.ts apply demo 1")),
		];
		expect(lines.findIndex((line) => line.endsWith("goal-check.ts apply demo 1 --before-push"))).toBeLessThan(push);
		expect([push < create, create < verdict]).toEqual([true, true]);
		expect(r.body).toBe("The body.");
		expect(out(origin, "rev-parse", "feat/demo")).toBe(out(dir, "rev-parse", "feat/demo"));
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	// spec: board-loop/a-step-ready-to-push
	test("the session's final message is printed after it [19]", () => {
		const { dir } = clone();
		expect(run(dir).text).toContain("Done.\nPR-TITLE: Carry demo\nPR-BODY:\nThe body.");
	});

	// spec: board-loop/a-step-ready-to-push
	test("a body of several lines reaches gh whole", () => {
		const { dir } = clone();
		const said = "PR-TITLE: Carry demo\nPR-BODY:\nFirst.\n\n- second\n--third";
		expect(run(dir, [], { said }).body).toBe("First.\n\n- second\n--third");
	});

	// spec: board-loop/a-step-ready-to-push
	test("an answer step pushes and opens feat/demo-2", () => {
		const { dir } = clone(change("demo", TICKED));
		const r = run(dir);
		expect(calls(r.calls, "git push")).toEqual(["git push origin refs/heads/feat/demo-2:refs/heads/feat/demo-2"]);
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE.replace("feat/demo", "feat/demo-2")]);
	});

	// spec: board-loop/a-step-ready-to-push
	test("a trailing CR is dropped from the title [20]", () => {
		const { dir } = clone();
		const r = run(dir, [], { said: "PR-TITLE: Carry demo\r\nPR-BODY:\nThe body." });
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE]);
	});

	// spec: board-loop/a-step-ready-to-push
	test("a branch on origin a session left is pushed fast-forward [34]", () => {
		const { dir, origin } = clone();
		git(dir, "push", "-q", "origin", "main:refs/heads/feat/demo");
		const r = run(dir, [], { commits: true });
		expect(r.calls).toContain("A session left the branch feat/demo");
		expect(calls(r.calls, "git push")).toEqual([PUSH]);
		expect(out(origin, "rev-parse", "feat/demo")).toBe(out(dir, "rev-parse", "feat/demo"));
		expect(out(origin, "rev-parse", "feat/demo~1")).toBe(out(origin, "rev-parse", "main"));
	});
});

describe("a step not ready", () => {
	// spec: board-loop/a-step-not-ready
	test.each([
		["the before-push check reads open [21]", { beforePush: OPEN }, undefined, `board-loop: open — apply demo step 1: ${OPEN}`],
		["HEAD is off the step's branch [22]", { branch: "feat/other" }, undefined, "HEAD is on feat/other, not feat/demo"],
		["the session ran past the limit [26]", { sleep: 30 }, () => lowered(1000), "board-loop: timeout — apply demo step 1"],
		["its group outlived it [27]", {}, () => lowered(60_000, STAGE_EPERM), "outlived apply demo step 1"],
		["a tampered pin cannot make the before-push run read met [28]", { beforePush: OPEN, tamper: true }, undefined, OPEN],
	] as const)("%s: nothing is pushed or opened", (_, stubs, entry, line) => {
		const { dir, origin } = clone();
		const r = run(dir, [], stubs, { entry: entry?.() });
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
		expect(out(origin, "branch", "--list", "feat/*")).toBe("");
		expect(r.last).toContain(line);
	}, 40_000);
});

describe("no title or body", () => {
	// spec: board-loop/no-title-or-body
	test.each([
		["no title [29]", "Done.", "not one PR-TITLE: line"],
		["two titles [29]", "PR-TITLE: a\nPR-TITLE: b\nPR-BODY:\nx", "not one PR-TITLE: line"],
		["a title inside the body [30]", "PR-TITLE: a\nPR-BODY:\nx\nPR-TITLE: b", "not one PR-TITLE: line"],
		["no body line [29]", "PR-TITLE: a", "not one PR-BODY: line"],
		["the body line first [31]", "PR-BODY:\nx\nPR-TITLE: a", "PR-BODY: comes before PR-TITLE:"],
		["a blank title [32]", "PR-TITLE:   \nPR-BODY:\nx", "the PR-TITLE: line is empty"],
		["an empty body [33]", "PR-TITLE: a\nPR-BODY:\n  ", "nothing follows PR-BODY:"],
	])("%s: no push, no pull request, and open naming it", (_, said, reason) => {
		const { dir } = clone();
		const r = run(dir, [], { said });
		expect([calls(r.calls, "git push"), calls(r.calls, "gh pr create")]).toEqual([[], []]);
		expect(r.last).toStartWith("board-loop: open — apply demo step 1: ");
		expect(r.last).toContain(reason);
		expect(records(r.state).map((x) => x.decision)).toEqual(["open"]);
	});
});

describe("the push or the pull request fails", () => {
	// spec: board-loop/the-push-is-refused
	test("a refused push is neither retried nor forced, opens nothing, and is open with its error [23]", () => {
		const { dir, origin } = clone();
		const other = emptyDir("board-loop-other-");
		git(other, "clone", "-q", origin, ".");
		git(other, "switch", "-qc", "feat/demo");
		commit(other);
		git(other, "push", "-q", "origin", "feat/demo");
		git(dir, "branch", "feat/demo");
		git(dir, "switch", "-q", "feat/demo");
		commit(dir);
		git(dir, "switch", "-q", "main");
		const theirs = out(origin, "rev-parse", "feat/demo");
		const r = run(dir);
		expect(calls(r.calls, "git push")).toEqual([PUSH]);
		expect(calls(r.calls, "gh pr create")).toEqual([]);
		expect(r.text).toContain("[rejected]");
		expect(r.last).toBe("board-loop: open — apply demo step 1: origin refused the push of feat/demo, as printed above");
		expect(out(origin, "rev-parse", "feat/demo")).toBe(theirs);
	});

	// spec: board-loop/the-pull-request-already-exists
	test("a create that fails while a pull request at HEAD exists ends on the full check's met", () => {
		const { dir } = clone();
		const r = run(dir, [], { createCode: 1 });
		expect(calls(r.calls, "gh pr create")).toEqual([CREATE]);
		expect(r.last).toBe("board-loop: met — apply demo step 1");
	});

	// spec: board-loop/the-pull-request-already-exists
	test("any other create failure ends open", () => {
		const { dir } = clone();
		const r = run(dir, [], { createCode: 1, verdict: OPEN });
		expect(r.last).toBe(`board-loop: open — apply demo step 1: ${OPEN}`);
	});
});
