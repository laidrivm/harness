# pre-pr-project-checks — tasks

The test tasks come from the proposal-stage `/zombies` run. The numbers in
brackets are its idea numbers, and all 26 are placed below. Each failing case
is written first, its failure is recorded, and it is cited as `// spec:
<capability>/<slug>` where a scenario covers it. Each case points
`XDG_STATE_HOME` at a directory of its own. `bun/pre-pr.test.ts` stands at 251
lines and `bun/goal-check.test.ts` at 288. Split either by the 300-line cap
before adding to it (`core/rules.md`, *Split a file to the cap that will apply
to it*).

There is one group, shipped as `feat/pre-pr-project-checks`. It applies before
the `work-finish` and `pre-pr-diff-paths` changes (design.md, *Seams*).

## 1. The project checks in the runner, one record per step, and `ran()` by rule

- [ ] 1.1 Add `bumpTest: "true"` to `MANIFEST` in
      `bun/diff-budget.fixture.ts`, so that no runner case starts a `bun test`
      inside `bun test`. Lift the blank check out of `bump.ts verify` into one
      reader in `bun/config.ts`, which returns the command or throws naming
      `harness.bumpTest`, and switch `bump.ts` to it. Verify:
      `bun/bump-verify.test.ts` and `bun/config.test.ts` stay green, the blank
      and whitespace cases included [26], and add a `config.test.ts` case for
      the reader itself.
- [ ] 1.2 Failing runner cases in `bun/pre-pr.test.ts`, or in a split file
      beside it:
      - with nothing past the base, two `pass` records [1]. Within budget with
        `true`: exit 0, records `diff-budget` then `project-checks`, both
        naming the full `HEAD` [3];
      - the checks' output passes through unchanged [4], and they run from the
        top level when the runner starts in a subdirectory [13];
      - over budget with `false`: exit 1 and two `fail` records [5]. Over
        budget, the checks still run [7]. Base unresolvable with `true`: exit
        2, budget `error`, checks `pass` [6];
      - `exit 3` gives exit 2 and `error` [11]. An absent key [2], `""` [9],
        `"   "` [10] and a `package.json` that is not JSON [18] each run no
        command, print a line naming the key or the file, exit 2, and record
        `error`;
      - two runs at one commit leave four records [8]. A check that kills the
        runner (`kill $PPID`) leaves no record [12]. Each record holds the six
        keys and `commit`, with `rule` taken from `RUNNER_STEPS` [14];
      - an untracked, non-ignored file [15] and an unstaged edit [17] each run
        both steps, write no record, and name the file. An ignored file alone
        records [16]. Rewrite the existing *untracked scratch file* case to
        match;
      - a check that leaves an untracked file, and one that edits a tracked
        file, each leave no record and name the file, where a check writing
        an ignored file records. A check that commits (`git commit
        --allow-empty`) leaves no record (local review of the proposal).
      (Req: pre-pr-runner — all three modified requirements)
- [ ] 1.3 Make 1.2 pass in `bun/pre-pr.ts`: export `RUNNER_STEPS` from
      `bun/gate-ledger.ts`, then run both steps, map each exit to 0, 1 or 2,
      exit with the largest, write both records after the second step, and
      take the dirty test from `git status --porcelain`, printing its lines
      after the no-record line. Read `HEAD` and the status again after the
      steps, and write nothing when either changed. Update the file's header comment. Verify:
      `bun test bun/pre-pr.test.ts`, and the whole run passes under dash for
      the `sh -c` cases on CI.
- [ ] 1.4 Failing cases for `ran()`'s rule in a new
      `bun/gate-ledger-rule.test.ts`: the step's own record is found [19]; a
      passing `diff-budget` record alone does not answer `project-checks`
      [20]; a `pre-pr` record under an unknown rule answers neither step [21].
      Failing goal-check cases: budget `pass` with checks `fail` [22], and
      budget `pass` with no checks record [23], each give `goal open` naming
      the missing passing record. A `ranUnder` case: a session ledger with
      both passes is found, and one with the budget alone is not [24]. Then
      give `ran()` its optional `rule`, pass every `RUNNER_STEPS` rule from
      `bun/goal-check.ts` and `ranUnder()`, and none from `bun/turn-gate.ts`
      [25]. If `work-finish` merged the parameter first, add only the callers,
      naming its pull request. (Req: stage-goal — A stage is done when the
      check says so)
- [ ] 1.5 Update the fixtures that fabricate a runner record, so each writes
      both steps' records: `runRecord` in `bun/goal-check.fixture.ts`, `run`
      in `bun/turn-gate-record.test.ts`, `runner` in
      `bun/gate-ledger-turn.test.ts`, and the `printf` stand-in in
      `bun/ci-run.test.ts`, which carries no `rule` today. Verify: those files
      and `bun/board-loop-isolation.test.ts` pass.
- [ ] 1.6 Add `"bumpTest": "bun test"` under `"harness"` in `package.json`.
      In `core/review-toolkit.md`, step 1 becomes the direct `bash
      bun/diff-budget.sh` look first (`bash
      node_modules/harness/bun/diff-budget.sh` where the harness is
      installed) and the runner once after the last commit, with the 600000
      ms timeout or a background run. Drop the docs
      path's "plus `bun test` when it adds or removes a directory under
      `openspec/changes/`", and the closing sentence of the section's
      introduction now says the record proves the budget and the project
      checks. In `README.md`, the `bumpTest` line says the pre-PR runner runs
      the same command. Verify: grep `core/`, `README.md` and `.claude/` for
      `pre-pr.ts`, `first, and again` and `when it adds or removes`, and read
      every hit back.
- [ ] 1.7 Run the whole pre-PR sequence for a code branch, ending with the
      runner on the final commit. Verify: its two `pass` records of `HEAD` are
      in the ledger, and a live probe on this checkout with an untracked file
      prints the no-record line naming it.
