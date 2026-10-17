# step-branch-retry — design

## Context

The motivation is in proposal.md, *Why*. The requirements are in
`specs/board-loop/spec.md` and `specs/task-board/spec.md`.

Here is a pass as `bun/board-loop.ts` runs it, with the places this change
touches marked `*`:

```
CLAUDECODE, trust, tracked edit          unchanged
*unpushed HEAD: refuse now  -->  step 2: refuse now only when detached;
                                 note a named branch and go on
fetch, switch main, ff-only, install     unchanged
consider() each change -> steps          unchanged
*step 2: noted branch is no step's branch -> switch back to it, refuse
*step 2: any refusal after the switch      -> switch back to it first,
                                              unless a process group outlived its session
pick session -> PICK: <slug>             unchanged
*step 1: the step's branch exists?  -> continuation clause in line 1
stage session, goal check                unchanged
```

These were measured on 2026-10-17, in a scratch repository with a bare
remote, git 2.47.0 on macOS, without `claude`:

- `git switch -c feat/x-1` with a local `feat/x-1` present fails with
  `fatal: a branch named 'feat/x-1' already exists`, exit 128.
  `--no-track -c` fails the same way.
- With `feat/x-1` only on `origin`, `git switch -c feat/x-1` succeeds. It
  cuts a new branch from the current `HEAD`, and its later push is refused as
  a non-fast-forward.
- A plain `git switch feat/x-1` continues the branch in both cases. When the
  branch is on `origin` alone, git creates it tracking `origin/feat/x-1`, its
  own remote, never `origin/main`.
- An unpushed commit on `HEAD` gives an empty
  `git for-each-ref --contains HEAD refs/remotes`, which is the runner's
  refusal. Once the branch is pushed, the same call lists
  `refs/remotes/origin/feat/x-1`.

The user's live pass on 2026-10-17 ran in the harness checkout. Before it,
`git branch --list 'feat/*'` listed `feat/drop-mutation-exemptions-1`,
`feat/extract-harness-1`, `feat/extract-harness-4` and
`feat/harness-auto-bump-1` to `-4`. The runner switched from the merged
`-1` branch to `main` itself, and the stage session created
`feat/drop-mutation-exemptions-2` with no conflict. Branches of earlier
steps do no harm. Only a branch whose name the step reuses does.

`bun/goal-check.ts` accepts a pull request on whatever branch `HEAD` is on.
`consider()` looks for a pull request only on the step's own branch.

## Goals / Non-Goals

**Goals:**

- A pass retries a step that a dead session left, from that session's
  commits, without the user in the common case.
- The runner keeps every commit a session made, and still deletes or resets
  nothing.

**Non-Goals:**

- Recovering uncommitted work, or telling a sound commit from a broken one.
  The stage session judges what it continues, and the pre-PR sequence and the
  review judge the result.
- Anything about a step whose branch a closed pull request used.

## Decisions

### Continue the branch the session left

This is a choice that is genuinely the user's. The recommended option is
taken, and it is listed under *Check by hand*.

The step's branch name is fixed: `git-and-prs.md` names it, and `consider()`
reads pull requests on it alone. So a retry either reuses that name or makes
its pull request invisible to the loop.

- *Alternative: a fresh suffixed branch*, such as `feat/<slug>-<N>-retry`.
  The goal check would pass on it. But the next pass would find no pull
  request on `feat/<slug>-<N>`, take the step again and start a second
  session while the first pull request waits. Each retry would also leave one
  more branch behind.
- *Alternative: start again from `origin/main` under the same name.* This
  needs the old branch deleted, locally or on `origin`, or a force push. No
  agent does either without the user's word.
- *Alternative: refuse, naming the branch, and wait for the user.* This is
  safe, but the step never retries alone, which is what the card asks for.
  The commits a timed-out session made are also the most useful thing it
  left: a step that ran out of time once would run out again from scratch.

### The runner tells the session, rather than the session finding out

The runner already knows the branch's name, and one `git rev-parse --verify`
per ref settles whether it exists. It checks `refs/heads/<branch>`, then
`refs/remotes/origin/<branch>` as the pass's fetch left it. The answer goes
into the first line of the launch form, which already varies for an answer
step. Lines two and three, which `stage-goal` fixes, stay as they are.

- *Alternative: leave it to the session.* Its `git switch -c` would fail,
  and what it did next is unmeasured. A session that improvised a new name
  would bring back the duplicate-session problem above. A branch on `origin`
  alone would not fail at all, and the session would carry on from a second
  branch.

The clause tells the session to `git switch` to the branch, never
`git switch -c`, and to carry on from what its commits hold. It does not say
to merge `origin/main` in. `git merge` is not in the tracked
`permissions.allow`, so under `--permission-prompts none` the classifier
would decide it. A pull request from an older base is for the pre-PR sequence
and the review to judge.

### Accept an unpushed tip on a step branch, and only there

This is also the user's choice, since it narrows a refusal their
`board-loop` design made on purpose. The recommended option is taken, and it
is listed under *Check by hand*.

A stage session commits once per task and pushes after the pre-PR sequence.
So a session killed at the hour usually leaves exactly this: a step branch
with commits no remote holds. If the refusal stays, step 1 helps only the
rarer cases, and the user has to clear the clone by hand. Pushing that
half-done branch by hand runs the pre-push suite over it.

`board-loop`'s design refused an unpushed tip because it "means the previous
session left work, and that is the user's to look at". It cited
`git-and-prs.md`, *never move the working tree off a branch whose work is
unpushed*. That rule is there so that work is not left where nobody returns
to it. Here the work stays on its named branch, and the step it belongs to
is takeable, so the pass that carries that step is sent back to it. A tip on
any other branch is still the user's. Before refusing, the runner switches
back to it, so the next pass sees it again instead of forgetting it.

- *Alternative: accept any named branch.* Smaller, but a branch the loop
  will never carry would then sit unpushed, with nothing to show it.
- *Alternative: keep the refusal, and let step 1 serve only the pushed and
  empty cases.* This keeps the user's original line. It is the fallback if
  the user turns this decision down: step 2 is then dropped, and step 1
  stands alone.

The check moves later in the pass, after the takeable list is computed. A
detached `HEAD` is still refused where it is today, before the fetch,
because no branch name keeps its commits. Any refusal after the switch, such
as a failed install, switches back to the noted branch first. Without that, a
pass refused before the list exists would leave the clone on `main`, and the
next pass would no longer see the unpushed tip. The one exception is a
refusal because a session's process group outlived it: a process still
running may write to the tree, so the runner switches nothing under it and
says the clone is left as the session left it (CodeRabbit on #147).

### Narrow `task-board`'s scenario here

#138's Major is right that *The session ends before its pull request*
promised a retry that a session with commits did not get. After this change
the next pass continues the branch. It still waits for the user where the
clone holds a tracked edit or an unpushed tip that is no step's. The scenario
says that by citing `board-loop` rather than listing the cases again.

## Risks / Trade-offs

- [The branch the dead session left holds a wrong or half-made commit] →
  The stage session reads the branch against `tasks.md` before it goes on.
  The pre-PR sequence runs over the whole branch, as it does for any step.
- [The left branch is many merges behind `main`] → Its pull request shows
  any conflict. The session settles it as `git-and-prs.md` says for a branch
  behind its remote, never by force.
- [A branch from an older plan reuses the step's name after `tasks.md` was
  renumbered] → The clause tells the session that a session left the branch.
  It does not say the commits are right, so the session judges them like any
  others.
- [The pick takes another change while an unpushed step branch waits] → The
  branch keeps its commits, and the pass that carries its step continues it.
  It is not `HEAD` on the next pass, so no pass refuses over it.
- [A dead session left a rebase or a conflict in progress] → A conflict
  shows in `git status` as a tracked difference. A rebase stopped on a clean
  tree leaves `HEAD` detached, and the runner's own `git switch` then fails
  with `fatal: cannot switch branch while rebasing`, measured in the same
  scratch repository. Either way the pass is refused, and nothing is merged
  or reset.

## Migration Plan

This applies once `pick-claim-answer`'s archive (#138) has merged, in two
steps:

1. `feat/step-branch-retry-1`: the continuation clause.
2. `feat/step-branch-retry-2`: the unpushed step-branch tip.

Nothing is registered. Rolling back means reverting the clause in `prompt()`
and moving the unpushed check back to the start of the pass.
