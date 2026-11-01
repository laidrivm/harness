## MODIFIED Requirements

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
