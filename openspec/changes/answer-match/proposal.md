# answer-match

## Why

The board loop takes as a card's answer the user's first comment after the
card's **last** `harness-question`, whoever asked it. On 2026-10-24 the loop
asked runner-isolation's 6.2 question (20:32) and the user answered it
(20:43); a chat agent then put PR #251's approval question on the same card
(21:05). The user's reply to #251 (21:35) became the loop's answer, and the
real one was read as stale: the user had to restate "6.2: а" last. A reply
thread cannot separate them: every page-level comment on a card joins its one
page-level discussion (both live cards show a single discussion).

The pick also takes an answer candidate only while `Assign` holds the user,
because `Assign` is the only mark that an answer was already carried. So the
loop must keep `Assign` until the step's pull request opens, while the user
wants it cleared as soon as an answer is taken (answer 12б on the card
*Carry the session's feedback into what loop sessions read*).

## What Changes

- A question the board loop asks names the step that carries its answer: its
  text opens with the mark, then `<slug> step <k>:`. `k` is the carried step
  when the session leaves no pull request to open, and the next step when it
  does. The runner writes that tag itself when it posts; a session that posts
  through the ask command or the connector writes it as its prompt spells it.
- An answer belongs to one question: the user's first unmarked comment after
  it **and before the next question**, or the runner's `harness-answer` in
  that span, the user's first. A later question no longer turns an earlier
  answer into no answer.
- The pick takes an answer candidate for step `S` when its card holds a
  question tagged `<slug> step <S>:` that has an answer, whatever `Assign`
  holds. A question asked by anyone else, a chat agent included, is never the
  loop's answer.
- A stage session clears the card's `Assign` in the turn it takes the answer,
  not when the pull request opens. A session that dies before its pull
  request loses nothing: the next pick finds the tagged question again.
- Unchanged: a card waits while its last question has no answer, so the ask
  command and the runner still post one open question per card.

## Capabilities

### Modified Capabilities

- `task-board`: the answer is matched to its own question; the board loop's
  answer counts as applied, and `Assign` is cleared, when the session takes
  it.
- `board-loop`: the loop's question carries its step's tag; the pick matches
  an answer candidate by that tag and no longer reads `Assign`.

## Impact

- `bun/board-loop-prompt.ts`: the pick prompt's answer-candidate sentence, the
  stage prompt's answer sentence and its ask and comment forms; a small
  exported helper that puts the tag after the mark.
- `bun/board-loop.ts`: the runner tags the question it posts (two lines).
- `core/feature-workflow.md`: the launch form's question and answer wording,
  kept in step with the prompt by `bun/board-loop-question.test.ts`.
- Tests in `bun/board-loop-question.test.ts` and `bun/board-loop.test.ts`.
- `bun/notion-bot.ts` `waits()` keeps its rule: the last question's span runs
  to the end of the discussion, so "waits" reads the same.
