## MODIFIED Requirements

### Requirement: Status reads its arguments strictly

`bun bun/work.ts status` SHALL take `--card <id>`, a Notion page id as `take`
reads one, and `--to <status>`, both required. `--to` SHALL name one of the
eleven statuses task-board defines. `--why <text>` SHALL be required with
`--to discarded` and `--to idea` and SHALL NOT be taken with any other
`--to`; its text SHALL hold a character other than whitespace. Any other
option, a positional argument, a missing value, a malformed id, another
`--to`, a missing, misplaced, blank or repeated `--why` SHALL print the usage
and exit 2 before any git or Notion call.

#### Scenario: A status the board does not have

- **WHEN** `status` runs with `--to merged`, or without `--to`
- **THEN** it prints the usage, exits 2, and calls nothing

#### Scenario: A discard with no reason

- **WHEN** `status` runs with `--to discarded` and no `--why`, or with
  `--why "  "`
- **THEN** it prints the usage, exits 2, and calls nothing

#### Scenario: A reason on another move

- **WHEN** `status` runs with `--to exploring --why duplicate`
- **THEN** it prints the usage, exits 2, and calls nothing

### Requirement: The user's statuses are refused

`status` SHALL refuse `--to approved` before any call. It SHALL refuse
`--to idea` after the page read for a card that does not read `discarded`,
and any target but `idea` and `discarded` for a card that reads
`discarded`, naming `idea` as its way out: only the user moves a card to
`approved`, or to `idea` from a status other than `discarded` (task-board).
A session sets `discarded` from any status and `exploring` to `done`, and
returns a `discarded` card to `idea`.

#### Scenario: Approved as the target

- **WHEN** `status` runs with `--to approved`
- **THEN** it refuses naming the user, exits 1, and makes no Notion call

#### Scenario: Idea from a card in the work

- **WHEN** the card reads `exploring` and `status` runs with `--to idea
  --why …`
- **THEN** it refuses naming the user after the page read, and posts and
  writes nothing

#### Scenario: A discarded card

- **WHEN** the card reads `discarded` and `status` runs with `--to exploring`
- **THEN** it refuses naming `idea` as the way out, and writes nothing

#### Scenario: An idea card a session is directed at

- **WHEN** the card reads `idea`, the range has room, and `--to` is
  `exploring`
- **THEN** `status` writes the status: the user's instruction is the
  approval (`core/feature-workflow.md`), which the command cannot see, and an
  unattended session's taking no work from `idea` stays that file's rule

## ADDED Requirements

### Requirement: A move into or out of discarded posts its reason first

For `--to discarded` from any status, and `--to idea` from `discarded`,
`status` SHALL make no WIP count and read no evidence. After the page read it
SHALL post one page-level comment on the card from the ask integration,
opening with the code mark `harness-status`, then `<from> → <to>: ` and the
`--why` text, where `<from>` is the status the page read gave. Only after the
post succeeds SHALL it write the `Status`, and release `Assign` as after any
write. A post that fails SHALL write no status, print one line opening
`status: <card> not written —`, exit 1 and record nothing in the gate ledger.

#### Scenario: A duplicate discarded

- **WHEN** the card reads `approved`, five cards are in the range, and
  `status` runs with `--to discarded --why "duplicate of <card>"`
- **THEN** it makes no count, posts `harness-status` `approved → discarded:
  duplicate of <card>` on the card, then writes `discarded`, prints
  `status: <card> approved → discarded` and exits 0

#### Scenario: A card in the work discarded

- **WHEN** the card reads `applying` and `status` runs with `--to discarded
  --why …`
- **THEN** it reads no evidence, posts the reason and writes the status

#### Scenario: A discarded card returned

- **WHEN** the card reads `discarded` and `status` runs with `--to idea
  --why "needed after all"`
- **THEN** it posts `discarded → idea: needed after all`, writes `idea`, and
  exits 0

#### Scenario: A discard run again

- **WHEN** the card reads `discarded` and `status` runs with `--to
  discarded --why …`
- **THEN** it posts the reason and writes the status, as the retry of a run
  whose write failed after its post

#### Scenario: The post fails

- **WHEN** the comment's post answers 500
- **THEN** `status` makes no `Status` write, prints a line opening
  `status: <card> not written —`, exits 1, and records no refusal

#### Scenario: The write fails after the post

- **WHEN** the post succeeds and the `Status` write answers 500
- **THEN** the reason stays on the card, the line says the status was not
  written, and `status` exits 1
