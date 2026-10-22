# notion-bot-questions

## Why

Every question an agent asks on a card is posted through the user's own
Notion connector, so the card shows the user asking the user, and only the
`harness-question` mark tells the question from the answer. The board loop is
moving to a VPS where nobody is at a terminal. A Notion internal integration
can post there under an identity of its own, with a token that, like the
GitHub App's key (`github-app-identity`), only the runner holds. The session
never does.

The user then widened it (2026-10-20): no question goes out under their name,
attended or not. Sessions on the laptop get an integration of their own. A
question whose answer is already written is answered by a triage before it
reaches the user.

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
- **A laptop session asks through an integration of its own.** A second
  internal integration, with comment capabilities only, keeps its token in a
  0600 file on the laptop. A session there, attended or not, posts its
  question with `bun bun/notion-ask.ts <card id> <file>` and sets `Assign`
  through the user's connector. Where that file exists, the question gate
  refuses a question from the user's account and names the command.
- **A triage answers what is already written.** Before the runner posts a
  stage session's question, a read-only `claude -p` triage looks for an
  answer already written in a spec, a design, the rulebook, the docs or the
  user's earlier answer on the card. With one, whose source the runner
  checks, the integration posts it as a comment opening with
  `harness-answer` and naming that source, and no `Assign` is set. Any
  choice, or any doubt, goes on to the user as the question.
- **The answer rule gains the triage's answer.** After the last question, the
  answer is the user's first unmarked comment, or, with none, the VPS
  integration's first `harness-answer`. A comment of the user's overrides it.
- **Without either settings file nothing changes.** A machine without the
  VPS integration's file or the ask file runs sessions as it does today, and
  they ask through the question gate.
- The VPS integration writes only questions, the triage's answers and
  `Assign`; the laptop's writes only questions. `Status`, `Pointer` and card
  text stay with the user's connector, as today.

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
- Before group 4 is used: create a second internal integration, "harness
  ask", with Read comments and Insert comments alone. Connect it to the
  `D2ASS`, `Harness` and `mellon` boards. Put its token and the user's
  Notion id in the laptop's `~/.config/harness/notion-ask.json`, mode 0600.
  Then check two facts and record them on the card: that the command posts
  on a card of each board, and that it gets a refusal on a page outside
  them.
- Before group 6 relies on it: read one triage answer back through the
  connector and note on the card how its author shows.

## Non-goals

- The `comment.created` webhook, which needs the orchestrator's public HTTPS.
  The pick session goes on polling the comments.
- Moving `Status`, `Pointer` or card text to the integration.
- Clearing `Assign` once an answer is applied. When that happens for an
  answer the loop carries is the open idea card *Say when an answer counts as
  applied now that the runner opens the step's pull request*, and this change
  leaves it to that card.
- Triage for a laptop question. The triage runs beside the VPS token, and a
  laptop question goes straight to the card (`design.md`, *Three paths to a
  card*).
- A triage that settles a choice. Every choice goes on to the user.
- Mentioning the user in a question.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-board`: *An open question waits on its card, assigned to the user*
  says who posts a question, and what counts as its answer, the triage's
  included. It gains *A session asks through the ask integration where one
  is configured*.
- `board-loop`: gains the integration's settings, the runner's post of a
  stage session's question, and the triage before it.
- `stage-goal`: *An unattended stage runs under one goal on the check* lets a
  launcher name the `QUESTION:` line or the ask command in place of the
  comment's form.
- `agent-permissions`: gains *A session whose launcher posts its questions
  posts no comment* and *A question goes to the ask command where one is
  configured*, both beside *A question to the user on a board card needs no
  prompt*.

## Impact

- `bun/board-loop.ts`: the pick prompt's answer rule, the launch form's
  variant, the settings read before any session, and the call after the
  stage session. It stands at 285 of its 300 lines.
- A new `bun/notion-bot.ts`: the settings file, the `QUESTION:` parse, and
  the REST calls, with `fetch` and no dependency.
- `bun/question-gate.ts`: the comment checks lifted out for the runner to
  import, the refusal in a session the runner asks for, the refusal of a
  question where the ask settings exist, and the `harness-answer` mark.
- `bun/board-loop-session.ts`: one variable added to a session's environment
  when the runner asks for it.
- A new `bun/notion-ask.ts`: the ask command, on `notion-bot.ts`'s settings
  read and REST calls.
- A new `bun/notion-triage.ts`: the triage session and the check of its
  source, called before the question's post; and the integration's id in the
  pick prompt.
- `.claude/settings.json`: an allow entry for the ask command; the README
  names the entry a consumer adds.
- `core/feature-workflow.md` and `README.md`.
