## MODIFIED Requirements

### Requirement: Take prints every comment and whether a question waits

`take` SHALL print every page-level comment of the card, oldest first, each
with its time, its author — the user, or the author's id — and its text, and
then one line saying whether a question waits on the user, decided as
`task-board`'s *An open question waits on its card, assigned to the user*
reads it with no integration id. It SHALL read every page of the comments.

#### Scenario: A question with no answer

- **WHEN** no comment by the user follows the card's last comment opening
  with the question mark, though another author's may
- **THEN** `take` prints the comments and `question waiting: yes`

#### Scenario: An answered question

- **WHEN** the user's comment follows the card's last question
- **THEN** `take` prints the comments, the answer marked as the user's, and
  `question waiting: no`

#### Scenario: Comments over more than one page

- **WHEN** Notion returns the card's comments on two pages
- **THEN** `take` prints the comments of both

### Requirement: Take writes nothing and fails closed

`take` SHALL write nothing — no Notion call but a read, no git ref, no ledger
record, no file — but the release of `Assign` that `task-board`'s *The work
commands release `Assign` when nothing waits* fixes. It SHALL read Notion
through the ask integration's settings. No settings, or a read of its own
that fails — Notion, git or `openspec`, the release's reads apart — SHALL
exit 1 with a line naming the step, and no
line `take` composes itself SHALL hold the token; the body and the comments
print as Notion holds them.

#### Scenario: No ask settings

- **WHEN** the machine has no ask settings
- **THEN** `take` prints that no ask integration is configured, exits 1, and
  calls nothing

#### Scenario: A page the integration cannot read

- **WHEN** Notion answers the card's read with 403
- **THEN** `take` prints the step and the status, exits 1, and prints no
  token

#### Scenario: Only reads

- **WHEN** `take` runs to its end on a card whose `Assign` does not hold the
  user, or whose question or pause notice waits
- **THEN** every call it made to Notion is a `GET`, and the ledger and the
  checkout are as they were
