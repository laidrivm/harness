import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, verdict } from "./command-guard.fixture.ts";

/**
 * How `command-parse.ts` reads a heredoc, exercised through the guard as
 * `command-parse.test.ts`'s cases are: a quoted body is data, an unquoted one
 * yields only its substitutions, and a script reader reads every body. The
 * edge cases are `command-parse-heredoc-edges.test.ts`'s. Every line here is a
 * string the guard reads; none of them is ever run.
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

describe("a quoted heredoc's body is data", () => {
	// spec: agent-permissions/a-pull-request-body-naming-a-push
	test("a pull request body naming a push runs", () => {
		allows("gh pr create --body-file - <<'EOF'\ngit push * --delete *\nEOF");
	});

	// spec: agent-permissions/every-quoting-of-the-delimiter
	test.each([
		'cat <<"EOF"',
		"cat <<\\EOF",
		"cat <<-'EOF'",
	])("%s with a push in its body runs", (opener) => {
		allows(`${opener}\n${push}\nEOF`);
	});
});

describe("an unquoted heredoc's body runs only its substitutions", () => {
	// spec: agent-permissions/a-substitution-in-an-unquoted-body
	test("a $( substitution in the body blocks", () => {
		blocks(`cat <<EOF\n$(${push})\nEOF`);
	});

	// spec: agent-permissions/a-backtick-substitution-in-an-unquoted-body
	test("a backtick substitution in the body blocks", () => {
		blocks(`cat <<EOF\n\`${push}\`\nEOF`);
	});

	// spec: agent-permissions/two-backslashes-before-a-substitution
	test("two backslashes before a substitution leave it running", () => {
		blocks(`cat <<EOF\n\\\\$(${push})\nEOF`);
	});

	// spec: agent-permissions/a-plain-line-in-an-unquoted-body
	test("a plain line in the body runs", () => {
		allows(`cat <<EOF\n${push}\nEOF`);
	});
});

describe("a heredoc body ends where the shell ends it", () => {
	// spec: agent-permissions/a-quote-character-in-a-body
	test("an apostrophe in a body hides nothing after the delimiter", () => {
		blocks(`cat <<'EOF'\ndon't\nEOF\n${push}`);
	});

	// spec: agent-permissions/two-heredocs-on-one-line
	test("the line between two delimiters is the second body", () => {
		allows(`cat <<'A' <<'B'\nx\nA\n${push}\nB`);
	});

	// spec: agent-permissions/a-newline-inside-a-substitution-on-the-operator-s-line
	test("a newline inside a substitution does not start the body", () => {
		blocks(`cat <<'EOF' $(true\n${push}\nEOF\n)\nbody\nEOF`);
	});

	// spec: agent-permissions/a-delimiter-split-by-a-backslash-newline
	test("an unquoted delimiter split by a backslash-newline refuses", () => {
		blocks(`cat <<EOF\nEO\\\nF\n${push}\nEOF`, "unplaced-heredoc");
	});

	// spec: agent-permissions/a-split-delimiter-that-dash-reads-past
	test("a split delimiter dash reads past refuses", () => {
		blocks(
			`cat <<EOF\nEO\\\nF\n'\nEOF\n${push}\necho "x'" # "`,
			"unplaced-heredoc",
		);
	});

	// spec: agent-permissions/a-split-delimiter-under-a-quoted-one
	test("a quoted delimiter is matched without joining lines", () => {
		blocks(`cat <<'EOF'\nE\\\nOF\n'\nEOF\n${push}`);
	});

	// spec: agent-permissions/a-space-indented-delimiter-under-the-dash-form
	test("<<- strips tabs and not spaces from the delimiter line", () => {
		allows(`cat <<-'EOF'\n  EOF\n${push}\n\tEOF`);
	});
});

describe("a heredoc fed to a script reader is read as a script", () => {
	// spec: agent-permissions/a-body-given-to-a-shell-as-its-script
	test("a body given to bash as its script blocks", () => {
		blocks(`bash <<'EOF'\n${push}\nEOF`, "unread-program");
	});

	// spec: agent-permissions/a-body-piped-into-a-shell
	test("a body piped into sh blocks", () => {
		blocks(`cat <<'EOF' | sh\n${push}\nEOF`, "unread-program");
	});

	// spec: agent-permissions/a-body-evaluated-through-a-substitution
	test("a body evaluated through a substitution blocks", () => {
		blocks(`eval "$(cat <<'EOF'\n${push}\nEOF\n)"`, "unread-program");
	});

	// spec: agent-permissions/a-body-written-to-a-script-the-same-call-runs
	test("a body written to a script bash then runs blocks", () => {
		blocks(`cat > s.sh <<'EOF'\n${push}\nEOF\nbash s.sh`);
	});

	// spec: agent-permissions/a-body-written-to-a-script-the-call-runs-by-path
	test("a body written to a script run by its path blocks", () => {
		blocks(`cat > s.sh <<'EOF'\n${push}\nEOF\n./s.sh`);
	});
});

describe("a heredoc the guard cannot place fails closed", () => {
	// spec: agent-permissions/a-delimiter-that-never-comes
	test("a body whose delimiter never comes is read as commands", () => {
		blocks(`cat <<'EOF'\n${push}`);
	});

	// spec: agent-permissions/a-delimiter-holding-a-dollar
	test("a delimiter holding a dollar is matched literally", () => {
		blocks(`cat <<$X\ndon't\n$X\n${push}`);
	});

	// spec: agent-permissions/a-delimiter-holding-a-substitution
	test("a delimiter holding a substitution refuses", () => {
		blocks("cat <<$(echo E)\nx", "unplaced-heredoc");
	});

	// spec: agent-permissions/an-arithmetic-shift
	test("a shift inside arithmetic starts no body", () => {
		blocks(`echo $((1<<2))\n${push}\n2`);
	});

	// spec: agent-permissions/a-here-string
	test("a here-string starts no body", () => {
		blocks(`cat <<<x\n${push}\nx`);
	});
});

describe("a call the scan ends inside a quote is refused", () => {
	// spec: agent-permissions/a-stray-apostrophe-before-a-guarded-command
	test("a stray apostrophe before a push refuses", () => {
		blocks(`echo don't\n${push}`, "unclosed-quote");
	});

	// spec: agent-permissions/an-unclosed-substitution
	test("an unclosed substitution refuses", () => {
		blocks("echo $(git status", "unclosed-quote");
	});
});
