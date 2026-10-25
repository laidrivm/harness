/**
 * The two prompts of a board-loop pass: the stage session's launch form, as
 * `core/feature-workflow.md` fixes it, and the pick session's.
 */
import { ASK_COMMAND, MARK } from "./question-gate.ts";

const READ_BACK = "read the card back to confirm it holds the user";

/** `answer`: every group is ticked, so the step is N+1 and carries the answer on the card. */
export type Step = { step: number; branch: string; answer: boolean };

/**
 * The launch form `core/feature-workflow.md` fixes for an apply step, or its
 * answer variant, the first line naming a branch a session left. `asks`: the
 * runner posts the session's question from the Notion integration, or the
 * session posts it with the ask command, or, unset, from the user's account.
 * `self`, `user`: as `pickPrompt` takes them, so the stage session picks the
 * answer the pick did on a card whose `Assign` names nobody.
 */
export function prompt(slug: string, { step, branch, answer }: Step, check: string, resumed: boolean, asks?: "runner" | "ask", self?: string, user?: string): string {
	// No apostrophe, as below.
	const which = self
		? ` (after the last \`harness-question\`, the first comment by the user, whose id is ${user}, opening with neither \`harness-question\` nor \`harness-answer\`, or else the \`harness-answer\` by ${self}, the Notion integration of the runner)`
		: "";
	const work = answer
		? `write the answer on its card${which} into its tasks.md as group ${step}, then /opsx:apply ${slug} for that group`
		: `/opsx:apply ${slug} for its group ${step}`;
	// task-board, *The answer asks for a change of its own*: the check then reads `open`, by design.
	const instead = answer
		? " — or, when the answer asks for a change of its own or its work would not fit one step, file an `idea` card for it, clear the card's `Assign`, add no group and end with `BLOCKED — <that card>`"
		: "";
	// Never `git switch -c`: a local branch makes it fail, and one on `origin` alone a second branch from main.
	const resume = resumed
		? ` A session left the branch ${branch}: switch to it with \`git switch ${branch}\` rather than create it, merge \`origin/main\` into it before any other work, and carry on from what its commits hold.`
		: "";
	return [
		`/goal Carry step ${step} of the OpenSpec change ${slug}: ${work} and the pre-PR sequence, up to a committed HEAD on the branch of the step — the runner, not this session, pushes that branch and opens the pull request${instead}.${resume}`,
		"This session runs unattended.",
		`The goal is met when the last line of \`bun ${check} apply ${slug} ${step} --before-push\`, run after the last commit, opens with \`goal met\` — or when the final message opens with \`BLOCKED —\` and names what only the user can settle.`,
		// No apostrophe: the doc's form wraps the prompt in the shell's single quotes.
		(asks === "runner"
			? `A question only the user can settle goes in the final message, never on the card, since this session posts no comment: after reading that card and its comments, write a line \`QUESTION: <the id of the card of the change>\` before any \`PR-TITLE:\` line, with the question below it, opening with ${MARK}, its two backticks included — the runner posts it.`
			: asks === "ask"
				? `A question only the user can settle goes on the card of the change through the ask command, never as a comment of this session: after reading that card and its comments, write the question to a file, opening with ${MARK}, its two backticks included, run \`${ASK_COMMAND} <the id of the card of the change> <that file>\`, and only once it prints \`question: posted\` set the \`Assign\` of the card to the user and ${READ_BACK}.`
				: `A question only the user can settle goes on the card of the change as one page-level comment — \`page_id\` and \`markdown\` only, after reading that card and its comments — whose markdown opens with ${MARK}, its two backticks included; then set the \`Assign\` of the card to the user and ${READ_BACK}.`) +
			" Give each question its options and a recommendation, write it in Russian, as the cards are, and put each command the user must run on a line of its own." +
			" Number its items in one sequence across its sections, never restarting at 1, so the user can answer by number, and write it as plain text with no markdown syntax beyond that mark — no backticks, asterisks or headings — since Notion shows it literally.",
		// `board-loop-push.ts` reads these two, as the pass reads `PICK:`.
		"When the pull request is to open, end the final message with a line `PR-TITLE: <title>`, then a line `PR-BODY:` with the body below it to the end; when a gate line holds the pull request back, write neither.",
	].join("\n");
}

/**
 * The pick session's prompt: no goal, and one write, the claim. The runner
 * neither reads nor waits on that move, since it reads no card's `Status`,
 * and a pass that fails after it leaves the card at `applying` for the next.
 * `self`: the runner's Notion integration's id, whose `harness-answer` is the
 * triage's answer; with none, no `harness-answer` counts. `user`: the user's
 * id, since `Assign` names nobody on a card the triage answered.
 */
export function pickPrompt(board: string, slugs: string[], answers: string[], self?: string, user?: string): string {
	const triaged = self
		? ` Take one too, whether or not its \`Assign\` holds the user, when after the last such comment its discussion holds one opening with \`harness-answer\` whose author's id is ${self}, the runner's Notion integration; when one by the user, whose id is ${user}, opening with neither \`harness-question\` nor \`harness-answer\` also follows that question, in either order, the user's is the answer. A \`harness-answer\` by any other author is no answer.`
		: " No comment opening with `harness-answer` is an answer.";
	return [
		`Read the saved view named \`Board view\` of the Notion board ${board}, and change nothing but the \`Status\` of the card you pick.`,
		"This session runs unattended.",
		`These changes are takeable: ${slugs.join(", ") || "none"}. A card's \`Pointer\` names its change as \`openspec/changes/<slug>/\`. Pass over a takeable change whose card's page-level discussion, read as below, holds a comment opening with \`harness-question\` and, after the last such comment, none by the user opening with neither \`harness-question\` nor \`harness-answer\`${self ? ` and no \`harness-answer\` whose author's id is ${self}` : ""}: its question waits on the user.`,
		`These changes are answer candidates: ${answers.join(", ") || "none"}. Take one only when its card's \`Assign\` holds the user and its page-level discussion, read with \`notion-get-comments\` with \`include_resolved: true\` (the default leaves resolved ones out) and never a comment on a block, holds a comment opening with \`harness-question\` and, after the last such comment, one by the user \`Assign\` names that opens with neither \`harness-question\` nor \`harness-answer\`. That last question counts whichever account posted it, a Notion integration included. A card with no such question is no answer.${triaged}`,
		"Take an answered candidate's card first, from `applied` or `applying`, then the `applying` column, then `proposed`, and each in the order the view returns it. Find the first card whose pointer names a takeable change or an answered candidate.",
		"Before you answer, set the `Status` of the card your `PICK:` line names to `applying` when it reads `proposed`, or when it reads `applied` and names an answer candidate, then fetch that card again, and write no other card or property. Write nothing when that line names no change listed above. Leave a card already at `applying` unwritten. A write that fails changes nothing about your answer.",
		"End with one line, `PICK: <slug>` for its change or `PICK: none` when no card names one, and write no other line starting `PICK:`.",
	].join("\n");
}
