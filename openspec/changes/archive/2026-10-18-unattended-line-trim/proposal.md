# unattended-line-trim

## Why

Live check 1.8 of `question-gate-reason` (2026-10-18) started a stage with
the documented `claude -p '…'` form, copied from a terminal. The copy
indented every continuation line by two spaces, so the prompt held
`  This session runs unattended.`. The question gate compares whole lines
exactly, so it read the session as attended. It recorded the unmarked
comment as `passed unmarked` and gave no answer, and the session got Claude
Code's stock "do not retry" refusal instead of the gate's reason. A rerun
with the line unindented worked: `refused unmarked`, then the session retried
and the gate recorded `allowed question`.

## What Changes

- A prompt line declares the session unattended when it holds
  `This session runs unattended.` and nothing else, ignoring whitespace
  around it: an indent, a trailing space, a trailing carriage return.
- Text beside the sentence on the same line still leaves the session
  attended, as does the sentence anywhere but the first prompt.
- `core/autonomy.md` and `core/feature-workflow.md` say so.

## Non-goals

- Reading the declared line outside the first prompt, or from a brief file
  the prompt points at. `question-gate-reason`'s design rejected both, and
  this change keeps that.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-autonomy`: *A session is attended unless the prompt that started it
  says otherwise* reads the declared line ignoring whitespace around it, and
  gains a scenario for the terminal-copy indent.
- `agent-permissions`: *A question to the user on a board card needs no
  prompt* says the same in its unattended-session scenario.

## Impact

- `bun/question-gate.ts`'s `unattended()`, with its tests in
  `bun/question-gate-unattended.test.ts`. The case `question-gate-reason`
  pinned as attended, a trailing space after the line ([9] there), now reads
  unattended.
- Sessions get the fix once the consumers' self-pin moves past this change.
