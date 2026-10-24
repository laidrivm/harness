# reopened-group-branch

## Why

The board loop names a step's branch from its group number alone and passes
over a change whose step branch a pull request already used, merged or not.
A task added to a group whose pull request already merged therefore leaves
the change untakeable for good: on 2026-10-24 the second host pass printed
"passed over runner-isolation: pull request #239 already used
feat/runner-isolation-4" and ended `idle`, and the open tasks 4.4 and 5.6
were carried only after the user moved them into a new group 6 by hand
(harness#247). Card *Let the loop carry tasks added to a group whose pull
request already merged*.

## What Changes

- A group whose branch only merged pull requests have used, and which holds
  an unticked box again, is a step once more, on a retry branch:
  `<the step's branch>-<k>`, `k` from 2, the first such name no pull request
  has used. A single-group change's retry branch is `feat/<slug>-1-<k>`, so
  it never meets the answer step's `feat/<slug>-2`.
- The retry branch's stage session is told the branch by name, since
  `git-and-prs.md`'s naming alone no longer gives it.
- Unchanged: an open pull request on any of those names still makes the
  change wait; a closed, unmerged one still withdraws the step; an answer
  candidate's branch gets no retry, since its card's answer would be carried
  twice.
- `core/git-and-prs.md` names the retry branch beside the step branch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: *A pass takes only a takeable change* gains the retry
  branch; *A step branch a session left is continued* names it in the
  launch form.
- `change-slicing`: *The reviewable unit is the step, not the proposal*
  allows a second pull request for a group reopened after its merge.

## Impact

- `bun/board-loop.ts`: `consider()` moves to a module of its own (the file
  is at 289 of 300 lines) and gains the retry probe.
- `bun/board-loop-prompt.ts`: one sentence naming a retry branch.
- `bun/board-loop.fixture.ts`: the stub `gh` answers per branch.
- `core/git-and-prs.md`: one sentence.
- Tests in `bun/board-loop-takeable.test.ts` and
  `bun/board-loop-stage.test.ts`.
