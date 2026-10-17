# question-gate-reason

## Why

On the board loop's live pass of 2026-10-17, the stage session for step 2 of
`drop-mutation-exemptions` (#136) tried to ask the user about task 2.2 by
commenting on the change's card. The question gate recorded
`question-gate passed unmarked` at 20:54:28: the comment carried no mark at
all. Nothing the session had read named the mark. The stage prompt does not
mention it. `core/feature-workflow.md` says only "Open the comment with the
gate's mark", and the session's transcript holds neither `harness-question`
nor that sentence.

The gate gave no answer, as its requirement says it must. In a `claude -p`
session that cannot show a prompt, no answer is a refusal. Claude Code then
hands the session its stock text: "this session has no approval surface …
do not retry it: this action, and anything else that requires approval, will
be denied the same way for the rest of this session". The session took that
at its word. It wrote the question into the card's body instead. The answer
pickup from #133 reads only the comments after a marked question, so the
loop will never pick that answer up by itself.

This has to land before B1, which walks the loop over the old cards, where
questions will be frequent.

## What Changes

- **The stage launch form names the mark.** The launch form in
  `core/feature-workflow.md` *Unattended stages*, and `prompt()` in
  `bun/board-loop.ts`, which builds it, gain one line. It says that a
  question only the user can settle goes on the change's card as one
  page-level comment, with `page_id` and `markdown` only, whose text opens
  with the gate's mark, backticks included, once the card and its comments
  have been read. `prompt()` takes the mark from `bun/question-gate.ts`, so
  the two cannot drift apart. The question bullet in *Across the stages*
  names the mark too, where today it says only "the gate's mark".
- **The gate says why it refused an unattended session.** A session is
  unattended when the prompt that started it holds the line
  `This session runs unattended.` (agent-autonomy). In such a session the
  question gate now answers `deny` to a comment it would otherwise pass.
  The denial carries a message that names the condition the comment failed
  and what would make it a question, so the session can fix the comment and
  send it again. Whether it replaces Claude Code's "do not retry" or comes
  beside it is unmeasured; the live check in task 1.8 records which.
  Where the starting prompt does not declare the session unattended, nothing
  changes: the gate gives no answer, and a person at the prompt may still
  approve a comment the gate does not recognise.
- The gate ledger records such a denial as `refused` under the same rule, so
  `refused unmarked` and `passed unmarked` can be told apart.

## Non-goals

- **The pick session's prompt.** `pickPrompt` reads the mark in comments
  someone else posted, and how `notion-get-comments` renders inline code is
  not measured here. It keeps its wording.
- **A question already written into a card's body.** The question on the
  `drop-mutation-exemptions` card is the board owner's to move. This change
  prevents the next one.
- **A `PreToolUse` registration.** One more hook that answers `ask` with a
  reason is the only documented way to reach the model without a decision.
  design.md weighs it and turns it down.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: *A question to the user on a board card needs no
  prompt*. The hook refuses, with a reason, the calls it does not allow,
  but only in a session that declares itself unattended.
- `gate-ledger`: *Every gate refusal is recorded*. The question gate is no
  longer the gate that refuses nothing, and it records its refusals.
- `stage-goal`: *An unattended stage runs under one goal on the check*. The
  launch form names the question gate's mark and the question's form.

## Impact

- `bun/question-gate.ts` reads the session's starting prompt from the
  transcript it already parses, writes the `deny` decision with its message,
  and exports its mark. Tests go in a new
  `bun/question-gate-unattended.test.ts`, on prompts that
  `bun/question-gate.fixture.ts` learns to write.
- `bun/board-loop.ts` `prompt()` gains its fourth line, which
  `bun/board-loop-stage.test.ts` pins against the gate's mark and against
  `core/feature-workflow.md`.
- `core/feature-workflow.md`, the `README.md` ownership map's question-gate
  and ledger lines, and the gate's header comment are reworded.
- Consumers: `d2ass` registers the gate and gets the change with its next
  pin bump. `mellon` does not register it. No settings entry changes.
