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
when the question gate's checks on a comment's text pass, the card's parent
data source is one of the three boards, and no question waits unanswered
there. It SHALL then set `Assign` to the user alone, and print one line
saying what it did. The pass's outcome SHALL stay the goal check's.

#### Scenario: A question posted

- **WHEN** the final message holds one `QUESTION:` line naming a card on
  `Harness` on which no question waits, and below it text that opens
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

- **WHEN** the page's parent data source is not one of the three boards, or
  Notion answers the read of the page with an error
- **THEN** the runner posts nothing and prints the reason, with Notion's
  status where it answered one

#### Scenario: A question already waits

- **WHEN** the card's last question has no comment by the user's account
  without the mark after it
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
