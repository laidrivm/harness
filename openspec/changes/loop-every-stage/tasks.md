# loop-every-stage — tasks

Five groups, shipped as `feat/loop-every-stage-1` to `-5`, in order, one per
pass. Group 1 depends on nothing. Group 2 needs `no-pause-on-question`
archived (design, *Risks*). Groups 3 to 5 start once the change for card
*Route every Notion write the loop makes through the bot integration* has
merged, and use its REST write. Groups 2 and 5 put a second question on a
card until card *Match a card's answer to the question it answers* lands. Each
group writes its failing cases first and records that they fail; cite each
scenario as `// spec: board-loop/<slug>` or `// spec: orchestrator/<slug>`.
Split a file at the 300-line cap before adding to it.

## 1. A spent subscription rests the clone

- [ ] 1.1 Find how `claude -p` ends when the subscription's usage limit is
      spent — the text on stdout and stderr, the reset time's form, the exit
      status — in the session transcripts and pass logs this machine holds,
      and record it in `design.md` *A spent limit is an outcome*. **User
      act.** when none holds one: hand over a pass log from the host that
      ended on the limit. Verify by the recorded excerpt
- [ ] 1.2 Move `consider()` and `left()` out of `bun/board-loop.ts` into
      `bun/board-loop-candidates.ts`, unchanged. Verify with
      `bun test bun/board-loop*.test.ts` and `wc -l`
- [ ] 1.3 Failing cases in a new `bun/board-loop-limited.test.ts`, with a
      stub `claude` printing the form 1.1 recorded: a pick, stage or triage
      session ending on it ends the pass `limited`, exit 0, with the reset
      time in UTC; no time named reads one hour on; nothing is pushed or
      posted; the card is not written. Then add the outcome to
      `bun/board-loop.ts`. Verify with those cases
- [ ] 1.4 Failing cases in `orchestrator/pass.test.ts` for the four
      scenarios of *A clone rests until the subscription's reset*, then add
      `<clone>.resume` to `orchestrator/pass.sh` and its header. Verify with
      those cases (they run where `flock` exists) and `bun test`
- [ ] 1.5 Name the `limited` outcome and the resume file in `README.md`'s
      board-loop paragraph and `orchestrator/README.md`. Verify with
      `bun test bun/review-docs.test.ts`

## 2. Verify and archive a change whose every step merged

- [ ] 2.1 Re-copy this change's *A pass takes the first takeable card in the
      board's order* against the live spec once `no-pause-on-question` is
      archived, keeping only this change's edits. Verify with
      `openspec validate loop-every-stage`
- [ ] 2.2 Failing cases: an all-ticked change with every step's pull request
      merged is an archive candidate on `chore/archive-<slug>`, and one with a
      step open is not; the pick line `PICK: <stage> <name>` is accepted only
      for a stage and name the runner listed; the pick prompt reads the
      columns right to left and claims `archiving`; the archive prompt runs
      `/opsx:verify`, archives only on a clean one, and names
      `goal-check.ts archive <slug> --before-push`; the verdict is the full
      `archive` check and the record names `archive`. Verify they fail
- [ ] 2.3 Implement 2.2 in `bun/board-loop-candidates.ts`,
      `bun/board-loop-prompt.ts` and `bun/board-loop.ts`, the stage in
      `end()`'s record. Verify with 2.2 and `bun test`
- [ ] 2.4 Describe the archive stage and the pick's form in `README.md` and
      `core/feature-workflow.md` *Unattended stages*. Verify with the tests
      that read `core/feature-workflow.md`

## 3. The board read and the derived-status correction

- [ ] 3.1 Failing cases in `bun/notion-board.test.ts` against a fake Notion
      API: the search refuses no board and two boards titled as
      `harness.board` names; the query pages past 100 cards; each card yields
      id, `Status` and `Pointer`; a failed read yields no cards and a printed
      reason. Then add `bun/notion-board.ts`. Verify with those cases
- [ ] 3.2 Failing cases for *The runner reads the board's cards through the
      integration*: a card behind its derived `proposed` or `done` moves up
      through bot-route's write and the move is printed; a cross-repository
      or decorated `Pointer` is left alone; with no integration nothing is
      read. Then call it from `bun/board-loop.ts` before the pick. Verify
      with those cases and `bun test`

## 4. Explore an approved card, under the WIP limit

- [ ] 4.1 Failing cases: `approved` and `exploring` cards are explore
      candidates; ten cards from `exploring` to `archiving` leave `approved`
      out and nine do not; the explore prompt sets no goal, forbids writes and
      ends on `NOTE:`; a note is appended to the card's body in paragraphs
      under 2000 characters and the card moves to `explored`; no note, an
      empty one or one over 6000 characters writes nothing and records
      `open`; the record names `explore`. Verify they fail
- [ ] 4.2 Implement 4.1: the candidates and the limit beside `LIMIT` in
      `bun/board-loop-candidates.ts`, the prompt in
      `bun/board-loop-prompt.ts`, the note's append in `bun/notion-board.ts`.
      Verify with 4.1 and `bun test`
- [ ] 4.3 Reword `core/feature-workflow.md`'s *Explore gets no goal of its
      own, because an unattended exploration runs inside the `propose` goal*
      to name the loop's explore stage, which sets no goal and ends on a note,
      and describe it and the WIP limit in `README.md`. Verify with the tests
      that read `core/feature-workflow.md`

## 5. Propose an explored card, approved on the card before its pull request

- [ ] 5.1 Failing cases: `explored` cards and `proposing` ones with an empty
      `Pointer` are propose candidates; a `proposing` card whose `Pointer`
      names a change on `spec/<slug>` with no pull request is an answer
      candidate once answered; the prompt names `/opsx:propose`, the
      `CHANGE:` line and the approval comment's three sections in one
      numbering; with a met before-push check the runner writes the
      `Pointer`, pushes with no pull request, posts the comment and ends
      `waiting`; no `QUESTION:` pushes and posts nothing; the answer pass
      opens the pull request and records `met` for `propose`. Verify they
      fail
- [ ] 5.2 Implement 5.1 in `bun/board-loop-candidates.ts`,
      `bun/board-loop-prompt.ts`, `bun/board-loop.ts` and the push-only mode
      of `publish()` in `bun/board-loop-push.ts`. Verify with 5.1 and
      `bun test`
- [ ] 5.3 Describe the propose stage and the approval comment in `README.md`
      and `core/feature-workflow.md`. Verify with the tests that read
      `core/feature-workflow.md`
