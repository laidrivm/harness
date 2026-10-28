# turn-gate-evidence

## Why

The turn gate lets a turn that completed a task group end when its final
message carries a gate line (`GATE_LINE`) and the ledger holds any pre-PR
runner record of the tip, or a named `BLOCKED` (`NAMED_BLOCK`). The line
proves nothing the record does not — any `X gate: OPEN` passes — and the
previous design broke where code parsed the model's text. Stage 2 of the
roadmap closes on the gate reading evidence, not text (*Потом* 7). The user
settled the card's questions on 2026-10-28 (design.md, *User's answers*).

## What Changes

- `bun/turn-gate.ts` stops reading the final message: `GATE_LINE`,
  `NAMED_BLOCK` and the exported `reported()` go, with their tests.
- A turn that left a commit and completed a group ends when the ledger holds a
  `pass` record of the tip in this checkout for every runner step (the diff
  budget and the project checks); otherwise it is refused once per mark, then
  released, as today. **BREAKING**: a `BLOCKED — …` ending, or a failed run
  reported in gate lines, now costs one refusal.
- One refusal text, naming the tip and the runner, and saying it is not
  repeated.
- "Every runner step passed at this commit here", copied in `goal-check.ts`
  and `ranUnder()`, becomes one `gate-ledger.ts` export the turn gate imports.
- The README and `core/review-toolkit.md` stop calling gate lines
  machine-checked and drop `BLOCKED` as the gate's exit. The skills' lines,
  `core/autonomy.md` and `session-wrapup` stay.

Not here: filling `unproven()` in `work.ts finish` (card
`40739875c31b81a2b885cca94a3fd1ad`), judgement-step records in the turn gate,
and the mark, the once-per-mark bound or the `/goal` round ceiling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commit-gates`: *A turn that commits reports its gates before it ends* — the
  message condition goes; a passing run record of the tip discharges the
  turn; the scenarios about gate lines and `BLOCKED` are rewritten.
- `gate-ledger`: *Every gate refusal is recorded* and *A refusal walked past
  is recorded* — a pass rests on the runner's records, not the message.
- `pre-pr-runner`: *A run record counts only for its own step* — the turn
  gate asks for every step's record, as `finish` and the goal check do.

## Impact

- Code: `bun/turn-gate.ts`, `bun/gate-ledger.ts`, `bun/goal-check.ts`, the
  `bun/turn-gate*.test.ts` files, `bun/gate-ledger-turn.test.ts`,
  `bun/gate-ledger-ran.test.ts`, and the `reported()` assertions in
  `bun/goal-check*.test.ts`, `bun/pre-pr.test.ts` and
  `bun/pre-pr-steps-run.test.ts`. Docs: `README.md`, `core/review-toolkit.md`.
- Consumers (d2ass, mellon): the hook reaches them on their next pin bump,
  with the same registration (design.md, *Consumers*).
- `notion-status-gate`'s `gate-ledger` delta copies the same requirement
  (design.md, *Conflict check*).
