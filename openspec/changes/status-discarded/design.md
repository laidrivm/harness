# status-discarded — design

## Context

`bun/work-status.ts`'s `status(card, to)` refuses a target in `USER_ONLY`
(`idea`, `approved`, `discarded`) before any call, then reads the page and
refuses any target for a card at `discarded`. The checks after that are the
evidence on `origin/main` for `proposed`, `applied` and `done`, and the WIP
limit for an entry into `exploring` … `archiving`; then the `Status` write
and the release of `Assign` (`cleared()`). Refusals are recorded in the gate
ledger under `user-only`, `unread`, `no-evidence`, `wip-full` and the rest.

`bun/notion-bot.ts`'s `comment(call, card, text, mark)` posts a page-level
comment from the ask integration whose first run is `mark` in code; the
question, the answer and the pause notice are its three callers today.
`waits()` counts as an answer only a comment by the user or a
`harness-answer` by the integration, so a further comment by the
integration under another mark answers no question and opens none.

`bun/board-state.ts`'s `corrected()` leaves a `discarded` card where it is,
and lifts any other card behind its change's floor.

## Goals / Non-Goals

**Goals:** a session moves a card to `discarded` and back out of it with the
command it moves every other status with, and the card shows who moved it
and why.

**Non-Goals:** sessions setting `approved`, or `idea` from any status but
`discarded`; restoring the status a card was discarded from; a guard on
which session may discard (an unattended one included); a session's
discard on a board whose sessions move statuses through the connector
rather than `work.ts status` — there `discarded` stays the user's, since no
command posts the reason.

## Decisions

### Out of discarded goes to idea alone

The user settled this on the card: «Агенту вернуть карточку из discarded
сразу в approved пока нельзя — только в idea». `idea` is the one status that
claims nothing: the next reconciliation lifts the card to its change's floor
when the tree holds one, and a hand-moved status is reached by a further
`status` move under its usual checks. Recording the status a card left and
restoring it would need a reader for the comment or a second property for a
case those two moves already cover.

A `discarded` card's only target is `idea`: `--to discarded` on it is
refused like any other. A retry after a failed write needs no such move —
a card the write left at its old status is discarded again from there, and
one the write did move is already where the retry wanted it.

### `--why` is required, and only where the move is the user's otherwise

`--why` is required with `--to discarded` and `--to idea` and refused with
any other `--to`, at the argument read, so a missing or misplaced reason
prints the usage and exits 2 before any call, as every other malformed
argument does. `--to idea` can only ever be written from `discarded`, so
requiring it there at the argument read is exact. A blank or all-whitespace
`--why` is malformed.

### The reason is a bot comment, posted before the write

The comment, not the card's body: the body is the card's summary and links
(`task-board`), a comment carries its author and time without the text
saying so, and `comment()` already posts one from the integration — never
under the user's account. Its text is
`` `harness-status` <from> → <to>: <why> `` with `<from>` as the page read
gave it.

The note is posted after every check passes and before the `Status` write.
A note whose write then fails leaves a reason on a card that did not move,
and the line says the status was not written; the other order would leave a
card at `discarded` with no reason when the post fails. A post that fails
writes nothing and prints one line opening `status: <card> not written —`,
exit 1, and records nothing in the gate ledger — both as a failed write
does. A post that timed out or answered a 5xx may still have landed, so a
rerun can leave the reason twice on the card. That is accepted: a repeated
note costs a line in the discussion, while reading the comments back before
a retry, as `notion-ask.ts` does for a question, would add a read for a note
nothing waits on.

### No WIP count and no evidence for either move

Neither target is in the work range or a merged status, so neither check
applies, as today for any move out of the range. Leaving the range for
`discarded` frees a WIP place, as a move to `done` does.

## Risks / Trade-offs

- An unattended session can now discard an approved card. The `--why` note
  is the audit, and the user returns the card with one move; no session has
  been seen discarding wrongly, so no guard is added against one.
- The ledger keeps `user-only` as the refusal id for the moves that stay the
  user's. A `--to idea` from a card outside `discarded` is now refused under
  it after the page read, not before any call, so a run with no ask settings
  is recorded as `unread` instead, and one with no `--why` exits 2 with no
  record: the ledger counts fewer `idea` attempts than it did.
- The release after a discard is `cleared()`'s, unchanged: a card discarded
  while a question waits keeps the user on `Assign`, so the user sees the
  discard beside the question it leaves unanswered, and clears both.
- `status` now needs the ask integration's *Insert comments* capability as
  well as *Update content*; the `README.md` row names both.
