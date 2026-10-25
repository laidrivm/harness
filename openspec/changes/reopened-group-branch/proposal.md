# reopened-group-branch

## Why

The board loop names a step's branch from its group number alone and passes
over a change whose step branch a pull request already used, merged or not.
A task added to a group whose pull request already merged therefore leaves
the change untakeable for good: on 2026-10-24 the second host pass printed
"passed over runner-isolation: pull request #239 already used
feat/runner-isolation-4" and ended `idle`, and the open tasks 4.4 and 5.6
were carried only after the user moved them into a new group 6 by hand
(harness#247), which took a pull request of its own before the one that
carried them. Card *Let the loop carry tasks added to a group whose pull
request already merged*.

## What Changes

- When the step's group holds an unticked box and only merged pull requests
  used its branch, the loop does what #247 did by hand, in one pull request:
  a carry step N+1, on `feat/<slug>-<N+1>`, whose session moves the unticked
  tasks of every such group into a new group N+1 and carries that group.
- The groups carried are the step's and each later group with an unticked
  box whose branch, too, only merged pull requests used, up to the first one
  that is not. A moved task opens with `(was 4.4)`, and its old place keeps a
  line `Task 4.4 moved to 6.1.` with no box.
- A task added to a merged group later, a carried group included, is carried
  the same way into the next new group, since each carry adds a group.
- Unchanged: an open pull request on a branch the loop would read makes the
  change wait; a closed, unmerged one withdraws it; an answer candidate's
  branch, merged, still passes the change over.
- `core/git-and-prs.md` and `core/feature-workflow.md` name the carry step
  beside the step branch and the answer step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: *A pass takes only a takeable change* gains the carry step.
- `change-slicing`: *The reviewable unit is the step, not the proposal*
  ships a merged group's unticked tasks in a new group's pull request.

## Impact

- `bun/board-loop.ts`: `consider()` moves to a module of its own (the file
  is at 289 of 300 lines) and gains the walk over merged groups.
- `bun/board-loop-prompt.ts`: `Step` gains `carried`, and `prompt()`'s first
  line a carry variant.
- `bun/board-loop.fixture.ts`: the stub `gh` answers per branch.
- `core/git-and-prs.md`, `core/feature-workflow.md`: one sentence each.
- Tests in `bun/board-loop-takeable.test.ts`.
