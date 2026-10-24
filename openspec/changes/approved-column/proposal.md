# approved-column

## Why

A board's `idea` column holds every card anyone filed, the user's chosen
work and passing notes alike: on 2026-10-24 `Harness` held 116 of them. The
board loop is about to take cards at every status
(`Let the board loop carry every status's next stage`), and an unattended
session has no way to tell an idea the user wants worked from one filed and
forgotten. The user decided (2026-10-24) that the boundary is a column of
their own: `approved`, the status after `idea`, holding the ideas they have
pushed toward implementation, by an agent or by hand. The loop starts from it
and from nothing earlier.

## What Changes

- `task-board`'s status vocabulary gains a tenth status, `approved`, between
  `idea` and `exploring`. Only the user moves a card to it; an unattended
  session takes no work from `idea` and never moves a card to `approved`.
- Every board's `Status` select is set to the ten options, in order. No option
  is retired, so no card moves. `D2ASS` and `mellon` take the same list, as
  the vocabulary is one for every board.
- `approved` is moved by hand, like the six statuses the tree cannot see:
  `bun/board-state.ts` derives it nowhere, and its header and its test name it
  among the statuses it never reports.
- `core/feature-workflow.md` names the user as the only one who moves a card
  to `approved`, and counts ten statuses, three derived and seven by hand.

Not in this change: the loop's pick from `approved` and its limit of ten cards
in work past it. Both belong to `Let the board loop carry every status's next
stage`, which depends on this change.

## Impact

- `openspec/specs/task-board/spec.md`: the status requirement, renamed
  *Three statuses are derived and seven are moved by hand*.
- `core/feature-workflow.md`, `bun/board-state.ts` (header), its test.
- The `Status` property of `Harness`, `D2ASS` and, when provisioned, `mellon`.
