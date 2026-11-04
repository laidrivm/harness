# finish-named-reviewers — tasks

One pull request for groups 1–4; group 5 files the consumers' cards. In each
group the failing cases come first, their failure seen before the code
changes, each cited as `// spec: work-finish/<slug>` where a scenario names it.

## 1. `harness.reviewers` in `bun/config.ts`

- [x] 1.1 Failing cases in `bun/config.test.ts` for `reviewers(root)`: an
      absent `package.json`, a file with no `harness` key, one with no
      `harness.reviewers`, and `[]` each give `[]`; `["CodeRabbit"]` gives
      itself; a file that is not JSON throws naming the file; `"CodeRabbit"`
      and `[1]` throw naming `harness.reviewers`; `["CodeRabbit", "Copilot"]`
      throws naming `Copilot`. Each fails on today's code, which has no
      `reviewers`
- [x] 1.2 Then `bun/config.ts`: `reviewers: string[]` in `Config`; the JSON
      parse and its error lifted out of `read()` into one function `read()`
      and `reviewers()` both call; the header comment names this key as the
      one an absent value does not fail, and why (`design.md`, decision 1).
      Verify `bun test bun/config.test.ts` passes, the existing cases
      unchanged

## 2. The condition and its refusal in `finish`

- [x] 2.1 `bun/work-finish.fixture.ts`: `checkout(true)` commits a
      `package.json` holding `{"harness": {"reviewers": ["CodeRabbit"]}}`
      instead of `.coderabbit.yaml`, and its comments and
      `work-finish-review.fixture.ts`'s say so
- [x] 2.2 Failing cases in `bun/work-finish-review.test.ts`: no
      `harness.reviewers`, and `[]`, in a checkout tracking `.coderabbit.yaml`
      — calls `[READ, "push", READY]`, the out holds
      `finish: harness.reviewers names no reviewer, so none was waited for`,
      last line `finish: ready #7` (`a-project-naming-no-reviewer`); the key
      naming `CodeRabbit` with no `.coderabbit.yaml` reads the check runs
      (`a-repository-without-coderabbits-config`, reworded from today's case).
      In `bun/work-finish.test.ts`, *the refusals before the push*, through
      `refused(run, "reviewers")`: `["CodeRabbit", "Copilot"]` naming `Copilot`
      (`a-reviewer-finish-does-not-know`), `"CodeRabbit"` naming
      `harness.reviewers` (`a-value-that-is-not-a-list`), a `package.json`
      that is not JSON naming the file (`a-package-file-that-is-not-json`)
- [x] 2.3 Then `bun/work-finish.ts`: `reviewers(top)` read among the
      refusals before the push, a throw refused as `reviewers`; `watched`
      from the list; the `tracked()` call, its "tracked files could not be
      listed" branch and that branch's test removed; the no-reviewer line
      pushed where `watched` is false; the header comment's `.coderabbit.yaml`
      sentence rewritten. Verify `bun test bun/work-finish*.test.ts` passes,
      with every case whose full out the new line changes updated to hold it

## 3. The request on a head with no run

- [x] 3.1 Failing cases in `bun/coderabbit-run.test.ts`: `arrived(runs,
      committed)` gives the earlier of `committed` and the earliest CodeRabbit
      start, of whichever parse — `committed` with no run, the start when it
      is the earlier — and `-Infinity` when neither parses
- [x] 3.2 Failing cases in `bun/work-finish-review-ask.test.ts`, the head's
      committer date read with `git show -s --format=%cI HEAD` in the case or
      set through `GIT_COMMITTER_DATE` in the fixture: no run through the reads
      and the read before the post, no request since the committer date —
      calls end `[COMMENTS, runs(cwd), ASK]`, last line
      `finish: ready #7 — no CodeRabbit run on <short> after 18 reads; asked for a review`
      (`a-first-request-for-a-head-with-no-run`); a request at the committer
      date, and one later, post nothing and say a review was already asked
      for (`already-asked-for-a-head-with-no-run`); a request a second before
      it posts one (`an-older-request`); a `@coderabbitai full review` after
      the committer date counts as asked; a request after the committer date
      and before a skipped run's later start counts as asked
      (`a-run-that-starts-after-the-request`); no run through the reads and
      the read before the post giving `skipped` posts, giving `reviewing`
      posts nothing and ends on reviewing. The existing skipped-head cases
      keep passing: the fixture's commit is dated after `SKIPPED`'s start, so
      their cutoff stays the run's start. In
      `bun/work-finish-review.test.ts`, the case "no completed
      run in 12 reads" ends on the request (`still-no-run-when-the-reads-end`)
- [x] 3.3 Then `bun/coderabbit-run.ts` (`arrived` takes `committed`) and
      `bun/work-finish.ts`: the reads after the switch end on `skipped` or no
      run into `request()`, which takes the state, accepts either from the
      read before the post, and prefixes its line by the state
      (`design.md`, decisions 3 and 4). Verify `bun test bun/coderabbit-run.test.ts bun/work-finish*.test.ts`
      passes

## 4. The harness's key and the docs

- [ ] 4.1 `package.json`: `"reviewers": ["CodeRabbit"]` under `"harness"`.
      Verify `finish` on this branch's own pull request ends on CodeRabbit's
      state of the head, not on `finish: ready #<n>` alone
- [x] 4.2 `README.md`: *Consuming* step 3 names `harness.reviewers` as the key
      whose absence means no reviewer; step 7 says a consumer whose
      CodeRabbit posts a check run adds `"reviewers": ["CodeRabbit"]` before its bump crosses
      this change, or `finish` silently stops waiting; the `finish` row of the
      command table takes its condition from the key and names the request on
      a head with no run. `core/git-and-prs.md`: the `finish` paragraph's
      condition, the same consumer line where the pin bump is described, and
      the two lines naming the one `@coderabbitai review` as covering a head
      CodeRabbit skipped or left without a run. `core/review-toolkit.md`: the
      request paragraph covers a head with no run. `core/rules.md`: the
      Safety line naming that comment, the same words. Verify
      `bun test bun/review-docs.test.ts` passes and `grep -n "coderabbit.yaml"
      README.md core/git-and-prs.md` leaves only the `knowledge_base` line

## 5. Consumers

- [x] 5.1 A card on d2ass's board: add `"reviewers": ["CodeRabbit"]` under
      `"harness"` before the daily bump crosses this change. A card on
      mellon's: first the probe of `design.md`'s first risk — read
      CodeRabbit's check runs and commit statuses on the head of mellon's
      next pull request — then add the key only on a check run; on a status
      only, leave the key out and file a harness card for reading statuses
      (`design.md`, decision 5). Verify both cards read back with that text
