# finish-writes-card — tasks

One pull request, `feat/finish-writes-card`, after `origin/main` is merged
in with whichever of #361 and #364 have landed. Each failing case first, its
failure recorded, cited as `// spec: work-finish/<slug>`; the cases go in
`bun/work-finish-card.test.ts`, so no existing test file nears the 300-line
cap.

## 1. Probe

- [x] 1.1 The user grants the ask integration *Insert content*. On a
      throwaway card of the `Harness` board, through the integration under
      API version `2025-09-03`: read the top-level blocks, write `Pointer`,
      append a bulleted item `after` a named block, and read the item back,
      recording each answer's shape in this task's line and the card's
      comment. A 403 or an ignored `after` stops apply and goes to the card
      as a question. Ran instead as #383's own `finish --card` on the card,
      2026-11-01: the command guard refused a scratch probe script, which
      no other shape replaced. The block read gave the `Ссылки` paragraph
      and the `#370` item by `id` and `type`; the append, `after` the `#370` item,
      answered 200 and the item `[#383](…/pull/383) — apply` reads back
      directly after it, so *Insert content* is granted and `after` honoured.
      The `Pointer` write was not reached (the branch adds no file under
      `openspec/changes/`), so the box stayed open for a `Pointer` write.
      Closed by #392's own `finish --card`, 2026-11-02, on a branch adding
      only `openspec/changes/archive/2026-11-01-finish-writes-card/`: it
      said `finish: Pointer set to
      openspec/changes/archive/2026-11-01-finish-writes-card/` and
      `finish: #392 linked under Ссылки as archive`, and the card read back
      on the board gives that `Pointer`, re-pointed from
      `openspec/changes/finish-writes-card/`, and `[#392](…/pull/392) —
      archive` once, directly after the `#383` item

## 2. The record

- [x] 2.1 Lift `discussion()`'s cursor loop in `bun/notion-bot.ts` into
      one helper over a path and a step, joining the cursor with `?` or `&`
      as the path needs and naming the step in its no-new-cursor error, with
      a failing case first for a second page of a path that has no query;
      `discussion()` calls it, and
      `bun/notion-bot.test.ts` and `bun/notion-bot-rest.test.ts` pass
      unchanged
- [x] 2.2 Failing cases over the directories the branch adds files to, in
      temporary repositories: one change added; one archived (removed from
      `openspec/changes/`, added under `archive/`, with `diff.renames` on in
      the repository's config); none, with `tasks.md` edited; two; a change
      archived on `main` after the fork with `main` merged into the branch;
      a file added to a change the base already holds (that change, kind
      `proposal`); an `origin` whose `main` cannot be fetched, which throws.
      Then write them, and the kind, in `bun/work-finish-card.ts`
- [x] 2.3 Failing cases over `recorded()` against the Notion stub of
      `bun/work-take.fixture.ts`, extended to answer the block read, the
      append and the `Pointer` write and log their bodies: an empty
      `Pointer` written and read back; one equal to the directory left
      without a write; `openspec/changes/foo/` re-pointed to its archive;
      `harness: openspec/changes/foo/` re-pointed keeping its prefix;
      `pr:350`, another slug and `other: openspec/changes/foo/` left, each
      with its line; an empty `Pointer` on a board whose title is not
      `harness.board` written with the prefix; the link appended `after` the
      last item directly under `Ссылки` when a later section has bullets of
      its own, after the anchor when no item follows, under a `heading_3`
      `Ссылки` and a `Ссылки: ` paragraph, and as paragraph and item at the
      end when there is none; a second page of blocks read; no append when a
      block already links the pull request; a 403 on the append throwing the
      step after the `Pointer` write. Then write `recorded()`

## 3. Finish

- [x] 3.1 Failing cases in `bun/work-finish-card.test.ts` through
      `finish()` of `bun/work-finish.fixture.ts`: a first finish on a
      branch adding a change writes both before the comments read; a second
      writes neither; a refused write is said in one line and `finish` goes
      on to the question read and `gh pr ready` (task 4.1, the user's answer
      1 c, over the first-planned exit 1 with no ready); no `--card` makes
      no Notion call. Then add the call to
      `bun/work-finish.ts`, give the existing `--card` cases a stub that
      answers the new reads with a card already recorded, and change
      `bun/work-finish-sequence.test.ts`'s pinned Notion calls (today only
      the comments read) to the page and block reads before it;
      both files then pass
- [x] 3.2 `core/feature-workflow.md`: the `Ссылки` and `Pointer` paragraphs
      say `finish --card` writes the pull request's link and the change's
      `Pointer`, and keep the hand step for a pull request it did not open
      or find open, and keep a fix card's `pr:<N>` `Pointer` a hand step
      whoever opened the pull request, since `finish` never writes it; the
      kinds read `proposal`, `apply`, `archive`; `README.md`'s `finish` row says it writes both, and needs
      the ask integration's *Update content* and *Insert content*
- [x] 3.3 `bun bun/pre-pr.ts origin/main` green; the PR opens through
      `bun bun/work.ts finish --card 40a39875c31b81f0b5f2c66f8e89de9e`, and
      the card's `Pointer` and `Ссылки` it writes are read back on the
      board. Done but the `Pointer`: pre-PR green, #383 opened that way, its
      `Ссылки` item read back; this branch adds no file under
      `openspec/changes/`, so no `Pointer` was written — the first
      `finish --card` on a branch adding a change, read back, closes it:
      #392's, pre-PR green and opened that way, its `Pointer` and `Ссылки`
      item read back as 1.1 records

## 4. The user's answers of 2026-11-01

- [x] 4.1 Answer 1 c: failing cases first — a `main` sharing no history
      with the branch, as a shallow clone reads, throws the merge base's
      step from `added()`; `recorded()` over a change it cannot tell writes
      nothing and says so; `finish` over it, and over a 403 on the append,
      says the line and marks the pull request ready. Then `recorded()`
      returns the line, and `finish` turns any other throw of the record
      into a line and goes on; design decisions 1 and 2, the delta and the
      proposal say so
- [x] 4.2 Answer 2 b: failing cases first — a delta spec alone added to a
      change the base holds reads `apply`, `design.md` and `tasks.md` added
      read `proposal`. Then `added()` returns the added paths, `changes()`
      their directories and `kind()` reads the paths; design decision 5, the
      delta and the proposal say so
- [x] 4.3 Answers 3 a and 4 a: no change; design's risks record both
