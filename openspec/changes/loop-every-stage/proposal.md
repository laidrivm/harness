# loop-every-stage

## Why

The board loop carries one stage. `consider()` in `bun/board-loop.ts` takes
only a `proposed` change with an unticked group, so a card at `approved`,
`exploring`, `explored` or `proposing` does not exist for it, and a change
with every group merged waits for an interactive session to archive it. The
second live pass on the host (2026-10-24) ended `board-loop: idle — no change
is takeable` beside more than a hundred cards. The user asked for the loop to
take every status (card *Let the board loop carry every status's next stage*,
2026-10-24), and settled three things on it: one approval comment before any
pull request, at most ten cards in work past `approved`, and a pass that
spends the subscription resting until its reset instead of pausing.

## What Changes

- The pass takes the first card that is not blocked, right to left across the
  board (`archiving` to `approved`), an answered card first, and carries its
  one next stage:
  - `approved` → **explore**: a session with no goal reads the card and the
    code and ends on a `NOTE:` block; the runner appends the note to the
    card's body and moves the card to `explored`. Explore asks nothing: its
    open questions go into the note, for the proposal's approval comment.
  - `explored` → **propose**: `/opsx:propose` on `spec/<slug>`, ending on
    the approval comment — questions, decisions, assumptions — as a
    `QUESTION:`. The runner sets the card's `Pointer`, pushes the branch with
    no pull request so the user can read it, and posts the comment. Once the
    user has settled it, an answer pass writes the answers in and the runner
    opens the proposal's pull request.
  - `proposed`/`applying` → **apply**: as today.
  - every group merged → **verify + archive**: on `chore/archive-<slug>`, a
    clean `/opsx:verify`, then `/opsx:archive`; the card moves to
    `archiving`.
- The pick names the stage: `PICK: <stage> <slug or card id>`, accepted only
  from the runner's own lists. Cards with no change yet come from a read of
  the board through the Notion integration.
- Before it counts, the runner moves a card behind its derived status
  (`proposed`, `done`) up to it, and prints each correction.
- **WIP limit**: while ten cards stand in `exploring` … `archiving`, no card
  is taken from `approved`.
- **A spent subscription**: a session that ends on the usage limit ends the
  pass `limited`, exit 0, naming the reset time; `pass.sh` starts no pass in
  that clone until then, and pauses nothing.

Not in this change: which ideas reach `approved` (the user's, by
`approved-column`); a daily cap; moving cards by the bot's name rather than
the user's, and clearing `Assign` when a pull request opens (both card
*Route every Notion write the loop makes through the bot integration*, which
groups 3 to 5 wait on); matching an answer to its own question (card *Match a
card's answer to the question it answers*).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: what is takeable and in what order, the three new stages, the
  derived-status correction, the WIP limit and the `limited` outcome.
- `orchestrator`: a clone resting until the subscription's reset.

## Impact

- `bun/board-loop.ts` (289 lines, split first), `bun/board-loop-prompt.ts`,
  `bun/board-loop-push.ts`, `bun/board-loop-session.ts`, `bun/notion-bot.ts`
  and a module for the board read; their tests.
- `orchestrator/pass.sh` and its tests.
- `README.md`, `core/feature-workflow.md`, `orchestrator/README.md`.
- Follows `approved-column`, whose status this change takes work from.
