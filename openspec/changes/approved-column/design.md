# approved-column — design

## Context

`task-board` fixes the board vocabulary: nine options of a `select` named
`Status`, the complete list on every board, set through the connector's DDL
(`ALTER COLUMN "Status" SET SELECT(…)`), which the requirement chose over
Notion's `status` type precisely so an apply stage can set it. Three of the
nine are derived from the tree by `bun/board-state.ts`; six are moved by hand.

The board loop today never reads an `idea` card: it takes only changes the
tree holds (`consider()` in `bun/board-loop.ts` requires a derived
`proposed`). So nothing in the code depends on where `approved` sits yet; the
dependent card does.

## Decisions

### `approved` sits between `idea` and `exploring`

It is the user's choice of an idea for work, so it comes after `idea` and
before the first stage a session moves. Order matters only to the view's
columns, which follow the option order.

### Only the user moves a card to `approved`

The column exists so an unattended session can tell chosen work from the
rest. A session that could set it would erase that line. An interactive
session the user directs is the user's hand: when the user tells it to work an
`idea` card, the instruction is the approval, and it may move the card straight
from `idea` to `exploring` as today.

### Derived nowhere

`approved` says nothing the tree holds: a card is approved before any change
directory exists. `bun/board-state.ts` keeps deriving its three, and lists
`approved` with the hand-moved statuses it never reports.

### One list on every board

`task-board` refuses a per-board vocabulary. `D2ASS` and `mellon` take the
ten as `Harness` does, in the same apply step. Adding an option retires none,
so the retired-option carry-over has nothing to move.

## Risks / Trade-offs

- [A board write outside this repository] → setting `D2ASS`'s `Status`
  touches another project's board. The vocabulary is shared by requirement,
  and the write only adds an option; the step re-reads each board after it.
- [The DDL rewrites the whole option list] → a statement that drops an option
  by omission would retire it. The step sets all ten by name, compares the read
  back against the list, and stops on a difference.
