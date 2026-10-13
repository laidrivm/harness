# stage-goal — tasks

The test tasks come from the proposal-stage `/zombies` run and are written
before the code they cover (`core/testing.md`). The numbers in brackets are
that run's idea numbers, and all 53 are placed below. Each test points
`XDG_STATE_HOME` at a temporary directory, so no case reads or writes the real
ledger, and puts a stub `gh` first on `PATH`, so no case reaches GitHub.

There are two groups, each a harness pull request: `feat/stage-goal-1` and
then `-2`. Both are cut after `gate-decision-ledger` and `pre-pr-run-record`
merge (proposal.md, *Impact*, *Ordering*).

## 1. The stage check, its record, and the launch form

- [x] 1.1 Write the check's tests in `bun/goal-check.test.ts`. Each one spawns
      `bun/goal-check.ts` in a scratch repository with a change, a ledger and
      a stub `gh`:
      - no ledger file [1] and an empty one [2] each read as no record, and
        name the missing record for `HEAD`;
      - `apply` with no `tasks.md` [3], or with a group that has no box [4],
        reports `goal open` and names it;
      - `propose` [5], `apply` on a single-group change [6] and `archive` [7]
        report `goal met` and exit 0;
      - the `HEAD` record is found among other projects' and gates' records
        [8]. Earlier commits' records [9] and a prefix of `HEAD` [10] do not
        count. A torn line does not hide the record after it [11];
      - step 2 reads the second group in order [12]. Two runs append `open`,
        then `met` [13];
      - step 3 of three reads the last group [14]. Step 4 of three reports
        the missing group [15]. A step of `0` or a non-numeric step exits 2
        [16];
      - a `fail` record [17] or an `error` record [18] for `HEAD` is no pass.
        A box inside a fenced block is no task [19]. `archive` with the
        directory still present is `open` [20];
      - `reported()` from `bun/turn-gate.ts` rejects both lines [21]. The
        last line opens `goal met` or `goal open` and lists every missing
        condition [22]. The exits are 0, 1 and 2 [23]. The record holds the
        six ledger keys and `commit`, with gate `goal` and the stage as rule
        [24];
      - `gh` absent [25] or failing [26] gives `open` and names the
        unreadable state. A pull request behind `HEAD` [27], or one at `HEAD`
        that is closed or merged [28], is `open`;
      - an unstaged [29] or staged [30] edit to a tracked file is `open`. An
        untracked file alone is not [31];
      - an unknown stage [32], a missing change [33] and a run outside a
        repository [34] exit 2 and record nothing. An unwritable state
        directory changes neither the line nor the exit [35];
      - a `goal` `met` record at `HEAD` for another change's step leaves
        `apply` for an incomplete step `open`, because the check reads no
        `goal` record (PR review).
      All of these fail before 1.2. (Req: stage-goal — A stage is done when
      the check says so; Each verdict is recorded)
- [x] 1.2 Write `bun/goal-check.ts`. It parses `<stage> <change> [<step>]`.
      It reads the tree at `HEAD` through git, and the group test through
      `turn-gate.ts`'s `complete()`. It reads the `pre-pr` record through the
      ledger read that `pre-pr-run-record` added, and the pull request
      through `gh pr list --head <branch> --state open --json headRefOid`. It
      prints the verdict as its last line, naming each missing condition, and
      records through `gate-decision-ledger`'s writer with `commit`.
      Verify: 1.1 is green, and the file is under the 300-line cap
      (`bun/file-size.ts`).
- [x] 1.3 Run the branch's check from d2ass's and from mellon's directory, as
      `bun <harness clone>/bun/goal-check.ts propose <an active change>`
      against d2ass and `archive <an archived change>` against mellon [36].
      Both are read-only: the trees stay untouched. Verify: each prints a
      verdict line naming what that tree lacks. `jq` over the ledger shows one
      `goal` record per run, each naming that tree's `HEAD`, and `git status`
      is unchanged in both.
- [x] 1.4 In `core/feature-workflow.md`, add a section *Unattended stages*.
      It covers when a session sets a goal (an unattended stage, one goal per
      stage, never explore or a conversation) and the launch form with the
      condition's exact text, for the harness (`bun/goal-check.ts`) and for a
      consumer (`node_modules/harness/bun/goal-check.ts`). It says the
      launcher's own rerun of the check is the outcome, not `claude -p`'s exit
      status and not a ledger record. It cites
      `stage-goal` for the criteria rather than restating them. Verify: the
      check command inside the documented condition runs as written from the
      harness and from d2ass, as 1.3 ran it. (Req: stage-goal — An
      unattended stage runs under one goal on the check)

## 2. The round ceiling

- [x] 2.1 Write the ceiling's tests in `bun/turn-gate-ceiling.test.ts`, using
      `bun/turn-gate.fixture.ts`:
      - a stop with `stop_hook_active` false counts nothing [37]. With no
        mark, nothing is counted and the stop is decided as today [38];
      - the 19th continued stop prints no JSON and is decided as without a
        ceiling [39]. The 20th prints the `continue: false` JSON with a
        `goal-ceiling:` reason and exits 0 [40];
      - a mark after 18 resets the count [41]. Two sessions count apart [42].
        A stop past the ceiling with no new mark ends again [43];
      - at a stop where the turn gate would refuse, the ceiling wins, with
        exit 0 and nothing on stderr [44]. The string `"true"` is not
        counted [45];
      - the reason names the count, a resume and `/goal clear` [46]. The
        record is `goal` / `rounds` / `ceiling` [47]. The JSON comes through
        the bootstrap's `TURN_STOP` text with exit 0 [48];
      - a non-JSON event [49] and an unsafe session id [50] count nothing. An
        unwritable ledger still ends [51]. An unwritable counter decides as
        without a ceiling [52].
      All of these fail before 2.2. (Req: stage-goal — A goal run ends at a
      round ceiling; The ceiling's end is told apart from any other)
- [ ] 2.2 Add the round counter to `bun/goal-check.ts` (the constant and two
      exported functions) and call it from `turn-gate.ts`. Call it in `mark`
      to reset, and in `stop` before `decide()`. At the ceiling, record,
      print the JSON and exit 0. Update `turn-gate.ts`'s header comment to
      name the ceiling. Its "without reading `stop_hook_active`" becomes a
      line saying that the refusal bound still reads no event field and the
      ceiling does, which `commit-gates`' "SHALL NOT depend on a
      loop-protection field" allows, since that sentence is about the
      refusal. Verify: `bun test` is green.
- [ ] 2.3 Measure `bun/turn-gate.ts` and `bun/goal-check.ts` against the
      300-line cap. Verify: `bun/file-size.ts` passes on the branch.
- [ ] 2.4 In `README.md` *Consuming*, the turn-gate line names the ceiling. In
      `core/feature-workflow.md`'s *Unattended stages*, add what happens at
      the ceiling and how to resume. Grep for "refuses a turn that completes
      a task group" and "Unattended stages" for sites that restate either,
      and reconcile each. Verify: no stale site remains outside
      `openspec/changes/`.
- [ ] 2.5 Live check, in a scratch clone of the harness with this branch [53].
      Run a `claude -p` goal that cannot be met but calls a tool each round,
      and confirm that it ends at round 20 and that the ledger holds one
      `ceiling` record. Then run `claude -p --resume <id> "go on"` and
      confirm the goal is restored and the count starts again. Record what
      an interactive idle check-in does to the count if one is seen. Verify:
      the observations are written into the pull request body.
