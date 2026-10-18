# step-branch-retry

## Why

A board-loop stage session can die after `git switch -c feat/<slug>-<N>` and
before its pull request opens. It may time out at the hour, or crash. The
next pass still finds the step takeable, because no pull request has used the
branch and `tasks.md` on `origin/main` has not moved. It then fails in one of
two ways:

- **The session left commits it never pushed.** A stage session commits once
  per task and pushes only after the pre-PR sequence, so this is what a
  timeout usually leaves. `bun/board-loop.ts` refuses the clone with
  "unpushed work" until the user clears it. A push by hand runs the pre-push
  suite over half-done work.
- **The tip is pushed, or the branch holds no commit yet.** The runner goes
  on, and the new session's `git switch -c` meets the branch. Measured on a
  scratch repository, see design.md *Context*. A local branch makes it fail
  with exit 128. A branch only on `origin` lets it pass, cutting a second
  branch from `main` whose push is refused as a non-fast-forward.

CodeRabbit raised this on #128. On #138 a Major says `task-board`'s scenario
*The session ends before its pull request* promises a retry that neither
case gets. The user's live pass on 2026-10-17 bounds the problem. Branches
left by earlier steps (`feat/<slug>-1` beside a new `-2`) did not interfere.
Only a branch for the same step does.

## What Changes

- **Step 1: a step branch a session left is continued.** For the step it
  carries, the runner looks after its fetch for the step's branch, locally or
  on `origin`. When it finds one, it prints that it continues the branch. The
  first line of the stage session's launch form then names the branch as one
  a session left, and tells the session to `git switch` to it rather than
  create it, and to carry on from what its commits hold. The other two lines
  of the launch form do not change. The runner never deletes, resets,
  recreates or pushes the branch.
- **Step 2: an unpushed tip on a step branch no longer stops the pass.**
  Today the runner refuses whenever `HEAD` holds a commit that no
  remote-tracking branch contains. After this step it refuses only when that
  branch is not the step branch of a change the pass computes, as takeable or
  as an answer candidate. Before refusing, it switches the clone back to the
  branch, so the next pass refuses again rather than forgetting it. A
  detached `HEAD` with such a commit is still refused before the fetch, and
  so is a tracked edit. A step branch that is accepted keeps its commits.
  Step 1 then points the session that carries that step back at them.
- **`task-board`'s *The session ends before its pull request* is narrowed.**
  The next pass takes the answer again, and continues the branch the session
  left. Where the clone holds work the runner refuses, it waits for the user
  first.
- `core/feature-workflow.md`'s *Unattended stages* names the continuation as
  a change to the launch form's first line. The board-loop part of `README.md`
  says what the runner does with a branch a session left.

## Non-goals

- **Deleting or resetting a branch.** No agent deletes a branch without the
  user's word (`core/rules.md`, Safety). The runner is the user's script, but
  it runs with nobody watching, so it removes nothing.
- **A fresh suffixed branch** such as `feat/<slug>-<N>-retry`. `consider()`
  looks for a pull request on the step's own branch only. A pull request on
  another name would go unseen, and the next pass would start the step a
  second time.
- **A tracked edit the session left.** That work was never committed, and
  the runner does not carry it. The refusal stays.
- **Merging `origin/main` into the branch it continues.** `git merge` is not
  in the tracked `permissions.allow`, and a pull request from a stale base is
  for the pre-PR sequence and the review to judge.
- **A step whose branch a closed pull request used.** It stays untakeable, as
  `board-loop` already fixes.

## Ordering

`after: pick-claim-answer`. This change modifies `task-board`'s
*An answer the board loop carries is applied when its pull request opens*,
which that change adds. It reaches the live spec when that change's archive
(#138) merges. Until then this delta is copied from
`openspec/changes/pick-claim-answer/specs/task-board/spec.md`, which #138
syncs unchanged. Before this change archives, each `MODIFIED` requirement is
diffed against the live spec and re-copied if the live text moved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: one requirement is added, *A step branch a session left is
  continued*. *The runner is the user's script and starts from a clean clone*
  narrows its unpushed-work refusal, and its *Unpushed work* scenario changes
  with it.
- `task-board`: *An answer the board loop carries is applied when its pull
  request opens* narrows its scenario *The session ends before its pull
  request*.

## Impact

- `bun/board-loop.ts`: one lookup and a clause in `prompt()` in step 1, about
  10 lines. The unpushed check moves after the takeable list in step 2, about
  12 lines. The file is 260 lines against the cap of 300.
- `bun/board-loop-stage.test.ts` and `bun/board-loop.test.ts`: the
  continuation cases in step 1, and the unpushed-tip cases in step 2.
- `core/feature-workflow.md` and `README.md`: a sentence each.
- The closest existing artefacts are `board-loop`, whose clone check and
  launch form this extends, and `pick-claim-answer`, whose `design.md` *Risks*
  left this case unmeasured.
- No gate changes, so no consumer tree is measured. Consumers get the runner
  change on their next pin bump.
