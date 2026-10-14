# pick-claim-answer

## Why

Two gaps showed up in the board loop's first live passes on 2026-10-14. Both
sit in the same place, the pick.

**The board does not show that a card is taken.** On the live check of
`board-loop` task 2.4, the pick session printed
`PICK: drop-mutation-exemptions` at 18:05:45. The stage session started a
second later, but it moved the card to `applying` only at 18:10:40, just
before `git switch -c`, because the Process rule in `core/rules.md` asks for
the move before the first `/opsx:` command. Between the pick and the pull
request (#126, 18:21:03) the code did not see the work either. For that whole
window a person, or a session in a sibling clone, read the card as free to
take. Agents in sibling clones were running pre-PR sequences in that same
window, so this is not hypothetical. The pick session could have moved the
card at once, because a `claude -p` session in auto mode wrote `Status` in
that same pass. Today its prompt forbids it with "change nothing anywhere".

**An answered question is read by nobody.** An apply session of the loop
asked a question on the `scan-lift` card (`harness-question`) and opened #124
with the question left open. The user merged #124, then answered on the card
("extend the design and fix it right there"). The next pass printed
`passed over scan-lift: every group is ticked` and ended idle, because
`consider()` turns away a change whose groups are all ticked before any session
reads the board. With no takeable change, no pick session started. The answer
waited until the user asked about it by hand, and #127 (`feat/scan-lift-2`)
carried it.

The two explores overlap. Both edit `pickPrompt` in `bun/board-loop.ts` and
the `board-loop` requirement *A pass takes the first takeable card in the
board's order*. An answer step also moves its card from `applied` back to
`applying`, and the claim has to cover that move. So they are one change, in
two steps.

## What Changes

- **Step 1: the pick claims its card.** The pick session no longer changes
  nothing. Once it has chosen, it moves the card it names from `proposed` to
  `applying`, the status of the stage the pass carries, and fetches the card
  again. It writes nothing else, and it does not touch a card already at
  `applying`. The runner neither reads nor waits on the move, because it has
  no access to the board. A card the pick moved stays moved whatever the pass
  does next, so the next pass takes it first from the `applying` column. The
  stage session still moves the card before its first `/opsx:` command, as the
  Process rule asks. That move is now a no-op and is kept as the fallback.
- **Step 2: an answered question makes its change takeable again.**
  - A change that passes every other test but has all its groups ticked
    becomes an **answer candidate** for step N+1, on `feat/<slug>-<N+1>`.
    It is still subject to the same pull-request check.
  - The pass starts the pick session when it has a takeable change or an
    answer candidate. It is idle without one only when it has neither.
  - The pick session gets the candidates as a second list. It takes one only
    when the card's `Assign` holds the user and the card's page-level
    discussion, resolved or not, has the user's answer after the last
    `harness-question` comment. It reads the `applied` column for these
    cards. An answered card comes before the `applying` column. The claim
    moves it from `applied` to `applying`.
  - The stage session runs under an answer variant of the launch form. It
    writes the answer into `tasks.md` as group N+1, extending `design.md` or
    the delta where the answer widens the design, as #127 did by hand. It
    then carries that group like any step. The verdict is the same
    `goal-check apply <slug> <N+1>`.
  - `Assign` is cleared in the turn the step's pull request opens, never
    earlier. An answer that asks for a change of its own, or that does not
    fit one step, files an `idea` card instead, adds no group, and clears
    `Assign`.
- `core/feature-workflow.md`: the question bullet says when a loop-carried
  answer counts as applied. *Unattended stages* names the answer variant of
  the launch form.

## Non-goals

- **Checking the move in code.** The runner holds no Notion token, and reading
  the board from the script is a non-goal of `board-loop`. The pick session's
  word about the move would be a claim, not a verdict like the goal check's.
  So the move is a signal to the people and sessions reading the board, not a
  lock. Two runners on one board need a real lock, which belongs to the card
  *Run several changes in parallel*.
- **Rolling the card back** when a stage session dies before its first
  commit. Only a session can write the board, and `applying` is exactly the
  signal that makes the next pass continue the card.
- **A separate claim session** after the runner accepts the pick. That costs
  about 40 s and a session on every pass, for a case the next pass already
  heals.
- **Answers that arrive while a step's pull request is open.** Working on an
  open pull request is the later slice *Pull requests and CI on each pass*.
  Such an answer is not lost: once that pull request merges, the change is an
  answer candidate.
- **Explore, propose and archive** claims. The loop carries apply alone. The
  requirement names the stage's status, so each later stage's slice adds its
  own move with the stage.

## Ordering

`after: board-loop`. This change modifies two of its requirements. The live
`openspec/specs/board-loop/` does not exist until the archive of
`board-loop` (#125) syncs it, so this change's `board-loop` delta is copied
from `openspec/changes/board-loop/specs/board-loop/spec.md`. That archive
sync lands first. Before this change archives, its two `MODIFIED`
requirements are diffed against the live spec and re-copied if it moved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: *A pass takes only a takeable change* gains the answer
  candidate. *A pass takes the first takeable card in the board's order*
  gains the claim, the answered card's place in the order, and the `applied`
  column.
- `task-board`: one requirement, *An answer the board loop carries is applied
  when its pull request opens*. It stands beside *An open question waits on
  its card, assigned to the user* and fixes when that requirement's
  *The question on a card is answered* fires for an answer the loop carries.
  It is added beside rather than written in, as `interpreter-prompt` did,
  because a `MODIFIED` copy would carry 60 lines this change does not touch.

## Impact

- `bun/board-loop.ts`: `pickPrompt` in step 1. In step 2, `consider()`, the
  idle condition, the second list, and the answer launch form, about 20
  lines. The file is 239 lines against the cap of 300.
- `bun/board-loop.test.ts` and `bun/board-loop-takeable.test.ts`: the prompt
  case [21] in step 1, the candidate cases in step 2.
- `core/feature-workflow.md`: two sentences in step 2.
- The closest existing artefacts are `board-loop`, whose pick this extends, and
  `card-questions`, whose answer rule this carries out unattended.
- No gate changes, so no consumer tree is measured. Consumers get the runner
  change on their next pin bump.
