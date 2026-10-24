# draft-until-answered — tasks

One group, shipped whole on `feat/draft-until-answered`. It starts once #255
has merged, since 1.5 edits `core/feature-workflow.md` after it. Write each
failing case first and record that it fails; cite each scenario as
`// spec: board-loop/<slug>`. `bun/board-loop.ts` stands at 289 lines and
`bun/board-loop-stage.test.ts` at 300: split a file at the 300-line cap
before adding to it.

## 1. Draft while the question waits, ready once it is answered

- [ ] 1.1 Add `draft` to `Pull` in `bun/pull-requests.ts` (`pr.draft ===
      true`), with a case in `bun/pull-requests.test.ts` for a draft and a
      ready pull request. Verify with that file
- [ ] 1.2 Failing cases in `bun/board-loop-push.test.ts`: `publish()` with
      the draft flag runs `gh pr create … --draft`, and without it runs no
      `--draft`. Then add the flag. Verify with that file
- [ ] 1.3 Failing cases in `bun/board-loop-question.test.ts` for *A pull
      request stays a draft while its question waits*: posted, answered by
      the triage and already waiting each open a draft; a malformed line, a
      gate failure, a card of another change and a failed post open ready;
      with no integration a well-formed line opens a draft and prints that
      the session posted it. Then decide the flag in `bun/board-loop.ts`.
      Verify with those cases
- [ ] 1.4 Failing cases for *An answer beside a draft pull request is
      carried on its branch*: an open draft on the step's branch makes an
      answer candidate for that step and branch, resumed, while a ready one
      is passed over; the prompt's work line for it names applying the
      answer to the branch's step and the `idea`-card way out with the
      title and body still named; with no question the runner runs
      `gh pr ready <number>`, then removes only the user from `Assign` and
      prints both; a new question leaves the draft and `Assign`; a failed
      `gh pr ready` leaves `Assign` and keeps the check's outcome. Then
      implement them in `bun/board-loop.ts` (or a module split from it),
      `bun/board-loop-prompt.ts` and an `unassign()` in `bun/notion-bot.ts`.
      Verify with those cases and `bun test`
- [ ] 1.5 Add the repeated `QUESTION:` sentence to the ask and connector
      variants of the launch form in `bun/board-loop-prompt.ts` and
      `core/feature-workflow.md`, and name the draft rule in `README.md`'s
      board-loop paragraph. Verify with `bun test
      bun/board-loop-question.test.ts bun/review-docs.test.ts`
