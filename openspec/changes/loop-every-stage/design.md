# loop-every-stage — design

## Context

A pass today (`bun/board-loop.ts`, `pass()`): fetch and install, list the
tree's candidates with `consider()` (`proposed`, an unticked group, or every
group ticked for an answer), run a pick session over `Board view`
(`pickPrompt()` in `bun/board-loop-prompt.ts`), carry one apply step in a
stage session (`prompt()`), post its `QUESTION:` from the integration
(`post()` in `bun/notion-bot.ts`), push and open the pull request
(`publish()` in `bun/board-loop-push.ts`), and judge by `goal-check.ts`.
`goal-check.ts` already knows `propose` and `archive`, and `--before-push`
works for both. The pick session moves the card itself through the Notion
MCP, under the user's name.

`bun/board-loop.ts` stands at 289 lines against the 300-line cap, and
`bun/board-loop-stage.test.ts` at 300: every group below that adds to them
splits first.

## Goals / Non-Goals

**Goals:** each status's next stage, one per pass, with the user's three
decisions on the card (approval comment, WIP limit of 10, rest at a spent
limit).

**Non-Goals:** who writes to Notion and under which name, and clearing
`Assign` when a pull request opens — card *Route every Notion write the loop
makes through the bot integration* (bot-route). Matching an answer to its own
question — card *Match a card's answer to the question it answers*
(answermatch). A daily cap. Moving a card from `idea` to `approved`, the
user's alone (`approved-column`).

## Decisions

### Where the explore note goes: the card's body

The runner appends the session's `NOTE:` block to the card's body as plain
paragraphs (`PATCH /v1/blocks/<card>/children`), each under Notion's 2000
characters, the note at most 6000. The card is what the user reads and what
the propose session reads next. Rejected: a file on `spec/<slug>`, which
needs a slug before the proposal and a pushed branch with nothing to review;
folding explore into propose, as `stage-goal`'s *An exploration* allows for an
unattended run, which skips `explored` and the user's own step on the card.
This is the first open question on the card.

### Explore asks nothing

Its open questions go into the note, and the propose session puts each it
cannot settle into the approval comment. One comment per change before its
proposal's pull request, as the user decided, and no card waits twice.

### The pick names the stage

`PICK: <stage> <name>`. A slug alone cannot name a card with no change, and an
all-ticked change is both an answer and an archive candidate; the stage tells
the runner which it carries. The runner still accepts only its own lists.

### Cards come from a board read through the integration

The board's own order needs `Board view`, which only the pick session reads.
The runner needs the cards' ids, statuses and pointers to list card
candidates, correct derived statuses and count the WIP: one search for the
data source titled as `harness.board` names (refused unless exactly one), then
its query, paged, in a new module `bun/notion-board.ts`. The integration must
be connected to the board, which it already is for its comments; the search
reaches only boards it is connected to.

### The derived-status correction is the runner's

A merged archive leaves its card at `archiving` and a merged proposal at
`proposing` unless a session reconciles them; under a WIP limit the stale
ones would block `approved` for good. The runner moves a card behind
`bun/board-state.ts`'s floor up to it and prints the move (`task-board`, *A
board is reconciled when it is read*). It writes only `Status`, and through
the integration, so it waits on bot-route's REST write.

### The approval comment rides `QUESTION:`

The propose session names it like any question, so the triage, the
already-waiting check and `Assign` stay as they are. `carded()` requires the
`Pointer` to name the change, so the runner writes the `Pointer` first. The
branch is pushed with no pull request so the user can read the proposal;
`publish()` gains that mode, keyed on a `CHANGE:` line with a question and no
`PR-TITLE:`. The answer pass continues the branch, as an apply answer does,
and its pull request opens through the existing path.

### Archive is a tree candidate

Every group ticked and every step's branch merged (`readPullRequests()` per
branch). The branch is `chore/archive-<slug>`, as every archive on `origin`
is named. The verdict is `goal-check.ts archive <slug>`.

### WIP counts every status past `approved`

`exploring` to `archiving`, `proposed` and `applied` included, as the user
wrote it; `done` and `idea` excluded. The figure, 10, is fixed in the spec and
a named constant beside `LIMIT`.

### A spent limit is an outcome, not a failure

The runner reads the limit from a session's output (task 1.1 measures the
form and exit status of `claude -p` at a spent limit; nothing here guesses
it), ends `limited` with exit 0, and prints the reset time. `pass.sh` turns
that line into `<clone>.resume` and skips ticks until then. Rejected: a
one-off Windmill schedule, which needs the engine's API from the pass and a
second source of truth; the stop file, which calls the user. A time the
output does not name rests one hour.

### Status moves stay where they are until bot-route lands

The claim is the pick session's, as today, now to `exploring`, `proposing`,
`applying` or `archiving`. The runner's writes this change adds — the note,
`explored`, the `Pointer`, the corrections — go through the integration.
Groups 3 to 5 start once bot-route has merged and use its write; if it moves
the claim to the runner, these groups follow it.

## Risks / Trade-offs

- [Collision with `no-pause-on-question`] → both modify *A pass takes the
  first takeable card in the board's order*; this delta is copied from that
  change's version. Archive `no-pause-on-question` first, then re-copy this
  delta against the live spec before applying group 2.
- [`runner-isolation` touches `bun/board-loop.ts`] → no shared requirement;
  rebase each group on the default branch as it stands.
- [Two questions on one card] → the approval comment is a second question on
  a card a chat agent may also ask on; answermatch fixes it, and until then
  groups 2 and 5 carry the risk that card describes.
- [The limit's text changes] → the probe of task 1.1 is pinned in a test that
  reads the form recorded here; a new form reads as an ordinary `open`.
- [A propose session that dies after its commit] → its unpushed `spec/<slug>`
  is no step's branch, so the next pass refuses until the user looks; the
  same as an apply session that times out today.
- [Board read cost] → one search and one query per pass, paged at 100 cards.

## Open questions

- The usage-limit message and exit status (task 1.1).
