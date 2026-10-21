/**
 * What the question gate's test files build a case out of: the event Claude
 * Code hands a `PermissionRequest` hook, a session transcript in the shape
 * Claude Code writes it, and the gate run as the hook runs it — a spawned
 * process reading the event on stdin, in a directory holding no `.env`, with
 * only `PATH` and a home and ledger of the case's own in its environment.
 *
 * `afterAll` is not registered here: each test file registers `cleanup`
 * itself, as `spec-coverage.fixture.ts` explains for the same shape.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = `${import.meta.dir}/question-gate.ts`;
const made: string[] = [];

/** Removes every directory a case made so far. */
export const cleanup = () => {
	for (const dir of made) rmSync(dir, { recursive: true, force: true });
};

/** A fresh directory of the case's own. */
export function scratch(): string {
	const dir = mkdtempSync(join(tmpdir(), "harness-question-gate-"));
	made.push(dir);
	return dir;
}

/** Two page ids, made up, as the connector takes them. */
export const CARD = "aaaabbbbccccddddeeeeffff00001111";
export const OTHER = "1234567890abcdef1234567890abcdef";
export const MARK = "`harness-question`";
export const QUESTION = `${MARK} Ship the hook as one group? 1 — yes (recommended), 2 — no.`;

/**
 * A connector fetch of `page` whose ancestor path names `board` as its data
 * source, or, with none, a page with no ancestor path, as a top-level one.
 */
export const fetched = (page: string, board?: string, content = "") => ({
	name: "mcp__claude_ai_Notion__notion-fetch",
	input: { id: `https://app.notion.com/p/${page}` },
	result: JSON.stringify({
		metadata: { type: "page" },
		text: `<page url="https://app.notion.com/p/${page}">\n${board === undefined ? "" : `<ancestor-path>\n<parent-data-source url="collection://x" name="${board}"/>\n</ancestor-path>`}\n<properties>{}</properties>\n<content>\n${content}\n</content>\n</page>`,
	}),
});

/** A connector read of `page`'s comments. */
export const comments = (page: string) => ({
	name: "mcp__claude_ai_Notion__notion-get-comments",
	input: { page_id: page },
	result: "<discussions></discussions>",
});

/**
 * A tool call and its result. `failed` marks the result `is_error`, and
 * `plain` writes its content as a bare string rather than a list of parts.
 */
type Call = {
	name: string;
	input: object;
	result: string;
	failed?: true;
	plain?: true;
};

/** The line agent-autonomy's unattended session carries in its first prompt. */
export const UNATTENDED = "This session runs unattended.";

/**
 * A user prompt: a plain string, a list of `text` parts, or the `/goal`
 * command wrapper the board loop's stage session is recorded under, its
 * `<command-args>` text keeping its newlines.
 */
export type Prompt = string | { parts: string[] } | { goal: string };

/** The user line Claude Code writes for `prompt`. */
export const said = (prompt: Prompt) =>
	JSON.stringify({
		type: "user",
		message: {
			role: "user",
			content:
				typeof prompt === "string"
					? prompt
					: "parts" in prompt
						? prompt.parts.map((text) => ({ type: "text", text }))
						: `<command-message>goal</command-message>\n<command-name>/goal</command-name>\n<command-args>${prompt.goal}</command-args>`,
		},
	});

/**
 * A transcript holding `prompts` as user lines, then `calls` in order, each as
 * the assistant line carrying the tool use and the user line carrying its
 * result, as Claude Code writes them; `extra` lines are written verbatim after
 * them.
 */
export function transcript(
	calls: Call[],
	extra: string[] = [],
	prompts: Prompt[] = [],
): string {
	const lines = calls.flatMap((call, n) => [
		JSON.stringify({
			type: "assistant",
			message: {
				role: "assistant",
				content: [
					{ type: "tool_use", id: `t${n}`, name: call.name, input: call.input },
				],
			},
		}),
		JSON.stringify({
			type: "user",
			message: {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: `t${n}`,
						content: call.plain
							? call.result
							: [{ type: "text", text: call.result }],
						...(call.failed ? { is_error: true } : {}),
					},
				],
			},
		}),
	]);
	const file = join(scratch(), "session.jsonl");
	writeFileSync(file, [...prompts.map(said), ...lines, ...extra].join("\n"));
	return file;
}

/** The card read the way a session reads it before asking, after `prompts`. */
export const read = (...prompts: Prompt[]) =>
	transcript([fetched(CARD, "Harness"), comments(CARD)], [], prompts);

/** A `PermissionRequest` event for `notion-create-comment` with `input`. */
export const event = (
	input: object,
	path: string = read(),
	tool = "mcp__claude_ai_Notion__notion-create-comment",
) =>
	JSON.stringify({
		session_id: "s1",
		transcript_path: path,
		hook_event_name: "PermissionRequest",
		tool_name: tool,
		tool_input: input,
	});

/** A question on the card, with `extra` fields beside it. */
export const asked = (extra: object = {}, path?: string) =>
	event({ page_id: CARD, markdown: QUESTION, ...extra }, path);

/**
 * The gate's verdict on `stdin`, exactly as given, and the ledger it left.
 * `state` names the ledger's directory, a file there making it unwritable;
 * `env` is added to the hook's environment.
 */
export function run(stdin: string, state?: string, env: Record<string, string> = {}) {
	const dir = scratch();
	const home = state ?? join(dir, "state");
	const call = Bun.spawnSync(["bun", script], {
		cwd: dir,
		env: { PATH: process.env.PATH, HOME: dir, XDG_STATE_HOME: home, ...env },
		stdin: Buffer.from(stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	let ledger: { decision: string; rule: string; gate: string }[] = [];
	try {
		ledger = readFileSync(join(home, "harness/gates.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
	} catch {
		// No ledger written: the case reads an empty list.
	}
	return { code: call.exitCode, out: call.stdout.toString(), ledger };
}

/** The decision object an allow carries, as Claude Code reads it. */
export const ALLOW = {
	hookSpecificOutput: {
		hookEventName: "PermissionRequest",
		decision: { behavior: "allow" },
	},
};
