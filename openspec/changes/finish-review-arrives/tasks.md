# finish-review-arrives — tasks

Two groups, one pull request each: `feat/finish-review-arrives-1`, then
`-2`. Each failing case first, its failure recorded, cited as `// spec:
work-finish/<slug>`. `bun/work-finish.ts` stands at 104 lines,
`bun/work-finish.fixture.ts` at 94, `bun/work-finish-sequence.test.ts` at
150; the new cases go in `bun/work-finish-review.test.ts` so neither test
file nears the 300-line cap.

## 1. Wait for CodeRabbit's run and report its state

- [ ] 1.1 Failing cases in `bun/coderabbit-run.test.ts` over the pure
      state of a check-run list: an empty list and one holding only another
      app's runs give no run; a `CodeRabbit` run of another app slug is
      ignored; skipped plus in progress gives `reviewing`; succeeded plus in
      progress gives `reviewing`; skipped plus neutral `Review rate limited`
      gives `rate limited`; rate limited plus succeeded gives `reviewed` in
      either list order; a neutral run with another title gives that
      conclusion and title; skipped alone, and a success titled `Review
      skipped`, give `skipped`. Then write the
      state in `bun/coderabbit-run.ts`
- [ ] 1.2 Failing cases in `bun/coderabbit-run.test.ts` over the read, with
      a `gh` stub on `PATH`: it calls `api
      repos/o/demo/commits/<sha>/check-runs?filter=all&per_page=100
      --paginate --jq .check_runs[]`, and a run on a second page counts; an
      exit that is not 0 and an output that is not JSON give unread with a
      reason; `HARNESS_CODERABBIT_POLL_MS` unset, `0`, `-5` and `x` give
      5000 and `7` gives 7. Then write the read, and lift `limit()`'s
      positive-whole-number parse in `bun/pull-requests.ts` into one helper
      that `limit()` and the interval both call; `bun/pull-requests.test.ts`
      still passes
- [ ] 1.3 Extend `bun/work-finish.fixture.ts`: the `gh` stub answers a
      `check-runs` read from a queue of answers, one per call, the last
      repeated; logs each call as today; the case sets
      `HARNESS_CODERABBIT_POLL_MS=1`, and tracks `.coderabbit.yaml` only when
      it asks to, so the existing cases keep no config. Verify
      `bun/work-finish.test.ts` and `bun/work-finish-sequence.test.ts` still
      pass unchanged
- [ ] 1.4 Failing cases in `bun/work-finish-review.test.ts`: no tracked
      `.coderabbit.yaml`, and a gitignored untracked one, make no check-run
      call and end on `finish: ready #7`; run from a subdirectory of a
      checkout tracking it at the top, `finish` reads the check runs; the
      `gh` call order is the PR read, the push, the draft's opening and
      re-read when `finish` opens one, the check-run reads until a
      completed run appears, the ready, then the check-run reads; an
      in-progress run alone does not end the wait; no completed run in 12
      reads says so and still marks ready; with `origin` already at `HEAD`
      and the draft opened in this call, the reads go on until the skip
      appears; a failed read before the ready switch counts as none and the
      reads go on; a
      question waiting makes no read after the question read and leaves the
      draft; `reviewing` after ready ends on `finish: ready #7 — CodeRabbit
      reviewing <short>`; a failed read after the switch, then `reviewing`,
      ends on reviewing; `reviewed`, `rate limited` and another conclusion
      end on their lines from design.md; 18 reads of `skipped`, and 17 then
      a failure, end on `finish: ready #7 — CodeRabbit skipped <short>`;
      every read failing ends unread; every one exits 0. Then add the wait and the
      reads to `finish()`
- [ ] 1.5 Prose: `README.md`'s `finish` row says it waits for CodeRabbit's
      run and names its state of the head; `core/review-toolkit.md`'s
      passage on a head whose state reads skipped or rate-limited names
      `finish`'s last line as where it is first seen; `core/git-and-prs.md`'s
      pull request bullet says `finish` waits for CodeRabbit's run before
      the ready switch rather than marking ready *right after the push*,
      and its *Never wait on a result someone else produces* bullet names
      `finish`'s two bounded waits as the exception. Grep `core/`,
      `README.md` and `openspec/specs/` for `finish: ready`, `right after
      the push` and that passage's wording, and fix each site the step
      makes false

## 2. Ask once for the review of a skipped head

- [ ] 2.1 Extend `bun/work-finish.fixture.ts`: the stub answers an
      `issues/7/comments` read with the case's comments, one JSON object a
      line as `--jq` prints them, or with an exit the case sets, and logs a
      `pr comment` call with an exit the case sets
- [ ] 2.2 Failing cases in `bun/work-finish-review.test.ts`: `skipped` and no
      request posts exactly one `pr comment 7 -R o/demo --body @coderabbitai
      review` and says it asked; a request created at the head's earliest
      run's `started_at`, and one padded with whitespace, count as asked and
      post nothing; a request a second earlier, and `@coderabbitai review
      please`, do not count; with the head's runs listed out of time order
      the earliest `started_at` is used; a read right before the post that
      gives `rate limited`, or fails, posts nothing and says which; a
      failed comment read posts
      nothing and names why; a post `gh` refuses with exit 1 is made once
      and named; `rate limited`, `reviewing` and unread read no comments;
      every one exits 0. Then add the request to `finish()`
- [ ] 2.3 Prose: `core/review-toolkit.md` says `finish` asks once for a
      skipped head and that a rate-limited one is reported, never retried;
      `README.md`'s `finish` row names the request; `core/git-and-prs.md`'s
      *… nor any other comment as the user* and *Send, reply, comment or
      review under the user's name …* bullets, and `core/rules.md`'s Safety
      rule naming what `bun/work.ts finish` is granted, name that one
      `@coderabbitai review` as the exception (answer 4 b, 2026-10-31).
      Grep the same places as 1.5, and `comment as the user` and `under the
      user's name`, for wording the step makes false
- [ ] 2.4 Live probe from the tree on this group's own pull request: open it
      with `bun bun/work.ts finish --card <card> --title <text> --body-file
      <path>`, and record in its body
      `finish`'s last line and, where it read `skipped`, the request it
      posted and whether CodeRabbit answered it
