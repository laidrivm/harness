/**
 * The two prompts of a board-loop pass: the stage session's launch form, as
 * `core/feature-workflow.md` fixes it, and the pick session's.
 */
import { MARK } from "./question-gate.ts";

/** `answer`: every group is ticked, so the step is N+1 and carries the answer on the card. */
export type Step = { step: number; branch: string; answer: boolean };

/**
 * The launch form `core/feature-workflow.md` fixes for an apply step, or its
 * answer variant, the first line naming a branch a session left. `asks`: the
 * runner posts the session's question from the Notion integration.
 */
export function prompt(slug: string, { step, branch, answer }: Step, check: string, resumed: boolean, asks: boolean): string {
	const work = answer
		? `write the answer on its card into its tasks.md as group ${step}, then /opsx:apply ${slug} for that group`
		: `/opsx:apply ${slug} for its group ${step}`;
	// task-board, *The answer asks for a change of its own*: the check then reads `open`, by design.
	const instead = answer
		? " — or, when the answer asks for a change of its own or its work would not fit one step, file an `idea` card for it, clear the card's `Assign`, add no group and end with `BLOCKED — <that card>`"
		: "";
	// Never `git switch -c`: a local branch makes it fail, and one on `origin` alone a second branch from main.
	const resume = resumed
		? ` A session left the branch ${branch}: switch to it with \`git switch ${branch}\` rather than create it, and carry on from what its commits hold.`
		: "";
	return [
		`/goal Carry step ${step} of the OpenSpec change ${slug}: ${work} and the pre-PR sequence, up to a committed HEAD on the branch of the step — the runner, not this session, pushes that branch and opens the pull request${instead}.${resume}`,
		"This session runs unattended.",
		`The goal is met when the last line of \`bun ${check} apply ${slug} ${step} --before-push\`, run after the last commit, opens with \`goal met\` — or when the final message opens with \`BLOCKED —\` and names what only the user can settle.`,
		// No apostrophe: the doc's form wraps the prompt in the shell's single quotes.
		asks
			? `A question only the user can settle goes in the final message, never on the card, since this session posts no comment: after reading that card and its comments, write a line \`QUESTION: <the id of the card of the change>\` before any \`PR-TITLE:\` line, with the question below it, opening with ${MARK}, its two backticks included — the runner posts it.`
			: `A question only the user can settle goes on the card of the change as one page-level comment — \`page_id\` and \`markdown\` only, after reading that card and its comments — whose markdown opens with ${MARK}, its two backticks included.`,
		// `board-loop-push.ts` reads these two, as the pass reads `PICK:`.
		"When the pull request is to open, end the final message with a line `PR-TITLE: <title>`, then a line `PR-BODY:` with the body below it to the end; when a gate line holds the pull request back, write neither.",
	].join("\n");
}

/**
 * The pick session's prompt: no goal, and one write, the claim. The runner
 * neither reads nor waits on that move, since it reads no card's `Status`,
 * and a pass that fails after it leaves the card at `applying` for the next.
 */
export function pickPrompt(board: string, slugs: string[], answers: string[]): string {
	return [
		`Read the saved view named \`Board view\` of the Notion board ${board}, and change nothing but the \`Status\` of the card you pick.`,
		"This session runs unattended.",
		`These changes are takeable: ${slugs.join(", ") || "none"}. A card's \`Pointer\` names its change as \`openspec/changes/<slug>/\`.`,
		`These changes are answer candidates: ${answers.join(", ") || "none"}. Take one only when its card's \`Assign\` holds the user and its page-level discussion, read with \`notion-get-comments\` with \`include_resolved: true\` (the default leaves resolved ones out) and never a comment on a block, holds a comment opening with \`harness-question\` and, after the last such comment, one by the user \`Assign\` names that does not open with it. That last question counts whichever account posted it, a Notion integration included. A card with no such question is no answer.`,
		"Take an answered candidate's card first, from `applied` or `applying`, then the `applying` column, then `proposed`, and each in the order the view returns it. Find the first card whose pointer names a takeable change or an answered candidate.",
		"Before you answer, set the `Status` of the card your `PICK:` line names to `applying` when it reads `proposed`, or when it reads `applied` and names an answer candidate, then fetch that card again, and write no other card or property. Write nothing when that line names no change listed above. Leave a card already at `applying` unwritten. A write that fails changes nothing about your answer.",
		"End with one line, `PICK: <slug>` for its change or `PICK: none` when no card names one, and write no other line starting `PICK:`.",
	].join("\n");
}
