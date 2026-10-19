# notion-bot-questions

## Why

Every question an agent asks on a card is posted through the user's own
Notion connector, so the card shows the user asking the user, and only the
`harness-question` mark tells the question from the answer. The board loop is
moving to a VPS where nobody is at a terminal. A Notion internal integration
can post there under an identity of its own, with a token that, like the
GitHub App's key (`github-app-identity`), only the runner holds. The session
never does.

## What Changes

- **The answer follows the last question, whoever posted it.** A question is
  a comment that opens with the mark, whether an agent posted it from the
  user's account or the runner posted it from the integration. The answer is
  the first comment by the user's account, without the mark, after the last
  question. The pick session's prompt and `core/feature-workflow.md` say so.
- **The runner posts the question of a session it launched.** When the
  integration is configured, the stage session's launch form no longer asks
  it to comment on the card. It puts the question in its final message
  instead: a line `QUESTION: <card id>`, then the text. Once the session has
  ended, the runner checks the text as the question gate checks a comment:
  the mark, at most 1500 characters, no mention. The card must be the
  carried change's, on the repository's own board, which is narrower than
  the gate's three boards. It also checks that no question already waits on
  that card.
  Then it posts the question from the integration and sets the card's
  `Assign` to the user.
- **A session the runner asks for posts no comment itself.** The runner marks
  such a session in its environment, and the question gate then refuses
  every comment there, naming the `QUESTION:` line. That way nothing the
  session writes on a card appears under the user's name.
- **Without the integration nothing changes.** The laptop's runner never
  holds the token. It launches sessions as it does today, and they ask
  through the question gate.
- The integration writes only the question and `Assign`. `Status`, `Pointer`
  and card text stay with the user's connector, as today.

### User acts

Only the user can do these. No task of this change does them.

- Keep the integration's token on the VPS alone, in the runner user's
  settings file that `design.md` names, with mode 0400. The file never goes
  on the laptop.
- Read their own Notion user id once, with that token, through the API's user
  list, and write it in the same file.
- Before the first pass that relies on the integration, check with the token
  that it can read one card on each board. The integration was connected to
  the boards, and it is unverified whether that reaches their cards. Record
  the result on the card. If it does not reach them, share what Notion asks
  for until it does. The runner meanwhile prints each failed post.
- After the first question the integration posts, note on the card whether
  Notion notified them of the comment or of the `Assign` write. Nothing in
  this change depends on the answer. It decides whether a later change needs
  a mention.

## Non-goals

- The `comment.created` webhook, which needs the orchestrator's public HTTPS.
  The pick session goes on polling the comments.
- Moving `Status`, `Pointer` or card text to the integration.
- Clearing `Assign` once an answer is applied. When that happens for an
  answer the loop carries is the open idea card *Say when an answer counts as
  applied now that the runner opens the step's pull request*, and this change
  leaves it to that card.
- A session started by hand, or a worker another session briefs. Nothing
  reads its final message the way the runner does, so it asks as it does
  today.
- Mentioning the user in a question.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-board`: *An open question waits on its card, assigned to the user*
  says who posts a question, and when the answer counts as following it.
- `board-loop`: gains the integration's settings and the runner's post of a
  stage session's question.
- `stage-goal`: *An unattended stage runs under one goal on the check* lets a
  launcher that posts questions name the `QUESTION:` line in place of the
  comment's form.
- `agent-permissions`: gains *A session whose launcher posts its questions
  posts no comment*, which sits beside *A question to the user on a board
  card needs no prompt*.

## Impact

- `bun/board-loop.ts`: the pick prompt's answer rule, the launch form's
  variant, the settings read before any session, and the call after the
  stage session. It stands at 285 of its 300 lines.
- A new `bun/notion-bot.ts`: the settings file, the `QUESTION:` parse, and
  the REST calls, with `fetch` and no dependency.
- `bun/question-gate.ts`: the comment checks lifted out for the runner to
  import, and the refusal in a session the runner asks for.
- `bun/board-loop-session.ts`: one variable added to a session's environment
  when the runner asks for it.
- `core/feature-workflow.md` and `README.md`.
