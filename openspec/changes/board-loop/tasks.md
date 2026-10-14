# board-loop — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md`). The numbers in brackets are that
run's idea numbers, and all 29 are placed below. Ideas 30 and 31 cover the
install the user settled afterwards (design.md, *The runner installs*).

Every case spawns `bun/board-loop.ts` in a scratch repository. Its
environment has no `CLAUDECODE`, because `bun test` itself runs inside a
session. `XDG_STATE_HOME` points at a temporary directory, so no case touches
the real ledger. Stub `gh`, `claude`, `goal-check` and the install sit first
on `PATH`, so no case reaches GitHub or a registry or starts a session. Each
stub records the arguments it was given.

There are two groups, each a harness pull request: `feat/board-loop-1`, then
`feat/board-loop-2`. Both are cut after the changes in proposal.md's
*Ordering* merge.

## 1. One pass for a change the user names

- [x] 1.0 Add `stage-goal`, `pre-pr-run-record`, `agent-autonomy`,
      `card-questions` and `loop-guard` to `after:` in this change's
      `.openspec.yaml`, once each directory is on `main`. Verify:
      `bun test bun/board-state-hygiene.test.ts` is green.
      Evidence: all five sit under `openspec/changes/archive/2026-10-13-*`;
      `bun bun/board-state.ts` lists the seven and blocks on
      `board-state-per-project` alone; the hygiene test is 9 pass, 0 fail.
- [x] 1.1 Write the precondition tests in `bun/board-loop.test.ts`:
      - `CLAUDECODE` set refuses before any stub is called, and the message
        says to start the runner from your own terminal [1]. An empty value
        refuses too [2];
      - a tracked edit refuses, but an untracked file alone does not [3];
      - an unpushed tip refuses and leaves the branch checked out [4]. A
        pushed step branch is switched off to the default branch [5]. A
        default branch that cannot fast-forward refuses, with no merge and
        no reset [6];
      - a stub `bun` whose `install --frozen-lockfile` exits non-zero refuses
        the pass. It records `refused`, prints the install's output, and
        starts no `claude` [30];
      - the install runs after the fast-forward and before the first `claude`
        call, and runs on every pass, including one whose fast-forward
        brought nothing [31].
      All of these fail before 1.4. (Req: board-loop — The runner is the
      user's script and starts from a clean clone)
      Evidence: 11 cases, with the stubs in `bun/board-loop.fixture.ts`; all
      failed before the runner existed.
- [x] 1.2 Write the takeable tests:
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
      Evidence: `bun/board-loop-takeable.test.ts`, beside the precondition
      file for the 300-line cap; it also refuses a call naming anything but
      one change, with the usage. All failed before the runner existed.
- [x] 1.3 Write the stage and verdict tests:
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
      Evidence: `bun/board-loop-stage.test.ts`. The constant is `pass()`'s
      default limit, which the timeout case lowers through a two-line entry
      module (`lowered()` in the fixture). All failed before the runner
      existed.
- [x] 1.4 Export `groups()` from `bun/turn-gate.ts`. Write `bun/board-loop.ts`:
      it refuses, then brings the clone up to date and installs, then builds
      the takeable list, takes the named slug, launches the session with
      `stage-goal`'s launch form, runs the check, records and exits.
      Verify: 1.1–1.3 are green, `bun test` is green, and the file is under
      the per-file cap in `bun/file-size.ts`.
      Evidence: `stage-goal` had already exported `groups()` for the goal
      check, so `bun/turn-gate.ts` is untouched and needed no split. The
      three runner files are 42 pass, 0 fail; `bun test` is 1423 pass,
      0 fail; `bun/board-loop.ts` is 182 lines against the cap of 300.
- [x] 1.5 Add the runner to `README.md`'s *Consuming* section: started by
      the user from a terminal of their own, in a clone used for nothing
      else, and what one pass does. Verify: `grep -n board-loop README.md`
      finds it, and it restates neither the limit nor the takeable rule.
      Evidence: `grep -n board-loop README.md` finds line 67, which names
      neither. The ledger bullet above it now names the board loop among
      the writers, since a pass records there.
- [x] 1.6 The pull request's *Check by hand* gives the user the command for
      one live pass in a dedicated clone of the harness, on a change at
      `proposed`. It lists what to look at: the step's pull request, the
      `loop` and `goal` records in the ledger, and whether the card moved
      to `applying`. The runner refuses inside a session, so the live pass is
      the user's. Verify: the pull request body holds that list.
      Evidence: #121's body held it. The user ran the pass on 2026-10-14
      with step 1's runner, on `main` at 3901a31, in a fresh clone (the loop
      clone) whose trust dialog they had accepted first.
      `bun bun/board-loop.ts scan-lift` printed
      `passed over board-loop: pull request #121 already used feat/board-loop-1`,
      then `carrying apply scan-lift step 1 on feat/scan-lift`. The session
      committed on `feat/scan-lift` and opened #124, and the `scan-lift` card
      moved to `applying`. The ledger gained `goal`/`met`/`apply` at
      10:27:36Z, at the session's commit 8465f75. At 10:28:00Z it gained
      `goal`/`met`/`apply` again, then `loop`/`met`/`apply`, both with a null
      session. The doubled `goal` record is by design. The first is the
      session's own run of the check, which the launch form makes its goal
      condition. The second is the runner's verdict run (design.md, *The
      verdict is the check's, run by the runner*). A null session marks the
      runner's, and nothing here counts `goal` records, so this needs no
      follow-up.

## 2. The pass picks in the board's order

- [x] 2.1 Write the pick tests in `bun/board-loop.test.ts`:
      - `PICK: none` is idle and starts no stage session [18];
      - a slug that is not takeable is refused and starts nothing [19]. Output
        with no `PICK:` line, or with two, is refused [20];
      - the pick prompt names the board by its `harness.board` value and
        lists the takeable slugs [21];
      - no `harness.board` refuses, naming the key, and launches no session
        [7].
      Replace 1.2's ideas [15] and [16] with one case: any argument is
      refused, naming the usage. These fail before 2.2. (Req: board-loop — A
      pass takes the first takeable card in the board's order)
      Evidence: 13 cases under *the pick*, a pick session past the limit
      among them. The fixture's `claude` stub answers the pick with a `PICK:`
      line and every earlier case runs with no argument, so before 2.2 the
      three runner files were 7 pass, 42 fail, every pick case among them.
- [x] 2.2 Launch the pick session before the stage session: no goal, the
      same flags, and the same time limit. Accept one exact `PICK:` line that
      names a slug from the takeable list. Delete the argument, which was
      step 1's stub. Verify: 2.1 is green, 1.1–1.3 are still green, and the
      file is under its cap.
      Evidence: both sessions share one launcher, `session()`. The board's
      name comes from `board-state.ts`'s `board()`, now exported, so a
      missing or address-shaped `harness.board` refuses with that module's
      own message. The three runner files are 49 pass, 0 fail, and
      `bun/board-loop.ts` is 221 lines against the cap of 300.
- [x] 2.3 Update the *Consuming* line: the runner takes no argument and
      follows `Board view`. Verify: `grep -n board-loop README.md` reads
      that way.
      Evidence: `grep -n board-loop README.md` finds line 67, which names
      the command with no `<change>`, says it takes no argument, and says a
      short session reads `Board view` on the board `harness.board` names.
- [ ] 2.4 The pull request's *Check by hand* gives the user a live pass with
      two takeable changes, the second dragged above the first, and says
      which one the pass must carry. Verify: the pull request body holds it.
