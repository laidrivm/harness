# notion-ask-sets-assign

## Why

On 2026-10-31 five explore agents each posted a `harness-question` with
`bun bun/notion-ask.ts`, and only one then set the card's `Assign` to the
user, so four questions were missing from the board's `Questions` view and
from the board loop's answer pick. The step lives only in prose: task-board
says the command writes no property and the session sets `Assign` through the
connector. The ask integration has held *Update content* since
`2026-10-29-notion-status-gate`, so the command can write `Assign` itself. The
user widened the change on the card on 2026-10-31 (answers 1 and 2 a): a
second question no longer waits for the first one's answer.

## What Changes

- `notion-ask` sets the card's `Assign` to the user after every post, through
  the existing `assign()` of `bun/notion-bot.ts`, and reads it back from the
  PATCH's answer. It prints `question: posted on <id>, Assign set`, or
  `question: posted on <id>, Assign not set — <why>` and exits 1 (answer 2 a).
  A post on a card whose `Assign` was cleared sets it again (answer 1).
- **BREAKING** for a session that relied on it: `notion-ask` no longer
  refuses while a question waits. It posts a question whatever the card
  holds, and so no longer reads the card's comments (answer 1). A post that
  may have reached Notion without an answer prints `question: may be posted`
  and asks for the card to be read before a rerun.
- A card may hold several questions. Questions known at the same time go in
  one comment, and a separate comment carries only a question that arose
  after the last one was posted. Numbering continues across the card's
  questions, never restarting at 1 (answer 1). The session keeps the
  numbering; no code checks it (answer 3 a).
- What answers several questions stays the rule `waits()` already applies: the
  questions wait while no comment by the user without a mark follows the
  last question (design, *What answers several questions*).
- `bun bun/work.ts status` (on any move), `take` and `finish --card` (on
  every push) remove the user from the card's `Assign` when no question and
  no pause notice waits there, through one function lifted from
  `notion-unassign`'s write, which keeps everyone else (the user's widenings
  in chat, and item 4 b). The prose "clear `Assign` once it is applied"
  stays for the boards these commands do not run on.
- The board loop's pick takes a card carrying an answer whatever its
  `Assign` holds, and task-board clears `Assign` "by then at the latest"
  rather than "never earlier" than the answer step's pull request (item 4
  b). What then marks an answer as carried is card item 5, open.
- The board loop's runner keeps its refusal (`board-loop`, *A question
  already waits*): it guards a retried pass against posting twice.
- The prose step "set `Assign` after `question: posted`" becomes "unless the
  line ends `Assign set`" in `core/feature-workflow.md`, in
  `bun/board-loop-prompt.ts` and in the question gate's `ask` message. That
  wording is right under a consumer's pin from before this change as well as
  after it, and it stays for the `Assign not set` exit (design, *The prose
  step and the pins*).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-board`: *An open question waits on its card, assigned to the user*
  allows several questions per card, grouped and numbered across the card; its
  scenario *A second question for a card* changes. *A session asks through the
  ask integration where one is configured* moves the `Assign` write into the
  command and drops its refusal. *An answer the board loop carries is
  applied when its pull request opens* lets `Assign` clear earlier. *The
  work commands release `Assign` when nothing waits* is added.
- `work-take`: *Take writes nothing and fails closed* allows that release.
- `work-status` and `work-finish`: each gains the requirement that it runs
  the release, and where its line goes.
- `board-loop`: *A pass takes the first takeable card in the board's order*
  takes an answer candidate whatever its `Assign` holds.

## Impact

- `design.md` and `tasks.md`, which the references to the design above
  name, follow in the plan pull request on
  `spec/notion-ask-sets-assign-plan`, the five artefacts together being
  over the diff budget.
- Changed: `bun/notion-ask.ts` (no comments read, the `Assign` write and its
  read-back, the header), `bun/notion-ask.test.ts`, `bun/board-loop-prompt.ts`
  (the ask line and the pick's answer line) and its tests,
  `bun/question-gate.ts`'s `ask` message, `bun/notion-unassign.ts` (the
  lifted write), `bun/work-status.ts`, `bun/work-take.ts`,
  `bun/work-finish.ts` and their tests, `core/feature-workflow.md`,
  `README.md`'s rows for the commands.
- Notion: one PATCH of the card per post, under the ask integration's
  *Update content*; for `status`, `take` and `finish`, a page read and,
  only while `Assign` holds the user, a comments read and one PATCH; no
  schema change.
- Not in this change: the four cards left unassigned on 2026-10-31, which
  the main session sets by hand; a check of the numbering in code.
