import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, verdict } from "./command-guard.fixture.ts";

/**
 * What `command-guard.ts` refuses of a process signal: `pkill`, `killall`,
 * `killall5` and `skill` anywhere, and a `kill` aimed at anything but a job of
 * the line's own shell. Every line here is a string the guard reads; none of
 * them is ever run — a `kill` run to test this would signal a real process.
 */

afterAll(cleanup);

const blocks = (command: string, rule: string) => {
	const { code, rule: got, reason } = verdict(command);
	expect({ code, rule: got }).toEqual({ code: 2, rule });
	return reason;
};

const passes = (command: string) => {
	const { code, rule } = verdict(command);
	expect({ code, rule }).toEqual({ code: 0, rule: undefined });
};

describe("a process signalled by name", () => {
	// spec: agent-permissions/a-name-matched-across-the-machine
	test.each(['pkill -f "bun test"', "killall bun", "pkill -P 123", "skill -KILL -c bun"])("%s blocks", (line) => {
		expect(blocks(line, "kill-by-name")).toContain("TaskStop");
	});

	// spec: agent-permissions/behind-a-prefix-nested-or-chained
	test.each([
		"/usr/bin/pkill bun",
		"command pkill bun",
		'noglob pkill -f "bun test"',
		"setsid pkill bun",
		"arch -arm64 pkill bun",
		'bash -c "killall bun"',
		"ps aux | grep bun && pkill bun",
		"killall5 -15",
		// zsh expands `=pkill` to its path.
		"=pkill -f bun",
	])("%s blocks", (line) => {
		blocks(line, "kill-by-name");
	});

	// spec: agent-permissions/the-bare-word-in-a-search
	test("a search for the bare word blocks, naming a quoted pattern", () => {
		expect(blocks("git grep -n pkill", "kill-by-name")).toContain("'[k]ill'");
	});

	test("a quoted phrase holding the word is one word, and not matched", () => {
		expect(verdict('git commit -m "refuse pkill"').rule).not.toBe("kill-by-name");
	});
});

describe("a kill aimed past the line's own jobs", () => {
	// spec: agent-permissions/pids-found-across-the-machine
	test.each(["kill 95034 27453", "kill -9 68348", "kill -TERM -- -123", "kill %1 95034"])("%s blocks", (line) => {
		const reason = blocks(line, "kill-signal");
		for (const named of ["TaskStop", "kill %N", "ask the user"]) expect(reason).toContain(named);
	});

	// spec: agent-permissions/pids-the-guard-cannot-read
	test.each([
		"kill $pid",
		"kill $PPID",
		"kill $!",
		"kill %$x",
		"kill -$x %1",
		"kill $(pgrep bun)",
		"kill %1 $(pgrep bun)",
		"kill -0 $(pgrep bun)",
		"kill -0$(echo 9) 95034",
	])("%s blocks", (line) => {
		blocks(line, "kill-signal");
	});

	// spec: agent-permissions/a-kill-behind-a-prefix
	test.each([
		"pgrep bun | xargs kill",
		"xargs kill %1",
		"pgrep bun | xargs -I-0 kill -0",
		"xargs kill -0",
		"command kill %1",
		"env kill %1",
		"nocorrect kill 95034",
		"watch -n1 kill 95034",
		"find . -name x -exec kill {} ;",
		"echo kill",
	])("%s blocks", (line) => {
		blocks(line, "kill-signal");
	});

	// spec: agent-permissions/a-word-that-hides-the-next
	test.each([
		"kill '<' 95034",
		"kill %1 '>' 95034",
		"kill %1 > /dev/null",
		"kill '>x' -12345",
		"kill '>x' -0 95034",
		`bash -c "kill '>x' -12345"`,
	])("%s blocks", (line) => {
		blocks(line, "kill-signal");
	});

	// spec: agent-permissions/a-signal-after-a-no-signal-probe
	test.each(["kill -0 -s KILL 95034", "kill -0 -9 95034"])("%s blocks", (line) => {
		blocks(line, "kill-signal");
	});

	// spec: agent-permissions/a-kill-written-inside-a-program-the-guard-reads
	test.each(['bash -c "kill 95034"', "eval kill 95034"])("%s blocks", (line) => {
		blocks(line, "kill-signal");
	});

	test.each([
		"kill %1; kill 95034",
		"kill -n 9 95034",
		"kill -s 0 95034",
		"kill -s",
		"kill -l 15",
		"=kill 95034",
		// `2>&1` is one word; read as `2>` and a separator, the pid left `kill`.
		"kill 2>&1 95034",
		"kill %1 2>&1 95034",
		"kill %1 <&0 95034",
		"kill %1 >&- 95034",
		// A heredoc's body is read as commands once the line runs a script.
		"cat > s.sh <<'EOF'\nkill 95034\nEOF\nbash s.sh",
	])("%s blocks", (line) => {
		blocks(line, "kill-signal");
	});
});

describe("a kill that reaches only the line's own jobs, or signals nothing", () => {
	// spec: agent-permissions/a-job-the-line-started
	test.each([
		"sleep 30 & kill %1",
		"kill -9 %1",
		"kill -s KILL %1",
		"kill -- %+",
		"/bin/kill %1 2>/dev/null",
		"FOO=1 kill %1",
		"{ kill %1; }",
		"kill %1 2>&1",
		"kill %1 >&2",
		"kill -9 2>/dev/null %1",
	])("%s passes", (line) => passes(line));

	// spec: agent-permissions/no-signal-sent
	test.each([
		"kill -0 95034",
		"kill -l",
		"kill",
		"if kill -0 95034; then echo up; fi",
		"kill -0 -- 95034",
		"kill -0 95034 >/dev/null 2>&1",
	])("%s passes", (line) => passes(line));
});
