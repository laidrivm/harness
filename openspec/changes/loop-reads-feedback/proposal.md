## Why

The feedback the user gave interactive sessions on 2026-10-22…24 reaches no
unattended session: the board loop's sessions read `core/rules.md`, the docs it
indexes, the prompts in `bun/board-loop-prompt.ts` and
`core/feature-workflow.md`, never a chat session's memory. An audit of that
feedback against what the loop reads found five one-line gaps in the question
form, a resumed step branch that never takes `main`, a pull-request rule that
says nothing of a question still open on the card, and a card summary cap the
user has relaxed. The user settled each on the card "Carry the session's
feedback into what loop sessions read".

## What Changes

- The question line of every stage form asks for options and a recommendation
  per question, the question in Russian, and each command the user must run on
  its own line; the ask form and the comment form also set the card's
  `Assign` to the user and read the card back.
- A resumed step branch merges `origin/main` before any other work.
- `core/git-and-prs.md`: a pull request always opens with the work, as a
  draft while a question to the user on its card is unanswered, and goes ready
  only once the answers settle every item (the user's decision of 2026-10-25,
  for local sessions and the board loop alike).
- `task-board`: a card summary is about 500 characters and may run longer for
  context its ranking needs, never a restated proposal.

Out of scope, settled for later on the same card: clearing `Assign` as soon as
the answers settle in loop sessions too (it needs the pick to find an answered
card without `Assign`), and the laptop's comment form, which stays as it is
when neither the bot nor the ask settings exist.

## Impact

- `bun/board-loop-prompt.ts`, `core/feature-workflow.md`,
  `bun/board-loop-question.test.ts`, `core/git-and-prs.md`, the `task-board`
  spec. Reaches the host with the next pin bump.
