# turn-gate-keeps-mid-turn-mark

## Why

A message the user queues while a turn runs drops the turn gate for that turn.
Claude Code hands a queued message to the model inside the same turn, the
`UserPromptSubmit` hook fires for it, and `turn-gate.ts mark` rewrites the
session's mark to the current `HEAD`. The `Stop` that follows sees `HEAD` equal
to the mark, finds no work, and lets the turn end without a record, so a commit
that completed a task group passes with no runner (card *Keep turn-gate's
refusal when a message arrives mid-turn*, 40939875c31b811e9370f2457b3eaccc).

The probe of 02.11 confirmed it (probe 02.11, user; Claude Code 2.1.316): a turn
that committed a completed group without `pre-pr` was refused and released
(case A); the same turn with a message queued during its last command, answered
in the same turn, ended with no refusal in the chat and no `turn-gate` record in
the ledger (case B). A user interrupt reaches the same end by the documented
path: `Stop` does not run, and the next prompt rewrites the mark. On the VPS the
user writes through Remote Control, often mid-turn, and stage 6 prints Windmill
events into the session as input, so each would drop the gate.

## What Changes

- The `Stop` half writes `<mark>.stopped` beside the session's mark whenever it
  lets a turn end — a pass, a release, a turn with nothing to judge, the round
  ceiling's end — and never when it refuses.
- The `UserPromptSubmit` half rewrites the mark only when the session has no
  mark or `<mark>.stopped` exists, and removes `<mark>.stopped` when it does. A
  prompt that arrives mid-turn, or after a turn that ended without `Stop`,
  leaves the mark — and its ` refused` flag — as it was.
- The round counter is unchanged: every prompt still starts it again.
- `commit-gates`' turn-gate requirement says when the mark is taken, how long it
  lives, and that an interrupted turn's commits are judged by the next turn's
  `Stop`.

Not in this change: the `commit` and checkout project on the turn gate's ledger
records (#355, Minors 1 and 2, which the card's explore put beside this fix);
gating a subagent's turn, which ends through `SubagentStop` (`design.md`, *Known
limits*).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: *A turn that commits reports its gates before it ends* — the
  mark is taken on the first prompt after a turn the `Stop` half let end, so a
  prompt mid-turn and an interrupted turn no longer move it.

## Impact

- Changed: `bun/turn-gate.ts` (`mark`, `decide`, the ceiling branch),
  `bun/turn-gate-turn.test.ts`, `bun/turn-gate-ceiling.test.ts`.
- One more file per session in `$TMPDIR/turn-gate/`, cleared by the OS as the
  marks are.
- Consumers get it through the package; their registrations do not change.
