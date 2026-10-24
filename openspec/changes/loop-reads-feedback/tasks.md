## 1. What loop sessions read

- [x] 1.1 The stage prompt's question line in `bun/board-loop-prompt.ts` and
      its three forms in `core/feature-workflow.md` ask for options and a
      recommendation per question, the question in Russian, and each user
      command on its own line; the ask and comment forms set `Assign` and read
      the card back. Verify with `bun/board-loop-question.test.ts`, which pins
      the new phrases and keeps the prompt and the doc in step
- [x] 1.2 A resumed step branch merges `origin/main` before any other work, in
      the prompt's resume sentence. Verify with the board-loop tests
- [x] 1.3 `core/git-and-prs.md`: a pull request always opens with the work,
      as a draft while a question to the user on its card is unanswered, and
      goes ready once the answers settle every item
- [x] 1.4 The `task-board` delta relaxes the card summary to about 500
      characters, longer only for context. Verify with
      `openspec validate loop-reads-feedback`
