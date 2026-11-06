# status-discarded — tasks

One group, one pull request, on `feat/status-discarded`: the change is about
250 lines of diff, under the 800-line budget. Each failing case is written
first, its failure recorded, and cited as `// spec: work-status/<slug>` or
`// spec: task-board/<slug>`. The bracketed numbers are the proposal-stage
`/zombies` ideas. The cases run over `bun/work-status.fixture.ts`, whose
stand-in already logs and answers `POST /v1/comments` and fails it through
`fail`.

## 1. `work.ts status` moves a card into and out of `discarded`

- [ ] 1.1 Write failing argument cases in `bun/work-status.test.ts`'s *the
      arguments*, each printing the usage, exiting 2 and calling nothing:
      `--to discarded` with no `--why` [1]; `--to idea` with no `--why` [2];
      `--why "  "` [3]; `--why=` [4]; `--why a --why b` [5]; `--to exploring
      --why x` [9]; `--to approved --why x` [14]. Verify: each fails against
      today's code
- [ ] 1.2 Rework *the user's statuses*: `--to approved` still refuses before
      any call; `--to idea --why x` on a card at `exploring` refuses
      `user-only` after the page read alone, posting no comment [10]; a
      `discarded` card refuses `--to exploring` and `--to done` naming
      `idea`, posting no comment [11]. Verify: the new expectations fail
      against today's code
- [ ] 1.3 Write failing cases for the moves: a card at `approved` with five
      cards in the range and `--to discarded --why "duplicate of x"` makes no
      query [15], posts one `POST /v1/comments` before the `PATCH`, whose
      body opens with the code run `harness-status` and carries `approved →
      discarded: duplicate of x` on the card's `page_id` [7], prints
      `status: <card> approved → discarded` and exits 0 [8]; a card at
      `applying` discarded runs no git [16]; a `discarded` card `--to idea
      --why …` writes `idea`, exit 0 [17]; a `discarded` card `--to
      discarded --why …` posts and writes again [18]; a `--why` of 2500
      characters reaches the comment whole, across its runs [6]; a card
      whose `Assign` holds the user is released after a discard [19].
      Verify: each fails against today's code
- [ ] 1.4 Write failing cases for the failures: the comment's post answering
      500 makes no `PATCH`, prints a line opening `status: <card> not
      written —`, exits 1 and records no refusal [12]; the post answering
      200 and the `PATCH` 500 leaves the post made, exits 1 [13]; the
      refused `--to idea` records one `user-only` refusal [20]. Verify: each
      fails against today's code
- [ ] 1.5 In `bun/work-status.ts`, drop `discarded` and `idea` from the
      before-any-call refusal (design, *Out of discarded goes to idea
      alone*), refuse `--to idea` after the page read unless the card reads
      `discarded`, refuse any other target for a `discarded` card naming
      `idea`, skip the evidence and the WIP count for both moves, and post
      the note with `comment(found.call, card, text, "harness-status")` from
      `bun/notion-bot.ts` before the write (design, *The reason is a bot
      comment, posted before the write*); `status` takes the reason as a
      third argument. In `bun/work.ts`, read `--why` in the dispatch, name
      it in `USAGE` and the header comment; update `work-status.ts`'s header
      comment and the comments on `discarded` in `bun/board-state.ts`.
      Verify: `bun test bun/work-status*.test.ts bun/board-state*.test.ts`
      passes, and `bun bun/check.ts` passes
- [ ] 1.6 Reword `core/feature-workflow.md`'s paragraph on the user's
      statuses: a session discards a card or returns one to `idea` with
      `bun bun/work.ts status … --why <reason>`, giving the reason; `approved`
      stays the user's alone; a reconciliation still leaves a `discarded`
      card as it is. Update the `README.md` row for `status` to name the two
      moves and `--why`. Grep the tree outside `openspec/changes/archive/`
      for `only the user moves` and `discarded` and reconcile each statement
      with the deltas. Verify: `bun test` passes, and `openspec validate
      --strict status-discarded` passes
