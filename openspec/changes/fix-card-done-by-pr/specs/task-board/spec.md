# task-board — delta

## MODIFIED Requirements

### Requirement: A card for another repository's change points across

A card whose work lies in a change of another repository SHALL carry the
pointer `<repo>: openspec/changes/<slug>/`, or the archived path in the same
form: the repository's name, a colon and a space, then the path with nothing
after it. A card whose work another repository's pull request closes SHALL
carry `<repo>: pr:<N>` in the same form. A task number SHALL go in the card's
body. This is an exception to the repository-relative path *A board records a
task's status and nothing the tree holds* fixes. A reconciliation SHALL skip
such a card without comparing or listing it.

#### Scenario: A consumer card for a harness change

- **WHEN** a card on `D2ASS` carries `harness:
  openspec/changes/archive/2026-10-08-ship-turn-gate-to-consumers/`
- **THEN** dota2's reconciliation SHALL neither compare it against dota2's
  tree nor list it, and SHALL leave its status as it is

#### Scenario: A cross-repository pointer with text after the path

- **WHEN** a card carries `harness: openspec/changes/<slug>/ — task 3.1`
- **THEN** the reconciliation SHALL list it as naming no directory of this
  tree, because the form allows nothing after the path

#### Scenario: Which task the card carries

- **WHEN** a consumer card carries one task of another repository's change
- **THEN** the task's number SHALL be written in the card's body, and the
  pointer SHALL hold the repository and the path alone

#### Scenario: A consumer card for a harness fix

- **WHEN** a card on `D2ASS` carries `harness: pr:350`
- **THEN** dota2's reconciliation SHALL neither compare nor list it

## ADDED Requirements

### Requirement: A fix card points at the pull request that closes it

A card whose work has no change directory, and which one pull request of this
repository closes, MAY carry the `Pointer` `pr:<N>`: `pr:`, then that pull
request's number, with nothing around it. The `Pointer` SHALL name that one
pull request; the others the work took SHALL stay under the card's links.
This is an exception to the repository-relative path *A board records a
task's status and nothing the tree holds* fixes. A reconciliation SHALL skip
such a card without comparing or listing it.

#### Scenario: A fix card closed by a pull request

- **WHEN** a card's work merged in #350 with no change directory
- **THEN** its `Pointer` MAY read `pr:350`, its body stays the record, and
  #350 is linked under its `Ссылки` as well

#### Scenario: Several pull requests for one card

- **WHEN** a fix took #338, #326 and #350, and #350 closes it
- **THEN** the `Pointer` reads `pr:350`, and #338 and #326 stay under
  `Ссылки`

#### Scenario: A reconciliation meets a pull-request pointer

- **WHEN** a reconciliation reads a card whose `Pointer` is wholly `pr:350`
- **THEN** it SHALL neither compare the card against the tree nor list it,
  and SHALL leave its status as it is

#### Scenario: Text around the number

- **WHEN** a card's `Pointer` reads `pr:350 (fix)` or `#350`
- **THEN** the reconciliation SHALL list it as naming no directory of this
  tree
