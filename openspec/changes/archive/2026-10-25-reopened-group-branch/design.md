## Context

`consider()` in `bun/board-loop.ts` (lines 65–82 on `main`) takes the first
group with an unticked box as the step, names its branch `feat/<slug>` for a
single group and `feat/<slug>-<step>` otherwise, reads that branch's pull
requests with `readPullRequests()` and passes the change over when any pull
request, open, merged or closed, used it: "a squash-merged branch is never
freed" (`core/git-and-prs.md`). A task added to a merged group, or left
unticked when its pull request merged, therefore strands the change, as
runner-isolation's 4.4 and 5.6 did on 2026-10-24 until the user moved them
into group 6 by hand (harness#247): one pull request for the move, then the
loop's own for group 6.

The answer step already has a session write a new group N+1 into `tasks.md`
and carry it on `feat/<slug>-<N+1>`, under the launch form with only its
first line changed (`core/feature-workflow.md`). The runner itself writes
nothing in the tree: on the host the clone is `agent`'s, reached only through
the launcher.

## Goals / Non-Goals

**Goals:** the loop carries the unticked boxes of merged groups with no hand
renumbering and in one pull request, however many groups hold them; nothing a
withdrawn or waiting step blocks today becomes takeable.

**Non-Goals:**
- A hygiene check that refuses an unticked box in a merged group (the card's
  option b): with the carry step such a box is carried, so nothing needs
  refusing, and the check would need the GitHub read the tree tests avoid.
- A retry branch for a group (`<step branch>-<k>`): the carry step leaves it
  nothing to name (item 3 below).
- Carrying an answer candidate again.

## Decisions

### A moved group, not a retry branch

The user chose the move (item 2): fewer pull requests and passes than one
retry pull request per group. Every unticked task of the carried groups moves
into a new last group N+1, N the groups `tasks.md` holds, shipped on
`feat/<slug>-<N+1>`. That name is never one a merged carry used: a carry that
merges adds its group, so the next carry is N+2. It cannot meet an answer
step either: an answer candidate has every box ticked, a carry an unticked
one, and whichever merges first adds group N+1.

### Which groups are carried

The runner walks the groups holding an unticked box, in order, reading each
one's branch as `git-and-prs.md` names it. While only merged pull requests
used that branch, the group is carried and the walk goes on. The first group
that is not ends it: an open pull request on its branch makes the change
wait, a closed, unmerged one withdraws it, as today, and no carry is tried.
A branch both a merged and a closed, unmerged pull request used withdraws the
change too, the reason naming the closed one: the closed one is still the
user's "not this" (decided on the apply, harness#282). A
branch no pull request used ends it too; with no group carried, that group is
the step, as today, and with some carried, the carry goes first and that
group is the step after it. With every group holding an unticked box carried,
the carry is the step. The carry branch's own pull requests then decide as
for any step branch: none takes it, an open one waits, a used one passes the
change over.

The walk reads one branch per group with an unticked box, plus the carry
branch, so a `gh` that lists the same merged pull request for every name still
ends it.

### The session moves the tasks, as #247 did

The carry is a step like the answer step: its session edits `tasks.md`, not
the runner, which writes nothing in the tree. The first line of the launch
form names the carried groups and the new one: move every unticked task of
those groups, its text unchanged, into a new last group `## <N+1>. Carried
over from group <g>[, <g>…]`, numbered from `<N+1>.1`, each moved task opening
with `(was <g>.<k>)`, each old place keeping a line `Task <g>.<k> moved to
<N+1>.<j>.` with no box, then `/opsx:apply` that group. The other lines, the
check for `apply`, the change and N+1 included, are the launch form's,
unchanged. A box the session leaves behind is no stranding: the next pass
finds that group merged and unticked again, and carries it into N+2.

`Step` gains `carried?: number[]`, the carried groups, set only for a carry;
`answer` stays false.

### The next new tasks in a merged group

A task added later to a merged group, the carried group N+1 once its pull
request merged included, is carried the same way into the next new group.
Nothing tracks earlier carries: `tasks.md` and the pull requests of each
group's branch decide every pass.

### `consider()` moves out of `board-loop.ts`

`board-loop.ts` is at 289 lines, the cap is 300, and the walk adds about
fifteen. `consider()` moves, unchanged, to `bun/board-loop-takeable.ts`
(the name its test file already has), before the walk is added.

### Settled with the user (2026-10-25, on the card)

1. A single-group change's retry branch would have been `feat/<slug>-1-<k>`.
   Item 2 leaves no retry branch: a single-group change's carry is group 2
   on `feat/<slug>-2`, which the first decision keeps clear of the answer
   step.
2. The loop moves the open tasks of several merged groups into one new group
   N+1, in one pull request, as *A moved group, not a retry branch* and
   *Which groups are carried* decide.
3. The retry suffix `-<k>` covered a group's second pull request. The carry
   branch is always a fresh name, so the suffix covers no case, the
   single-group one included, and is dropped.
4. A closed, unmerged pull request on a branch the walk reads withdraws the
   change, with no carry: it is the user's "not this".
5. An answer candidate's branch, merged, passes the change over; a carry
   needs an unticked box, which an answer candidate has none of.
6. The ten-name cap is dropped: the walk reads a bounded set of branches.
7. Only a carry's launch form changes, in its first line; every other form
   keeps its text, so `stage-goal`'s pinned form does.
8. `consider()` moves to `bun/board-loop-takeable.ts`.
9. No hygiene check, as the non-goals say.
10. One task group, one pull request on `feat/reopened-group-branch`.
11. `no-pause-on-question` and `approved-column` share no requirement with
    this change (*Collisions*).

## Risks / Trade-offs

- One extra REST read per merged group with an unticked box, only for such a
  change. → None for the common case.
- An unattended session renumbers the author's tasks. → The pointers both
  ways keep each task findable by its old number, the move is the first
  thing the pull request's diff shows, and the user merges it.
- A merged pull request that left its group's box unticked by mistake is now
  carried rather than stranded. → The box is open on `main`, so carrying it
  is what the tree asks for.
- A pull request closed unmerged on `feat/<slug>-<N+1>`, an answer step's or
  a carry's, withdraws the other kind on that name too. → As today for the
  answer step; the reason names the pull request, and the user reopens it or
  edits `tasks.md`.
- A single-group change that took a carry or an answer has two groups, and
  group 1's branch is then named `feat/<slug>-1`, which nobody used: a box
  added to group 1 later ships on that branch as a plain step, not a carry.
  → It still ships, in one pull request.

## Collisions

`no-pause-on-question` (applied, not archived) modifies two other
board-loop requirements and `pickPrompt()`, not `consider()` or `prompt()`'s
first line; `approved-column` reads `consider()`'s `proposed` rule and
touches `task-board`. Neither shares a requirement with this change; an
apply that lands after `no-pause-on-question` merges `board-loop.ts` around
its `waiting` outcome only.
