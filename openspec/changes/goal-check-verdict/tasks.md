# goal-check-verdict — tasks

Test tasks come from the proposal-stage `/zombies` run and are written before
the code they cover (`core/testing.md`). The numbers in brackets are that
run's idea numbers. All 15 are placed below or dispositioned in 1.4.

Every case spawns `bun/goal-check.ts` through `bun/goal-check.fixture.ts`,
with a stub `gh` alone on its `PATH` and `XDG_STATE_HOME` a directory of its
own, as now. No case sleeps: the fixture sets `GOAL_CHECK_RETRY_MS` to `0`.

One group, one harness pull request on `feat/goal-check-verdict`.

## 1. One verdict per commit

- [x] 1.1 Change the stub in `bun/goal-check.fixture.ts` first, so the cases
      below can be written against it:
      - the query string at `bin()` becomes
        `pr list --head feature --state all --json headRefOid,state`, the one
        argument list the stub answers;
      - `Gh` gains an optional `fails` count. The stub appends a line to a
        call log in its own directory on every call, exits 1 while the log has
        `fails` lines or fewer, and answers after that. The fixture's `run()`
        returns the number of calls;
      - `prAt()` answers `[{ headRefOid: HEAD, state: "OPEN" }]` [3];
      - `run()` puts `GOAL_CHECK_RETRY_MS: "0"` in the environment it builds,
        before `opts.env`, so a case can still override it.
      Verify: the existing met cases now fail, because the check still sends
      the old query and reads the state as unreadable.
- [x] 1.2 Write the state cases in `bun/goal-check-io.test.ts`, citing the
      scenario each pins:
      - split the case titled *no open pull request, a closed or merged one at
        HEAD, is open* [28]. An empty answer reads
        `no open or merged pull request for feature` [1]
        (*The pull request is behind*);
      - a merged pull request at `HEAD` is met, exit 0 [2]. The same commit
        read open, then merged, is met both times and leaves two `met`
        records [15] (*The pull request has merged*);
      - a closed pull request at `HEAD` beside an open one at `HEAD` is
        met [4] (*A proposal ready for review*);
      - a merged pull request at an earlier commit, with none at `HEAD`, is
        open and names `the pull request's head is <earlier>, not <HEAD>` [5].
        A closed one at `HEAD` beside an open one at an earlier commit names
        the open one's head [6] (*The pull request is behind*);
      - the branch's only pull request closed unmerged at `HEAD` is open,
        naming `no open or merged pull request for feature` [13]. A record at
        `HEAD` with no `state` is open [12]
        (*The pull request was closed unmerged*).
      Verify: each met case fails before 1.4, and each open case asserts
      the wording it names rather than only the exit status, since before 1.4
      every case reads the state as unreadable.
- [x] 1.3 Write the retry cases in the same file:
      - `fails: 1` [7] and `fails: 2` [8] are met
        (*A read that fails and then succeeds*);
      - `fails: 3` is open, says `the pull request's state could not be read`,
        and made three calls, not four [9]. An answer of `{}` reads the same
        after three tries [14] (*The pull request cannot be read*);
      - a first try that answers makes one call [10]
        (*A proposal ready for review*).
      Verify: all five fail before 1.4, 9 and 14 on the count of calls. The
      three cases that exist for an absent, failing or garbled `gh` keep
      passing, and none takes a measurable time.
- [x] 1.4 Implement in `bun/goal-check.ts` `pullRequest()`, as design.md
      D1-D3 set out:
      - the `--state all --json headRefOid,state` query;
      - `met` only for a record whose `headRefOid` is `HEAD` and whose `state`
        is `OPEN` or `MERGED`;
      - the two new open lines;
      - up to three tries, with `Bun.sleepSync` between them and never after
        the last;
      - the pause read from `GOAL_CHECK_RETRY_MS` when it is a whole number
        (`/^\d+$/`), and 2000 otherwise.
      Update the function's doc comment and the "unknown is never met"
      comment to name the retry.
      Idea [11] is dispositioned without a case: an empty value is the one
      `Number()` would read as 0, and the whole-number pattern refuses it.
      A case would have to sleep four seconds for real to tell 2000 from 0.
      Verify: `bun test bun/goal-check-io.test.ts bun/goal-check.test.ts`
      is green. `bun test` is green, `bun/board-loop*.test.ts` included,
      since they stub the check and need no edit.
- [ ] 1.5 Reread the four places `core/feature-workflow.md` names for the
      claim this change replaces, that only an *open* pull request at `HEAD`
      satisfies a stage. Grep `open pull request` and
      `state could not be read` across `core/`, `openspec/specs/`, the
      README and this change's own artefacts. Correct what the step makes
      false. Verify: the grep names no site still saying a merged pull request
      leaves the stage `open`.
- [ ] 1.6 `bun bun/pre-pr.ts` reports the step's diff within the budget, and
      the pull request body names *A stage is done when the check says so* as
      the requirement it closes.
