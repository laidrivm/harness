# step-branch-retry — tasks

Test tasks come from the proposal-stage `/zombies` run, and are written before
the code they cover (`core/testing.md`). The numbers in brackets are that
run's idea numbers. Idea [10], a remote branch that `fetch.prune` removed, is
not placed: the lookup reads the refs the pass's fetch left, and what that
fetch prunes is git's behaviour, not the runner's.

Every case runs `bun/board-loop.ts` in a scratch repository through
`bun/board-loop.fixture.ts`. Stub `gh`, `claude` and `goal-check` sit first on
`PATH`. What a stage session does with the clause cannot be stubbed, so the
pull requests' *Check by hand* test it live.

There are two groups, each a harness pull request: `feat/step-branch-retry-1`,
then `feat/step-branch-retry-2`. Both are cut once `pick-claim-answer`'s
archive (#138) has merged.

## 1. A step branch a session left is continued

- [x] 1.1 Write the continuation tests in `bun/board-loop-stage.test.ts`:
      - with no `feat/demo` in the clone or on `origin`, the prompt's first
        line carries no continuation clause [1];
      - a local `feat/demo` that no pull request used puts the clause in the
        first line, naming `feat/demo` and `git switch`, never
        `git switch -c` [2], and leaves the branch's tip as it was [9];
      - a `feat/demo` on `origin` alone gets the same clause [3];
      - for a three-group change at step 2, a local `feat/demo-2` beside a
        `feat/demo-1` is named, and `feat/demo-1` is not [4];
      - for a single-group change, a local `feat/demo-1` gives no clause [5];
      - for the three-group change at step 2, a local `feat/demo-20` gives
        no clause [6];
      - with the clause, lines two and three equal the launch form's [7], and
        the runner prints that it continues the branch before `carrying …`
        [8];
      - an answer candidate whose `feat/demo-2` exists gets the clause in the
        answer form's first line [11].
      [2]–[8] and [11] fail before 1.2, and [1] and [9] pass before and after.
      (Req: board-loop — A step branch a session left is continued, every
      scenario)
- [x] 1.2 In `bun/board-loop.ts`, after the pick names the step, look up its
      branch as `refs/heads/<branch>`, then `refs/remotes/origin/<branch>`.
      When either exists, print that the pass continues it, and give
      `prompt()` a clause for the first line. The clause names the branch as
      one a session left and says to `git switch` to it rather than create
      it, and to carry on from what its commits hold. Verify: 1.1 is green,
      the runner's three test files are green, and the file is under its cap
      in `bun/file-size.ts`.
- [x] 1.3 Name the clause in `core/feature-workflow.md`'s *Unattended stages*
      as one more change to the launch form's first line, beside the answer
      variant. Add one sentence to the board-loop part of `README.md`'s
      *Consuming*. Search the four places `feature-workflow.md` names for
      "`git switch -c` fails", the claim `pick-claim-answer`'s design left
      unmeasured. Reconcile each live site, or name the archived design as
      history. Verify: the grep in the pull request body.
- [x] 1.4 The pull request's *Check by hand* gives the user one live pass. Its
      steps: stop a stage session after its first commit and push, and before
      its pull request. Start the next pass. The stage session must switch to
      the branch, not cut a new one, and the pull request must carry the
      first session's commit. Verify: the pull request body holds it.

## 2. An unpushed step branch does not stop the pass

- [ ] 2.1 Write the unpushed-tip tests in `bun/board-loop.test.ts`, under
      *the clone*:
      - move the existing case *an unpushed tip refuses and leaves the branch
        checked out* onto `feat/other`, since `feat/demo` becomes a step
        branch. `feat/other` is no step's branch, and the pass is
        refused, naming `feat/other`, launches no `claude`, and leaves the
        clone on `feat/other` at its tip [15], [16];
      - an unpushed tip on `feat/demo`, `demo`'s step branch, with a clean
        tree reaches `met`, and `feat/demo` keeps its tip [13];
      - in that pass, the stage prompt carries the continuation clause [19];
      - with `demo` at step 1, an unpushed tip on `feat/demo-2` is refused
        [14];
      - with no takeable change, an unpushed tip on `feat/other` is refused,
        not `idle` [12];
      - with `gh` failing, an unpushed tip on `feat/demo` is refused, and the
        clone is back on `feat/demo` [18];
      - with `bun install` failing, an unpushed tip on `feat/demo` is
        refused, and the clone is back on `feat/demo` at its tip
        (§*Refused after the switch*);
      - with a local `main` that cannot fast-forward to `origin/main`, an
        unpushed tip on `feat/demo` is refused, and the clone is back on
        `feat/demo` at its tip, never left on `main`. The existing
        fast-forward cases start from a pushed `feat/demo`, so none of them
        catches this (§*Refused after the switch*);
      - a detached `HEAD` with an unpushed commit is refused before any fetch
        [17].
      [13], [19], [14] and [18] fail before 2.2, or pass for the wrong reason
      (the old refusal). Each asserts the reason it expects.
      (Req: board-loop — An unpushed step branch does not stop the pass,
      §*A dead session's unpushed commits*; The runner is the user's script
      and starts from a clean clone, §*Unpushed work*, §*Unpushed work on a
      detached HEAD*)
- [ ] 2.2 In `bun/board-loop.ts`, refuse an unpushed tip at the start only
      when `HEAD` names no branch. Note a named branch and go on. Once the
      takeable list and the answer candidates are computed, and before the
      idle check, refuse when the noted branch is no step's branch, after
      switching the clone back to it. Any other refusal after the switch
      also switches back to the noted branch first, so that a pass refused
      before the list exists forgets nothing. Otherwise print that the
      branch is left for its step. Update the module comment, which says the runner
      never discards work. Verify: 2.1 is green, the runner's three test
      files are green, and the file is under its cap in `bun/file-size.ts`.
- [ ] 2.3 Search the four places `feature-workflow.md` names for the claim
      this replaces: an unpushed tip always refuses, and "the next pass can
      take the answer again". Reconcile `README.md`'s *Consuming* line. Name
      `board-loop`'s archived design as history. Verify: the grep in the pull
      request body.
- [ ] 2.4 The pull request's *Check by hand* gives the user one live pass.
      Its steps: on a board where that card's change is the only takeable
      one, stop a stage session after a commit and before its push. Start the
      next pass. It must go on from `main`, and the stage session must
      continue the unpushed branch, its commit included. Verify: the pull
      request body holds it.
