## Context

`consider()` in `bun/board-loop.ts` (lines 65–82 on `main`) takes the first
group with an unticked box as the step, names its branch `feat/<slug>` for a
single group and `feat/<slug>-<step>` otherwise, reads that branch's pull
requests with `readPullRequests()` and passes the change over when any pull
request, open, merged or closed, used it: "a squash-merged branch is never
freed" (`core/git-and-prs.md`). A task added to a merged group, or left
unticked when its pull request merged, therefore strands the change, as
runner-isolation's 4.4 and 5.6 did on 2026-10-24 until the user renumbered
them into group 6 (harness#247).

The stage session is not told its branch unless one was left: its launch
form says "a committed HEAD on the branch of the step", and the session takes
the name from `git-and-prs.md`. `publish()` in `bun/board-loop-push.ts`
pushes nothing unless `HEAD` is on the branch the runner computed.
`goal-check.ts` reads the pull request of whatever branch `HEAD` names, so it
needs no change.

## Goals / Non-Goals

**Goals:** the loop carries an unticked box in a merged group with no hand
renumbering; the branch it uses is one no pull request used; nothing a
withdrawn or waiting step blocks today becomes takeable.

**Non-Goals:**
- A hygiene check that refuses an unticked box in a merged group (the card's
  option b): with the retry branch such a box is carried, so nothing needs
  refusing, and the check would need the GitHub read the tree tests avoid.
- Folding the open boxes of several merged groups into one pull request, as
  the hand fix did: each group retries on its own branch, in order.
- Retrying an answer candidate's branch.

## Decisions

### A retry branch, not a moved group

The step stays the group the author wrote, and its branch gains a suffix:
`<step branch>-<k>`, `k` from 2. The alternative, the session moving the open
boxes into a new group N+1 on `feat/<slug>-<N+1>`, keeps the naming rule
untouched but needs a third launch form, rewrites the author's numbering in
an unattended session, and makes the goal check for N+1 blind to a box the
session failed to move. The suffix touches only the branch name the runner
already computes.

### `feat/<slug>-1-<k>` for a single group

Appending to `feat/<slug>` would give `feat/<slug>-2`, the branch of that
change's answer step, so a single-group change retries on
`feat/<slug>-1-<k>`. A slug ending in a number can still meet another
change's name (`x` step 4 retry 2 and `x-4` step 2 are both `feat/x-4-2`);
the step naming already has that ambiguity (`x` step 4 and single-group
`x-4` are both `feat/x-4`), and the board's slugs hold no such pair.

### Only an all-merged branch is retried

The probe walks the names in order and stops at the first that is not used
by merged pull requests alone. That name's own pull requests then decide as
today: none takes it, an open one waits, a closed unmerged one withdraws.
A closed, unmerged pull request is the user's "not this", so a retry would
undo it. The walk stops after ten names, passing the change over: a `gh` that
lists the same merged pull request for every name would otherwise never end
the pass, and ten retries of one group is a change the user should look at.

### No retry for an answer candidate

An answer candidate's branch merged means its answer was carried. The pick
session takes the card again whenever the last question has a reply after
it, so a retry branch would carry the same answer a second time.

### The prompt names a retry branch

`Step` gains `merged?: number`, the pull request that used the step's
branch, set only for a retry. When it is set and the branch was not left, the
first line adds: "Pull request #<n> merged <step branch>, so this step's
branch is <retry branch>: create it from the default branch's tip with
`git switch -c <retry branch>`." A left retry branch takes the existing
"A session left the branch" sentence, which names it already. The launch form
for every other step is unchanged, so `stage-goal`'s form and its pinned
test keep their text.

### `consider()` moves out of `board-loop.ts`

`board-loop.ts` is at 289 lines, the cap is 300, and the probe adds about
fifteen. `consider()` moves, unchanged, to `bun/board-loop-takeable.ts`
(the name its test file already has), before the probe is added.

## Risks / Trade-offs

- One extra REST read per retried name, only for a change whose step
  branch merged. → None for the common case.
- A merged pull request that left its group's box unticked by mistake is now
  carried again rather than stranded. → The box is open on `main`, so
  carrying it is what the tree asks for; the user sees the retry pull request
  before it merges.

## Collisions

`no-pause-on-question` (applied, not archived) modifies two other
board-loop requirements and `pickPrompt()`, not `consider()` or `prompt()`'s
first line; `approved-column` reads `consider()`'s `proposed` rule and
touches `task-board`. Neither shares a requirement with this change; an
apply that lands after `no-pause-on-question` merges `board-loop.ts` around
its `waiting` outcome only.
