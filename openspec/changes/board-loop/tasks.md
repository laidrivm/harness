# board-loop — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md`). The numbers in brackets are that
run's idea numbers, and all 29 are placed below. Every case spawns
`bun/board-loop.ts` in a scratch repository. Its environment has no
`CLAUDECODE`, because `bun test` itself runs inside a session. `XDG_STATE_HOME`
points at a temporary directory, so no case touches the real ledger. Stub
`gh`, `claude` and `goal-check` sit first on `PATH`, so no case reaches GitHub
or starts a session, and each stub records the arguments it was given.

There are two groups, each a harness pull request: `feat/board-loop-1`, then
`feat/board-loop-2`. Both are cut after the changes in proposal.md's
*Ordering* merge.

## 1. One pass for a change the user names

- [ ] 1.0 Add `stage-goal`, `pre-pr-run-record`, `agent-autonomy`,
      `card-questions` and `loop-guard` to `after:` in this change's
      `.openspec.yaml`, once each directory is on `main`. Verify:
      `bun test bun/board-state-hygiene.test.ts` is green.
- [ ] 1.1 Write the precondition tests in `bun/board-loop.test.ts`:
      - `CLAUDECODE` set refuses before any stub is called, and the message
        says to start the runner from your own terminal [1]. An empty value
        refuses too [2];
      - a tracked edit refuses, but an untracked file alone does not [3];
      - an unpushed tip refuses and leaves the branch checked out [4]. A
        pushed step branch is switched off to the default branch [5]. A
        default branch that cannot fast-forward refuses, with no merge and
        no reset [6];
      - no `harness.board` refuses, naming the key, and launches nothing [7].
      All of these fail before 1.4. (Req: board-loop — The runner is the
      user's script and starts from a clean clone)
- [ ] 1.2 Write the takeable tests:
      - no `proposed` change is idle, launches nothing and exits 0 [8]. Every
        group ticked is not takeable [9];
      - a single-group change is step 1 on `feat/<slug>` [10]. Group 1
        ticked of three is step 2 on `feat/<slug>-2` [11];
      - an open `after:` predecessor [12], an open PR on the step's branch
        [13], and a closed PR that used the branch name [14] each pass the
        change over, with the reason printed;
      - a named slug that is not takeable is refused with the reason [15].
        A slug with no directory is refused [16];
      - a failing or missing `gh` leaves nothing takeable [17].
      (Req: board-loop — A pass takes only a takeable change)
- [ ] 1.3 Write the stage and verdict tests:
      - a stub `goal-check` printing `goal met` gives `met`, exit 0, and one
        `loop`/`met`/`apply` record [22];
      - `claude` is called with `-p`, `--permission-mode auto` and
        `--permission-prompts none`, and with neither bypass flag [23]. The
        prompt declares the session unattended and carries the goal for
        `apply`, the slug and the step [24];
      - `claude` exiting 0 with `goal open` gives `open` and exit 1 [25]. A
        stub still running at the limit is killed and gives `timeout` [26].
        The limit is read from the module's one constant, which the test
        lowers. `claude` exiting non-zero still takes the check's verdict
        [27];
      - an unwritable state directory changes neither the line nor the exit
        [28]. Refused, idle and carried passes each leave exactly one `loop`
        record [29].
      (Req: board-loop — A pass carries one step unattended and records the
      check's verdict)
- [ ] 1.4 Export `groups()` from `bun/turn-gate.ts`. Write `bun/board-loop.ts`:
      it refuses, then brings the clone up to date, then builds the takeable
      list, takes the named slug, launches the session with `stage-goal`'s
      launch form, runs the check, records and exits. Verify: 1.1–1.3 are
      green, `bun test` is green, and the file is under the per-file cap in
      `bun/file-size.ts`.
- [ ] 1.5 Add the runner to `README.md`'s *Consuming* section: started by
      the user from a terminal of their own, in a clone used for nothing
      else, and what one pass does. Verify: `grep -n board-loop README.md`
      finds it, and it restates neither the limit nor the takeable rule.
- [ ] 1.6 The pull request's *Check by hand* gives the user the command for
      one live pass in a dedicated clone of the harness, on a change at
      `proposed`. It lists what to look at: the step's pull request, the
      `loop` and `goal` records in the ledger, and whether the card moved
      to `applying`. The runner refuses inside a session, so the live pass is
      the user's. Verify: the pull request body holds that list.

## 2. The pass picks in the board's order

- [ ] 2.1 Write the pick tests in `bun/board-loop.test.ts`:
      - `PICK: none` is idle and starts no stage session [18];
      - a slug that is not takeable is refused and starts nothing [19]. Output
        with no `PICK:` line, or with two, is refused [20];
      - the pick prompt names the board by its `harness.board` value and
        lists the takeable slugs [21].
      Replace 1.2's ideas [15] and [16] with one case: any argument is
      refused, naming the usage. These fail before 2.2. (Req: board-loop — A
      pass takes the first takeable card in the board's order)
- [ ] 2.2 Launch the pick session before the stage session: no goal, the
      same flags, and the same time limit. Accept one exact `PICK:` line that
      names a slug from the takeable list. Delete the argument, which was
      step 1's stub. Verify: 2.1 is green, 1.1–1.3 are still green, and the
      file is under its cap.
- [ ] 2.3 Update the *Consuming* line: the runner takes no argument and
      follows `Board view`. Verify: `grep -n board-loop README.md` reads
      that way.
- [ ] 2.4 The pull request's *Check by hand* gives the user a live pass with
      two takeable changes, the second dragged above the first, and says
      which one the pass must carry. Verify: the pull request body holds it.
