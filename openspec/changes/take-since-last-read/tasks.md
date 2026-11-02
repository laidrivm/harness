# take-since-last-read — tasks

One group, one pull request, on `feat/take-since-last-read`: the change
is about 300 lines of diff, under the 800-line budget. Each failing case is
written first, its failure recorded, and cited as `// spec: work-take/<slug>`.
The bracketed numbers are the proposal-stage `/zombies` ideas.

## 1. Paths for the change, the last comment, and `--after`

- [x] 1.1 Give `said()` in `bun/work-take.fixture.ts` an `id` argument and
      every comment the fixtures build a distinct id, half of them dashed
      UUIDs, so a case can name one. Verify: `bun test bun/work-take*.test.ts`
      still passes unchanged
- [x] 1.2 Write failing cases in `bun/work-take.test.ts`'s *the change*
      block, replacing the ones that expect a file's text: each of the four
      kinds of file prints `<path>: <n> lines` and no line of its text, the
      capability still named [1]; a `tasks.md` of three lines, the last with
      no newline, reads `3 lines` [2]; one ending `a\n\n` reads `2 lines`
      [3]; an empty `design.md` reads `0 lines` [4]; a missing `design.md`
      prints no line for it [5]. Verify: each new case fails against today's
      code
- [x] 1.3 Write failing cases for the last line: a full `take` ends with
      `last comment: <id>` of the third of three comments, after `openspec
      list`'s listing, and the *open changes* case's `toEndWith` names it
      [6]; two comments with one `created_time` name the one Notion returned
      last [7]; comments over two pages name the second page's last [8]; no
      comments end with `last comment: none` [9]; a comments read that fails
      prints no such line [10]. Verify: each fails against today's code
- [x] 1.4 Write failing cases for `--after` in `bun/work-take.test.ts` and,
      for its failures, `bun/work-take-fail.test.ts`. Arguments: `--after`
      with no value, `--after=`, 31 and 33 hex digits, and a UUID with a
      digit too many print the usage and exit 2, calling nothing; a 32-hex
      id and a dashed UUID pass, before or after `--card` [11] [12]. A
      re-read after the question with the user's answer following prints
      `Status`, `Assign`, the answer alone, `question waiting: no`, the
      release line and the answer's id last, and no `## Body`, `## Change` or
      `## Open changes` [13]. Several comments after the cursor print oldest
      first [14]; of two comments in one minute, `--after` the first prints
      the second only [15]; the cursor on the first page and the answer on
      the second prints the answer [16]; the card's comment a UUID and
      `--after` its 32-hex form, and the other way round, match [17]. The
      cursor on the last comment prints the nothing-follows line and the
      same id [18]; a question before the cursor with no answer after it
      prints `question waiting: yes` [19]; an id no comment carries prints
      the not-on-the-card line, every comment, and exits 0, or 1 when the
      release's restore fails [20]; a card with
      no comments prints that line and `last comment: none` [21]. Reads: the
      calls are `GET`s of the page and its comments, no markdown call, the
      `openspec` stub records no run, and a working directory outside git
      exits 0 [22]. Failures: 403 on the page read and 500 on the comments'
      second page each exit 1 on the step's line, with no last-comment line
      and no token [23]. Verify: each fails against today's code
- [x] 1.5 In `bun/work-take.ts`, make `change()` print each file's path and
      line count (design, *Paths with line counts*); end the full read with
      the last comment line; add the re-read path (design, *A cursor by
      comment id, not by time*, *The last line*, *What a re-read reads*). In
      `bun/work.ts`, accept `--after` checked against `ID`, and name it in
      `USAGE` and the header comment; update `work-take.ts`'s header comment
      to match. Verify: `bun test bun/work-take.test.ts
      bun/work-take-fail.test.ts` passes, and `bun bun/check.ts` passes
- [x] 1.6 In `core/feature-workflow.md`, where a session resuming work reads
      the card's comments with `take`, say that the first read prints the
      card and the paths of its change, ending with the last comment's id,
      and a re-read passes `--after <that id>` and prints only what came
      after it, while after `last comment: none` the re-read is a plain
      `take`. In `README.md`'s row for `take`, name `--after` and that
      the change prints as paths. Grep the tree outside
      `openspec/changes/archive/` for `work.ts take` and `take --card` and
      update any other instruction to re-read a card. Verify: the grep shows
      no re-read without `--after`, `bun test` passes, and `openspec
      validate --strict take-since-last-read` passes
