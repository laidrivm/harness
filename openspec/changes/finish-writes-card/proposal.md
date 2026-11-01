# finish-writes-card

## Why

A card's `Pointer` and the `Ссылки` line under its body are written by hand,
from prose in `core/feature-workflow.md`, and the hand step is missed: on
2026-10-31 four agents opened proposal pull requests through
`bun bun/work.ts finish --card`, and two left the `Pointer` empty (#358,
#359) until the user noticed on the board. An empty `Pointer` makes
`work.ts status` refuse every move past `proposing` (`no-pointer`). On the
host, from roadmap stage 2.5, nobody is there to write either by hand (card
*Let finish --card write the card's Pointer to the change its branch adds*,
explored 2026-11-01, its scope widened by the user the same day to the
pull-request link, absorbing card *Record the card's pull request on the card
as soon as it opens, draft included*).

## What Changes

- `finish --card`, once the pull request exists — opened by this call or
  already open, draft or not yet ready — reads which change directories the
  branch adds files to against its merge base with `origin/main`: under
  `openspec/changes/` outside `archive/`, and under `openspec/changes/archive/`
  — a new change, a `-plan` branch's design and tasks, an archive.
- Exactly one such directory is the card's: `finish` writes it to the
  card's `Pointer` when the `Pointer` is empty or names the same slug before
  its archive, and reads it back; on a card of another repository's board
  it writes the cross-repository form `harness: <path>`. A `Pointer` that
  already says it is left alone; a `pr:<N>` pointer, another change's or
  another repository's is left alone with a line saying so. None or several
  write nothing and say so.
- The pull request goes on the card's `Ссылки` list as
  `[#N](<url>) — <kind>`, `proposal` when one of those directories is
  outside `archive/`, `archive` when one is inside it, `apply` otherwise,
  unless a block of the card already links that pull request; a card with
  no `Ссылки` line gets one at the end of its body.
- Both writes come after the push and before the question read. An
  `origin/main` that cannot be fetched, or a write that fails, leaves the
  draft and exits 1, naming the step; a rerun of `finish` writes only what
  is still missing.
- `core/feature-workflow.md` says `finish --card` writes the `Pointer` and
  the pull request's link, and keeps the hand step for a pull request
  no `finish --card` opened or found open — the user's, or a consumer's, whose
  sessions run no `finish` until roadmap stage 11. The `README.md` row for
  `finish` says it.

Not in this change: a fix card's `pr:<N>` pointer, which `finish` cannot
write, since it does not know which pull request closes the card; the link
to `proposal.md` once a proposal merges and its move at archive, which stay
prose; a new board property.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-finish`: `finish --card` writes the card's `Pointer` and its pull
  request's `Ссылки` link.
- `task-board`: the pull-request link is written by `finish --card` where it
  opened the pull request or found it open, and by the session otherwise.

## Impact

- New: `bun/work-finish-card.ts`, which derives the change directories and
  makes both writes, and its test `bun/work-finish-card.test.ts`.
- Changed: `bun/work-finish.ts` (one call), `bun/notion-bot.ts` (the
  cursor loop `discussion()` runs, lifted so the block read shares it),
  `bun/work-take.fixture.ts` (its Notion stub answers the block, data
  source and property calls), `bun/work-finish-sequence.test.ts` (its
  pinned Notion calls), `core/feature-workflow.md`, `README.md`.
- Notion: the ask integration writes `Pointer` with the *Update content* it
  holds for `Status`, and appends blocks, which needs *Insert content*, not
  yet granted to it; the user grants it before apply's probe. This widens
  what an integration writes past decision 3 of
  `openspec/changes/archive/2026-10-22-notion-bot-questions/design.md`
  (`Pointer` and card text stay with the user's connector), as the user's
  scope for this card asks.
- Order: `bun/work-finish.ts` is also changed by `finish-review-arrives`
  (#361) and `notion-ask-sets-assign` (#364); apply merges `origin/main` as
  they land.
