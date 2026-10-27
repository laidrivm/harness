# work-status

## Purpose

The command a session moves a card's `Status` with, the WIP limit and the
evidence on `origin/main` it checks before the write, and the hook that keeps
the connector's own `Status` write from walking round it in the harness.

## ADDED Requirements

### Requirement: Status reads its arguments strictly

`bun bun/work.ts status` SHALL take `--card <id>`, a Notion page id as `take`
reads one, and `--to <status>`, both required. `--to` SHALL name one of the
eleven statuses task-board defines. Any other option, a positional argument,
a missing value, a malformed id or another `--to` SHALL print the usage and
exit 2 before any git or Notion call.

#### Scenario: No target

- **WHEN** `status` runs with `--card <id>` alone
- **THEN** it prints the usage, exits 2, and calls nothing

#### Scenario: A status the board does not have

- **WHEN** `status` runs with `--to merged`
- **THEN** it prints the usage and exits 2

### Requirement: The user's statuses are refused

`status` SHALL refuse `--to idea`, `--to approved` and `--to discarded` before
any call, and SHALL refuse any target for a card that reads `discarded`:
only the user moves a card to those or out of `discarded` (task-board). A
session sets the other eight, `exploring` to `done`.

#### Scenario: Approved as the target

- **WHEN** `status` runs with `--to approved`
- **THEN** it refuses naming the user, exits 1, and makes no Notion call

#### Scenario: A discarded card

- **WHEN** the card reads `discarded` and `status` runs with `--to exploring`
- **THEN** it refuses and writes nothing

### Requirement: Entering the work range is held to the WIP limit

When the card reads a status outside `exploring` … `archiving` and `--to` is
one of those seven, `status` SHALL count the cards of the card's own board
at those seven and refuse when the count has reached `HARNESS_WIP_LIMIT`,
which reads 5 when unset and SHALL be a whole number. A move within the
seven, or to `done`, SHALL NOT be counted.

#### Scenario: The limit reached

- **WHEN** the card reads `approved`, five cards of its board are at
  `exploring` … `archiving`, and `HARNESS_WIP_LIMIT` is unset
- **THEN** `status --to exploring` refuses naming the limit and writes nothing

#### Scenario: Room under the limit

- **WHEN** the card reads `approved` and four cards of its board are in the
  range
- **THEN** `status --to exploring` writes the status

#### Scenario: A move within the range

- **WHEN** the card reads `proposing`, the range holds five cards and `--to`
  is `proposed`
- **THEN** no count is made and the WIP limit refuses nothing

#### Scenario: A limit that is not a number

- **WHEN** `HARNESS_WIP_LIMIT` is `five` and the move enters the range
- **THEN** `status` refuses naming the variable and writes nothing

### Requirement: Merged statuses are proven on origin/main

For `--to proposed`, `applied` or `done`, `status` SHALL fetch `main` from
`origin` and read the evidence from the `openspec/changes` tree of
`origin/main` alone — never the checkout's files, `HEAD` or local `main`. A
fetch or a tree read that fails SHALL refuse.

#### Scenario: A checkout behind origin

- **WHEN** `origin/main` holds the change archived and the checkout's own
  tree and local `main` still hold it unarchived
- **THEN** `status --to done` writes the status

#### Scenario: A checkout ahead of origin

- **WHEN** the checkout holds a commit archiving the change that `origin`
  does not
- **THEN** `status --to done` refuses and writes nothing

#### Scenario: The fetch fails

- **WHEN** `git fetch` cannot reach `origin`
- **THEN** `status --to proposed` refuses and writes nothing

### Requirement: Each merged status has its own evidence

On `origin/main`, `proposed` SHALL be proven when the board state derives
`proposed` or `done` for the change, `done` when it derives `done`, and
`applied` when it derives `done`, or `proposed` with every `## ` group of
the change's `tasks.md` holding a ticked box and no open one. A derived
`proposing` proves nothing. A ticked `Dropped …` task counts as ticked.

#### Scenario: A proposal not complete on main

- **WHEN** `origin/main` holds the change without its `design.md`
- **THEN** `status --to proposed` refuses and writes nothing

#### Scenario: One group still open

- **WHEN** the change's `tasks.md` on `origin/main` has group 1 ticked and
  group 2 with an open box
- **THEN** `status --to applied` refuses naming the open group

#### Scenario: Every group ticked, one task dropped

- **WHEN** every group is ticked and one ticked task reads `Dropped: …`
- **THEN** `status --to applied` writes the status

#### Scenario: A task list with no group

- **WHEN** the change's `tasks.md` has no `## ` group with a box
- **THEN** `status --to applied` refuses

#### Scenario: An archived change asked for applied

- **WHEN** `origin/main` holds the change only under the archive
- **THEN** `status --to applied` writes the status

### Requirement: The card's Pointer names the change proven

For a merged status, the change SHALL be the one the card's `Pointer` names
when it is wholly `openspec/changes/<slug>/` or
`openspec/changes/archive/<date>-<slug>/`, with a directory for that slug on
`origin/main`. An empty, decorated or cross-repository `Pointer`, or a slug
`origin/main` lacks, SHALL refuse, quoting the `Pointer`.

#### Scenario: An empty pointer

- **WHEN** the card's `Pointer` is empty and `--to` is `done`
- **THEN** `status` refuses and writes nothing

#### Scenario: Text around the path

- **WHEN** the `Pointer` reads `openspec/changes/foo/ (step 2)`
- **THEN** `status --to proposed` refuses quoting it

#### Scenario: A slug main does not hold

- **WHEN** the `Pointer` is wholly `openspec/changes/foo/` and `origin/main`
  has no `foo` under `openspec/changes/` or its archive
- **THEN** `status --to proposed` refuses

#### Scenario: An archived pointer

- **WHEN** the `Pointer` is `openspec/changes/archive/2026-10-27-foo/` and
  `origin/main` holds that archive
- **THEN** `status --to done` writes the status

### Requirement: The other statuses need no evidence and no order

`exploring`, `explored`, `proposing`, `applying` and `archiving` SHALL be
written without evidence, and `status` SHALL NOT check the order of the
statuses: a move the order skips passes when the WIP limit has room. Order is
held only once a failure shows the need (roadmap clarification 11).

#### Scenario: A jump the order skips

- **WHEN** the card reads `approved`, the range has room, and `--to` is
  `archiving`
- **THEN** `status` writes the status

#### Scenario: Explored needs no evidence

- **WHEN** the card reads `exploring` and `--to` is `explored`
- **THEN** `status` reads no tree and writes the status

### Requirement: Status fails closed and records each refusal

A Notion read that fails, no ask settings, or a card on no board SHALL
refuse. Each refusal SHALL exit 1, write nothing in Notion, and append one
gate-ledger record under gate `status` with its own id. A write SHALL print
the status the card reads back from Notion's answer, and exit 0.

#### Scenario: Notion does not answer

- **WHEN** the card's page read fails
- **THEN** `status` refuses, exits 1, and the ledger gains one `status`
  record

#### Scenario: A move written

- **WHEN** a move passes every check
- **THEN** `status` writes the card's `Status`, prints the card, the old and
  the new status as Notion answered it, and exits 0

### Requirement: The connector's Status write is refused in the harness

In the harness's own sessions a `PreToolUse` hook on the connector's
`notion-update-page`, under any server name, SHALL refuse a call whose
`properties` carry `Status`, whatever its command, naming `bun bun/work.ts
status`, and record it. Every other call, and an event it cannot read, SHALL
pass. It SHALL be registered in the harness's `.claude/settings.json` alone.

#### Scenario: A status set through the connector

- **WHEN** a session calls `notion-update-page` with `update_properties` and
  `properties` holding `Status`
- **THEN** the call is refused, naming `bun bun/work.ts status`

#### Scenario: Assign alone

- **WHEN** the call's `properties` hold `Assign` and no `Status`
- **THEN** the hook lets it through

#### Scenario: An event it cannot read

- **WHEN** the event is not JSON
- **THEN** the hook lets the call through

#### Scenario: A consumer's settings

- **WHEN** `sync` writes a consumer's `.claude/settings.json`
- **THEN** the status hook is not among the hooks it writes, and a sync of
  the harness's own settings keeps it
