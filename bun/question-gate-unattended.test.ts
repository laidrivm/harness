/**
 * The question gate in a session whose first prompt declares it unattended:
 * the `deny` it answers there, the reason that `deny` carries, what it records,
 * and how the gate tells such a session from one with a person at the prompt.
 * [n]: `question-gate-reason`'s `/zombies` ideas; [tn]: `unattended-line-trim`'s.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CARD,
	MARK,
	QUESTION,
	UNATTENDED,
	asked,
	cleanup,
	comments,
	event,
	fetched,
	type Prompt,
	read,
	run,
	said,
	scratch,
	transcript,
} from "./question-gate.fixture.ts";

afterAll(cleanup);

/** The stage prompt the board loop starts a session with, as a plain string. */
const STAGE = `/goal Carry step 2 of the OpenSpec change demo.\n${UNATTENDED}\nThe goal is met when the check opens with \`goal met\`.`;
/** A comment that fails only the mark. */
const UNMARKED = "Ship the hook as one group?";

/** The gate's verdict on an unmarked comment on the card, read after `prompts`. */
const unmarked = (...prompts: Prompt[]) =>
	run(asked({ markdown: UNMARKED }, read(...prompts)));

/** The decision an answer carries, or `null` for no answer. */
const decision = (out: string) =>
	out ? JSON.parse(out).hookSpecificOutput.decision : null;

describe("in an unattended session", () => {
	// spec: agent-permissions/a-call-the-hook-does-not-allow-in-an-unattended-session
	test("an unmarked comment is answered deny, as the decision object with a message, with exit 0 [3]", () => {
		const { code, out } = unmarked(STAGE);
		expect({ code, out: JSON.parse(out) }).toEqual({
			code: 0,
			out: {
				hookSpecificOutput: {
					hookEventName: "PermissionRequest",
					decision: { behavior: "deny", message: expect.any(String) },
				},
			},
		});
	});

	// spec: gate-ledger/a-comment-the-question-gate-refuses
	test("the denial is recorded refused under unmarked [4]", () => {
		expect(unmarked(STAGE).ledger).toEqual([
			expect.objectContaining({
				gate: "question-gate",
				decision: "refused",
				rule: "unmarked",
			}),
		]);
	});

	// spec: agent-permissions/a-question-on-a-card
	test("a conforming question is still answered allow [5]", () => {
		expect(decision(run(asked({}, read(STAGE))).out)).toEqual({
			behavior: "allow",
		});
	});

	const path = () => read(STAGE);
	// spec: agent-permissions/a-call-the-hook-does-not-allow-in-an-unattended-session
	test.each([
		["reply", () => asked({ reply_to_comment_id: "c1" }, path()), "`discussion_id` or `reply_to_comment_id`"],
		["anchored", () => asked({ selection_with_ellipsis: "# A...b" }, path()), "without `selection_with_ellipsis`"],
		["rich-text", () => event({ page_id: CARD, rich_text: [{ text: { content: QUESTION } }] }, path()), "as `markdown`, not `rich_text`"],
		["unmarked", () => asked({ markdown: UNMARKED }, path()), `opens with ${MARK}, its backticks included`],
		["mention", () => asked({ markdown: `${QUESTION} <mention-user url="user://u"/>` }, path()), "no user mention"],
		["length", () => asked({ markdown: `${MARK} ${"q".repeat(1500)}` }, path()), "at most 1500 characters"],
		["not-a-card", () => asked({}, transcript([comments(CARD)], [], [STAGE])), "`notion-fetch` first"],
		["comments-unread", () => asked({}, transcript([fetched(CARD, "Harness")], [], [STAGE])), "`notion-get-comments` first"],
		["unreadable", () => event({ page_id: "card", markdown: QUESTION }, path()), "32-hex id"],
	])("%s is refused with a message that opens on its rule [15] and names its remedy [6] [11]", (rule, stdin, remedy) => {
		const { out, ledger } = run(stdin());
		const { message } = decision(out);
		expect(message).toStartWith(`question-gate refused this comment (${rule}): `);
		expect(message).toContain(remedy);
		expect(ledger.map((r) => [r.decision, r.rule])).toEqual([["refused", rule]]);
	});

	test("the not-a-card message names every board", () => {
		const { out } = run(asked({}, transcript([comments(CARD)], [], [STAGE])));
		expect(decision(out).message).toContain("D2ASS, Harness, mellon");
	});

	test("two failing conditions name only the first, reply, in the message as in the ledger [8]", () => {
		const both = asked({ discussion_id: "d", markdown: UNMARKED }, path());
		const { out, ledger } = run(both);
		expect(decision(out).message).toStartWith("question-gate refused this comment (reply): ");
		expect(decision(out).message).not.toContain("(unmarked)");
		expect(ledger.map((r) => r.rule)).toEqual(["reply"]);
	});

	// spec: agent-permissions/the-comment-corrected-after-a-refusal
	test("a refused unmarked comment, then the same session's conforming one, is refused then allowed [19]", () => {
		const state = join(scratch(), "state");
		const session = path();
		run(asked({ markdown: UNMARKED }, session), state);
		const { ledger } = run(asked({}, session), state);
		expect(ledger.map((r) => [r.decision, r.rule])).toEqual([
			["refused", "unmarked"],
			["allowed", "question"],
		]);
	});

	test("a ledger that cannot be written leaves the deny standing [18]", () => {
		const blocked = join(scratch(), "not-a-directory");
		writeFileSync(blocked, "");
		const { out } = run(asked({ markdown: UNMARKED }, path()), blocked);
		expect(decision(out)?.behavior).toBe("deny");
	});
});

describe("which session is unattended", () => {
	/** No answer and a `passed` record: the session reads as attended. */
	const ATTENDED = { out: "", decisions: ["passed"] };
	const seen = ({ out, ledger }: ReturnType<typeof run>) => ({
		out,
		decisions: ledger.map((r) => r.decision),
	});

	// spec: agent-permissions/a-person-at-the-prompt
	// agent-permissions/the-line-outside-the-first-prompt
	test.each([
		["no prompt line, tool calls only [1]", []],
		["an empty first prompt [2]", ["", STAGE]],
		["the line only in the second prompt [7]", ["Carry step 2.", STAGE]],
		["the line inside a longer line [9]", [`Carry step 2. ${UNATTENDED} The goal.`]],
		["the indented line with text after it [t6]", [`Carry step 2.\n  ${UNATTENDED} Carry on.`]],
		["the indented line without its full stop [t7]", [`Carry step 2.\n  ${UNATTENDED.slice(0, -1)}`]],
	] as [string, Prompt[]][])("%s reads attended: no answer, recorded passed", (_, prompts) => {
		expect(seen(unmarked(...prompts))).toEqual(ATTENDED);
	});

	// spec: agent-autonomy/a-declared-line-copied-from-a-terminal
	test.each([
		["the line as the prompt's last line, no newline after it [10]", `Carry step 2.\n${UNATTENDED}`],
		["the line inside the /goal wrapper [12]", { goal: `Carry step 2 of the OpenSpec change demo.\n${UNATTENDED}\nThe goal is met.` }],
		["a prompt written as a list of text parts [13]", { parts: ["Read the brief.", `Carry step 2.\n${UNATTENDED}`] }],
		["the line indented by two spaces [t1]", `Carry step 2.\n  ${UNATTENDED}\n  The goal.`],
		["the line ending in a carriage return [t2]", `Carry step 2.\r\n${UNATTENDED}\r\nThe goal.`],
		["the line with a trailing space [t3]", `Carry step 2.\n${UNATTENDED} \nThe goal.`],
		["the line led by a tab [t4]", `Carry step 2.\n\t${UNATTENDED}`],
		["the stage prompt as a terminal copy gives it [t9]", STAGE.replaceAll("\n", "\n  ")],
	] as [string, Prompt][])("%s reads unattended", (_, prompt) => {
		expect(decision(unmarked(prompt).out)?.behavior).toBe("deny");
	});

	test("a user line holding only a tool_result is no prompt: the prompt after it is the first [14]", () => {
		const path = transcript([fetched(CARD, "Harness"), comments(CARD)], [said(STAGE)]);
		expect(decision(run(asked({ markdown: UNMARKED }, path)).out)?.behavior).toBe("deny");
	});

	// spec: agent-permissions/the-hook-cannot-read-what-it-decides-on
	test("an event whose transcript_path does not exist gives no answer, recorded passed [16]", () => {
		const missing = join(scratch(), "missing.jsonl");
		expect(seen(run(asked({ markdown: UNMARKED }, missing)))).toEqual(ATTENDED);
	});

	test("an event that is not JSON gives no answer, recorded passed unreadable [17]", () => {
		const { out, ledger } = run("{ not json");
		expect({ out, ledger: ledger.map((r) => [r.decision, r.rule]) }).toEqual({
			out: "",
			ledger: [["passed", "unreadable"]],
		});
	});
});
