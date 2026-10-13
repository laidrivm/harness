import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, event, fabricate, run, verdict } from "./command-guard.fixture.ts";

/**
 * The heredoc cases no scenario pins, beside `command-parse-heredoc.test.ts`'s
 * scenario cases: the spellings of an operator, where one opens nothing, and
 * the edges `/zombies` raised. Every line here is a string the guard reads;
 * none of them is ever run.
 */

afterAll(cleanup);

const push = "git push --force origin feat/x";

const allows = (command: string) => {
	const { code, reason } = verdict(command);
	expect({ code, reason }).toEqual({ code: 0, reason: "" });
};

const blocks = (command: string, rule = "force-push") => {
	const { code, rule: recorded } = verdict(command);
	expect({ code, rule: recorded }).toEqual({ code: 2, rule });
};

describe("the spellings of an operator", () => {
	test.each([
		'cat <<"EOF"',
		'cat <<E"O"F',
		"cat <<- 'EOF'",
		"2<<'EOF' cat",
	])("%s with a push in its body runs", (opener) => {
		allows(`${opener}\n${push}\nEOF`);
	});

	test("a file descriptor in front does not hide the command", () => {
		const { code, reason } = run(
			event("2<<'EOF' git commit -F -\nmsg\nEOF"),
			fabricate("main"),
		);
		expect({ code, main: reason.includes("HEAD is on main") }).toEqual({
			code: 2,
			main: true,
		});
	});

	test("an escaped substitution in an unquoted body stays literal", () => {
		allows(`cat <<EOF\n\\$(${push})\nEOF`);
	});
});

describe("where an operator opens nothing", () => {
	test("a comment holding <<EOF opens nothing", () => {
		blocks(`echo hi # <<EOF\n${push}\nEOF`);
	});

	test("<<EOF inside double quotes opens nothing", () => {
		blocks(`echo "<<EOF"\n${push}\nEOF`);
	});

	test("a shift inside (( )) starts no body", () => {
		blocks(`(( x = 1 << 2 ))\n${push}\n2`);
	});

	test("a shift inside $(( )) holding a newline starts no body", () => {
		blocks(`echo $((1<<X\n))\n${push}\nX`);
	});

	test("cat << with no delimiter word is read as commands", () => {
		blocks(`cat <<\n${push}`);
	});
});

describe("where a body is placed", () => {
	test("a heredoc inside $( ) whose body closes before the ) runs", () => {
		allows(`x=$(cat <<'EOF'\n${push}\nEOF\n)`);
	});

	test("a body quoted inside a substitution inside quotes runs", () => {
		// The spelling a commit message or a pull request body takes: the
		// apostrophe is body, so it opens no quote around the `)"` after it.
		allows(`gh pr create --body "$(cat <<'EOF'\ndon't ${push}\nEOF\n)"`);
	});

	test("a newline inside a subshell starts the body", () => {
		blocks(`cat <<'EOF' && (true\nbody\nEOF\n)\n${push}\nEOF`);
	});

	test("an empty quoted body leaves the next line a command", () => {
		blocks(`cat <<'EOF'\nEOF\n${push}`);
	});

	test("the unquoted second of two heredocs runs its substitution", () => {
		blocks(`cat <<'A' <<B\nx\nA\n$(${push})\nB`);
	});

	test.each([
		"EOF ",
		"EOFX",
	])("a body line %p does not end the body", (line) => {
		allows(`cat <<'EOF'\n${line}\n${push}\nEOF`);
	});
});

describe("a body the guard cannot read through", () => {
	test("an unclosed quote in the delimiter word refuses", () => {
		const { code } = verdict(`cat <<'EOF\n${push}\nEOF`);
		expect(code).toBe(2);
	});

	test("an unclosed substitution in an unquoted body refuses", () => {
		const { code } = verdict("cat <<EOF\n$(git status\nEOF");
		expect(code).toBe(2);
	});

	test("a backslash-ended line before an unquoted delimiter refuses", () => {
		// Joined, the delimiter line reads `xEOF` and the body goes on, while
		// dash ends it there: the two readings disagree, as in the split case.
		blocks(`cat <<EOF\nx\\\nEOF\n${push}\nEOF`, "unplaced-heredoc");
	});

	test("a commit message fed on main still blocks as a commit", () => {
		const { code, reason } = run(
			event("git commit -F - <<'EOF'\nfix\nEOF"),
			fabricate("main"),
		);
		expect({ code, main: reason.includes("HEAD is on main") }).toEqual({
			code: 2,
			main: true,
		});
	});
});
