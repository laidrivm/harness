# gh-timeout — tasks

The tests come from the proposal-stage `/zombies` run, and each is written
before the code it covers (`core/testing.md`). The numbers in brackets are
that run's idea numbers. All eight are placed below or dispositioned in 1.4.

Every case spawns its script through the existing fixture, with stubs alone
on its `PATH`. Only a case that needs a limit other than the one that ships
sets `HARNESS_GH_TIMEOUT_MS`, and each such case passes `bun test` an
explicit timeout above its worst case (design.md D3, D4).

One group, one harness pull request on `feat/gh-timeout`.

## 1. A pull request read that ends at its limit

- [x] 1.1 Give the stubs a hang, as design.md D4 sets out:
      - `bun/goal-check.fixture.ts`: `Gh` gains `hang?: boolean`. With it
        set, the stub's first `fails` calls run `exec /bin/sleep 30` instead
        of `exit 1`, after the call has been logged. `stubborn?: boolean`
        puts `trap '' TERM` before that `exec`, as `bun/board-loop.fixture.ts`
        does for its stage session, since an ignored signal stays ignored
        across `exec`;
      - `bun/board-loop.fixture.ts`: `Stubs` gains `ghSleep?: number`, and
        the stub `gh` runs `exec /bin/sleep <n>` after logging when it is set.
      Verify: `bun test bun/goal-check-io.test.ts bun/board-loop-takeable.test.ts`
      stays green, since no case sets either field yet.
- [x] 1.2 Write the goal check's cases in `bun/goal-check-io.test.ts`, each
      with `HARNESS_GH_TIMEOUT_MS` at `500` unless named:
      - `fails: 3, hang: true` reads `goal open`, says
        `the pull request's state could not be read`, and made three
        calls [3] (*A read that never answers*);
      - `fails: 1, hang: true` is met after two calls [4]
        (*A read that hangs and then answers*);
      - `fails: 3, hang: true, stubborn: true`, a stub that ignores
        `SIGTERM`, still reads `goal open` after three calls [5]
        (*A read that never answers*);
      - with the limit at `2000`, a stub that sleeps 0.2 s and then answers
        with an open pull request at `HEAD` is met after one call [1]
        (*A read that hangs and then answers*).
      Cite each scenario with a `// spec:` comment.
      Verify: before 1.4, cases 3, 4 and 5 fail on their own explicit timeout
      rather than on an assertion, because the check waits out the 30 s
      sleep. Case 1 passes before 1.4 and after it.
- [x] 1.3 Write the runner's cases in `bun/board-loop-takeable.test.ts`, with
      `HARNESS_GH_TIMEOUT_MS` at `500` passed through `run()`'s `opts.env`:
      - `ghSleep: 30` passes `demo` over with
        `the pull request query failed`, and the pass ends
        `board-loop: idle` [7] (*`gh` hangs on the query*);
      - two candidates under `ghSleep: 30` are both passed over, and the
        pass ends idle [8] (*`gh` hangs on the query*);
      - with no hang, the logged call reads
        `gh pr list --head feat/demo --state all --limit 1000 --json number,state` [6].
      Verify: before 1.4, cases 7 and 8 fail on their explicit timeout, and
      case 6 fails on the missing `--limit 1000`.
- [x] 1.4 Implement design.md D1 to D3:
      - `bun/pull-requests.ts` exports one read, taking a branch and the
        `--json` fields. It spawns the query with `timeout` and
        `killSignal: "SIGKILL"`, reads the limit from `HARNESS_GH_TIMEOUT_MS`
        when it matches `/^[1-9]\d*$/` and uses 30000 otherwise, and returns
        the parsed array or `undefined`. It carries over the comments that
        `pullRequests()` and `consider()` give on why each failure reads as
        one, and the comment on why `--limit 1000` is passed;
      - `pullRequests()` in `bun/goal-check.ts` calls the read once per try,
        and keeps its three tries and its pause;
      - `consider()` in `bun/board-loop.ts` calls the read once, keeping its
        own comment that a failed query is never "no pull request".
      Idea [2] is dispositioned without a case: telling a fallback of 30000
      apart from no limit means waiting 30 s for real, and the whole-number
      pattern is the same one `GOAL_CHECK_RETRY_MS` uses, which refuses an
      empty value. A `0`, which the pattern also refuses, is the value that
      would turn the limit off.
      Verify: break the mechanism and watch the cases fail. With the
      `timeout` option removed, cases 3, 4, 5, 7 and 8 fail. With
      `killSignal` removed, case 5 alone fails. With the variable's value
      divided by 1000, case 1 fails. Restore all three, and
      `bun test` is green.
- [x] 1.5 Grep `gh pr list`, `spawnSync` and `could not be read` across
      `bun/`, `core/`, `openspec/specs/` and the README for a site that still
      describes either read as unbounded, or the runner's query as taking
      `gh`'s default of 30 records. Correct what the step makes false.
      Verify: the grep names no such site, and `bun/goal-check.ts` and
      `bun/board-loop.ts` each spawn `gh` only through `bun/pull-requests.ts`.
- [ ] 1.6 `bun bun/pre-pr.ts` reports the step's diff within the budget. The
      pull request body names *A pull request read that does not answer is a
      failed try* and *A pull request query that does not answer fails* as
      the requirements it closes.
