## MODIFIED Requirements

### Requirement: Finish reads its arguments strictly

`bun bun/work.ts finish` SHALL take `--card <id>`, optional and a Notion page
id, and `--title <text>` with `--body-file <path>`, both or neither. Any other
option, a positional argument, a missing value or a malformed card id SHALL
print the usage and exit 2 before any git, `gh` or Notion call.

#### Scenario: A malformed card

- **WHEN** `finish` runs with `--card` set to 31 hex digits
- **THEN** it prints the usage, exits 2, and nothing is pushed or opened

#### Scenario: An option it does not know

- **WHEN** `finish` runs with `--force`
- **THEN** it prints the usage and exits 2

### Requirement: Finish marks ready only when no question waits

After the push, or its skip, `finish` given `--card` SHALL read the card's
comments through the ask integration and mark the pull request ready only
when no question to the user waits there. A waiting question SHALL leave the
draft and exit 0, naming the card. No ask settings, a read Notion does not
answer, or a ready GitHub refuses SHALL leave the draft and exit 1. Without
`--card`, `finish` SHALL read no card, say so, and mark the pull request
ready; every refusal before the push still holds.

#### Scenario: No question on the card

- **WHEN** the card holds no question waiting on the user
- **THEN** `finish` marks the pull request ready and exits 0

#### Scenario: A question waits

- **WHEN** the card's last question has no answer from the user
- **THEN** the pull request stays a draft, and `finish` names the card and
  exits 0

#### Scenario: Notion does not answer

- **WHEN** the read of the card's comments fails
- **THEN** the pull request stays a draft and `finish` exits 1

#### Scenario: No ask settings

- **WHEN** `finish` has a card and the machine has no ask settings
- **THEN** the pull request stays a draft and `finish` exits 1

#### Scenario: No card: no question check

- **WHEN** `finish` runs without `--card` on a branch with no open pull
  request, with a title, a body file and the run records of `HEAD`
- **THEN** it pushes, opens the draft and marks it ready, reading nothing
  from Notion and printing that no card's question was read, and without
  the run records it refuses before the push as with a card
