# board-loop delta

## ADDED Requirements

### Requirement: The runner reads the Notion integration's settings from its own user's file

Before any session, the runner SHALL read the integration's token and the
user's Notion id from one settings file under its own user's config home. No
file SHALL mean no integration, and the pass SHALL run as it would without
this requirement. A file the runner cannot use SHALL refuse the pass before
any session, naming the file and never its contents. Neither value SHALL
reach a session.

#### Scenario: No settings file

- **WHEN** the runner's config home holds no settings file
- **THEN** the stage session's launch form asks it to comment on the card as
  before, no session carries the variable the question gate reads, and the
  pass makes no call to Notion

#### Scenario: A usable settings file

- **WHEN** the file holds a non-empty token and a user id, and only its owner
  may read it
- **THEN** both sessions carry the variable the question gate reads, the stage
  session's launch form names the `QUESTION:` line, and neither session's
  environment nor any command's arguments hold the token

#### Scenario: A settings file others may read

- **WHEN** the file's mode grants its group or others any access
- **THEN** the pass refuses before any session, naming the file and its mode

#### Scenario: A settings file the runner cannot use

- **WHEN** the file cannot be read, is not a JSON object, holds a token that
  is empty or holds whitespace, or holds a user id that is not, as a whole
  value, 32 hexadecimal digits with or without a UUID's hyphens
- **THEN** the pass refuses before any session, naming the file and the key at
  fault, and prints no value from it

### Requirement: The runner posts a stage session's question from the integration

When the integration is configured and a stage session ends clean, the
runner SHALL read the final message for a `QUESTION: <card id>` line and the
text below it. It SHALL post that text from the integration on that card only
when the question gate's checks on a comment's text pass, the card sits on
the board `harness.board` names with a `Pointer` that is wholly the carried
change's directory, and no question waits unanswered there. It SHALL then
set `Assign` to the user alone, and print one line saying what it did. The pass's outcome SHALL stay the goal check's.

#### Scenario: A question posted

- **WHEN**, in the harness's clone, the final message holds one `QUESTION:`
  line naming the carried change's card on `Harness`, on which no question
  waits, and below it text that opens
  with the mark and is at most 1500 characters long
- **THEN** the runner posts the text as a page-level comment from the
  integration, sets the card's `Assign` to the user alone, prints that it did
  both, and the pass ends as the goal check says

#### Scenario: Where the question ends

- **WHEN** a `PR-TITLE:` line follows the question
- **THEN** the question's text ends before it; with no such line, it ends at
  the end of the message

#### Scenario: No question

- **WHEN** the final message holds no line starting `QUESTION:`
- **THEN** the runner makes no call to Notion and prints nothing about a
  question

#### Scenario: A malformed question line

- **WHEN** the final message holds two `QUESTION:` lines, one after the
  `PR-BODY:` line, or one whose value is not, as a whole, a card id of 32
  hexadecimal digits with or without a UUID's hyphens
- **THEN** the runner posts nothing and prints why

#### Scenario: Text the question gate would not allow

- **WHEN** the text does not open with the mark, mentions a user, or is 1501
  characters long
- **THEN** the runner posts nothing and prints the condition the text failed,
  in the question gate's words

#### Scenario: A page that is not a card

- **WHEN** the page's parent data source is not the board `harness.board`
  names, or Notion answers the read of the page with an error
- **THEN** the runner posts nothing and prints the reason, with Notion's
  status where it answered one

#### Scenario: The card of another change

- **WHEN** the card's `Pointer` is not wholly
  `openspec/changes/<slug>/` for the change the pass carries
- **THEN** the runner posts nothing and prints that the card is not the
  carried change's

#### Scenario: A question already waits

- **WHEN** the card's last question has no answer after it, as `task-board`'s
  *An open question waits on its card, assigned to the user* reads one
- **THEN** the runner posts nothing and prints that a question already waits
  on that card

#### Scenario: The comment posted and `Assign` refused

- **WHEN** the comment is posted and the write of `Assign` fails
- **THEN** the runner prints that the question is posted and `Assign` is not
  set, and neither retries nor posts the comment again

#### Scenario: A session that did not end clean

- **WHEN** the stage session ran past its limit, or its process group outlived
  it
- **THEN** the runner reads no question from it

#### Scenario: A question with no integration

- **WHEN** no settings file is configured and the final message holds a
  `QUESTION:` line
- **THEN** the runner posts nothing and prints that no integration is
  configured

### Requirement: The runner has a stage session's question triaged before it posts it

With the integration configured, the runner SHALL read the integration's own
id before the pick session and name it in the pick prompt as the author of
`harness-answer` comments. Once a `QUESTION:` line has passed every check of
*The runner posts a stage session's question from the integration*, the
runner SHALL start a triage session, with no goal, that may read the clone
and nothing else. It SHALL hold no token, and its prompt SHALL carry the
question and the card's comments as data. When the triage ends naming a
source, a verbatim quote and an answer, the source is a Markdown file
(`*.md`) tracked in the clone or the id of a comment by the user's account on
that card, and the quote, whitespace normalised, appears in that file at
`HEAD` or that comment's text, the runner SHALL check the page's parent, the
board's title and the carried `Pointer` again, read the card's comments
again and, when all three still hold and no comment opening with the mark,
nor a `harness-answer` comment by the integration's own id, appeared since
its read before the triage, post the answer from the
integration as a page-level comment opening with `harness-answer` and holding
the quote and the source, and SHALL set no `Assign`. The runner SHALL make
the same checks, and post nothing when one fails, before posting the
question on every other ending too. Any other source SHALL be one
that does not hold. On any
other ending the runner SHALL post the question as that requirement fixes.
The pass's outcome SHALL stay the goal check's.

#### Scenario: An answer already written

- **WHEN** the triage ends with a source that is a Markdown file tracked in
  the clone, a quote that file holds, and an answer
- **THEN** the runner posts a comment opening with `harness-answer` that holds
  the answer and the source, sets no `Assign`, and prints that it answered

#### Scenario: A choice for the user

- **WHEN** the triage ends with `ESCALATE`
- **THEN** the runner posts the question from the integration and sets
  `Assign` to the user, as it would with no triage

#### Scenario: A source that does not hold

- **WHEN** the triage names a path the clone does not track, a tracked file
  that is not Markdown, a comment id that is not the user's on that card, or a
  quote the source does not hold
- **THEN** the runner posts the question as it would on `ESCALATE`, and
  prints that the source did not hold

#### Scenario: A card moved or re-pointed while the triage ran

- **WHEN** the card's `Pointer` changed, or the page left the board, while the
  triage ran
- **THEN** the runner posts neither the answer nor the question

#### Scenario: A question posted while the triage ran

- **WHEN** a comment opening with the mark or with `harness-answer` appears on
  the card while the triage runs, whether or not the user has answered it
- **THEN** the runner posts neither the answer nor the question, and prints
  that the card changed during the triage

#### Scenario: A triage that fails

- **WHEN** the triage cannot be started, runs past its limit, or ends with
  neither form
- **THEN** the runner posts the question as it would on `ESCALATE`

#### Scenario: The triage's reach

- **WHEN** the triage session runs
- **THEN** its environment holds no token and no variable naming one, and its
  launch allows it no tool that writes or runs a command

#### Scenario: The pick prompt names the integration

- **WHEN** the integration is configured and the pick session starts
- **THEN** its prompt names the integration's id as the author whose
  `harness-answer` comments count as answers; with no integration it names
  none, and no `harness-answer` counts
