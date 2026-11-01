# finish-writes-card — tasks

One pull request, `feat/finish-writes-card`, after `origin/main` is merged
in with whichever of #361 and #364 have landed. Each failing case first, its
failure recorded, cited as `// spec: work-finish/<slug>`; the cases go in
`bun/work-finish-card.test.ts`, so no existing test file nears the 300-line
cap.

## 1. Probe

- [ ] 1.1 The user grants the ask integration *Insert content*. On a
      throwaway card of the `Harness` board, through the integration under
      API version `2025-09-03`: read the top-level blocks, write `Pointer`,
      append a bulleted item `after` a named block, and read the item back,
      recording each answer's shape in this task's line and the card's
      comment. A 403 or an ignored `after` stops apply and goes to the card
      as a question

## 2. The record

- [ ] 2.1 Lift `discussion()`'s cursor loop in `bun/notion-bot.ts` into
      one helper over a path and a step; `discussion()` calls it, and
      `bun/notion-bot.test.ts` and `bun/notion-bot-rest.test.ts` pass
      unchanged
- [ ] 2.2 Failing cases over the added directories, in temporary
      repositories: one change added; one archived (removed from
      `openspec/changes/`, added under `archive/`); none; two; a change
      archived on `main` after the fork with `main` merged into the branch;
      a file added to a change the base already holds. Then write them in
      `bun/work-finish-card.ts`
- [ ] 2.3 Failing cases over `recorded()` against the Notion stub of
      `bun/work-take.fixture.ts`, extended to answer the block read, the
      append and the `Pointer` write and log their bodies: an empty
      `Pointer` written and read back; one equal to the directory left
      without a write; `openspec/changes/foo/` re-pointed to its archive;
      `pr:350`, another slug and `harness: openspec/changes/foo/` left, each
      with its line; the link appended `after` the last item under
      `Ссылки`, after the paragraph when no item follows, and as paragraph
      and item at the end when there is none; no append when a block already
      links the pull request; the kind for each branch shape; a 403 on the
      append throwing the step after the `Pointer` write. Then write
      `recorded()`

## 3. Finish

- [ ] 3.1 Failing cases in `bun/work-finish-card.test.ts` through
      `finish()` of `bun/work-finish.fixture.ts`: a first finish on a
      branch adding a change writes both before the comments read; a second
      writes neither; a refused write leaves the draft, exits 1 and makes no
      `gh pr ready`; no `--card` makes no Notion call. Then add the call to
      `bun/work-finish.ts`; `bun/work-finish.test.ts` and
      `bun/work-finish-sequence.test.ts` still pass
- [ ] 3.2 `core/feature-workflow.md`: the `Ссылки` and `Pointer` paragraphs
      say `finish --card` writes the pull request's link and the change's
      `Pointer`, and keep the hand step for a pull request it did not open
      or update; `README.md`'s `finish` row says it writes both, and needs
      the ask integration's *Update content* and *Insert content*
- [ ] 3.3 `bun bun/pre-pr.ts origin/main` green; the PR opens through
      `bun bun/work.ts finish --card 40a39875c31b81f0b5f2c66f8e89de9e`, and
      the card's `Pointer` and `Ссылки` it writes are read back on the
      board
