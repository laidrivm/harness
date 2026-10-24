## 1. The loop's question carries its step, and its answer is matched to it

- [ ] 1.1 Add `tagged(text, slug, step)` to `bun/board-loop-prompt.ts`: it
      puts `<slug> step <k>:` after the mark unless the text already opens
      with the mark and that tag, and returns the text unchanged when it does
      not open with the mark (the gate refuses it later). In
      `bun/board-loop.ts`, tag the parsed question before `post()` with
      `chosen.step`, plus one when the final message holds a `PR-TITLE:`
      line. Cases in `bun/board-loop-question.test.ts`: a blocked session's
      question is posted tagged with its step; one with `PR-TITLE:` with the
      next step; an already tagged one keeps one tag. Write them first and
      record that they fail. Verify with that file; `wc -l bun/board-loop.ts`
      stays at or under 300
- [ ] 1.2 `pickPrompt()` takes each answer candidate with its step and
      replaces the `Assign` condition: take a candidate for step `S` when its
      card holds a question opening with the mark and `<slug> step <S>:`
      whose span, up to the next `harness-question`, holds the user's
      unmarked comment or the integration's `harness-answer`, the user's
      first; never read `Assign`. Keep the takeable pass-over sentence as it
      is. Pin the new phrases, and the absence of the `Assign` condition, in
      `bun/board-loop-question.test.ts` and `bun/board-loop.test.ts`, red
      first. Verify with those files
- [ ] 1.3 `prompt()`: the answer sentence names the tagged question and its
      span, in both variants, with the `harness-answer` clause only when the
      integration's id is given; the ask and comment forms give the session
      both tags literally (its step when it ends without `PR-TITLE:`, the next
      when it writes one); the answer variant clears the card's `Assign` in
      the turn it writes the answer into `tasks.md`. Mirror the wording in
      `core/feature-workflow.md`'s launch form and its *Questions* bullet,
      which `bun/board-loop-question.test.ts` keeps in step with the prompt.
      Red first, then verify with that file and `bun/board-loop-stage.test.ts`
- [ ] 1.4 `openspec validate answer-match`, `bun test
      bun/board-state-hygiene.test.ts bun/spec-coverage*.test.ts`, and the
      push's full `bun test`
- [ ] 1.5 List the answer candidates on `Harness`, `D2ASS` and `mellon` (all
      groups ticked, card at `applied` or `applying`) whose card holds an
      answered question with no tag, and name them in the pull request's
      body: once this merges, the pick takes none of them until a tagged
      question is asked there. Read only; post nothing
