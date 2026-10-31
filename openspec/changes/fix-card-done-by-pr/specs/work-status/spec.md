# work-status — delta

## MODIFIED Requirements

### Requirement: Merged statuses are proven on origin/main

For `--to proposed`, `applied` or `done`, `status` SHALL fetch `main` from
`origin` and read the evidence from the `openspec/changes` tree of
`origin/main` alone — never the checkout's files, `HEAD` or local `main`. A
fetch or a tree read that fails SHALL refuse. A card whose `Pointer` names a
pull request is proven by GitHub instead, and SHALL NOT fetch or read the
tree (*A fix card's done is proven by its merged pull request*).

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

### Requirement: The card's Pointer names the change proven

For a merged status, the change SHALL be the one the card's `Pointer` names
when it is wholly `openspec/changes/<slug>/`, with that slug active or
archived on `origin/main`, or `openspec/changes/archive/<date>-<slug>/`, with
that directory there. The same path behind this repository's own name, as
task-board's cross-repository form writes it, SHALL count alike. A `Pointer`
naming a pull request is read by *A fix card's done is proven by its merged
pull request*. An empty, decorated or other repository's `Pointer`, or a path
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

#### Scenario: An archive dated otherwise

- **WHEN** the `Pointer` is `openspec/changes/archive/2026-10-27-foo/` and
  `origin/main` holds `foo` active and no archive of that name
- **THEN** `status --to proposed` refuses

#### Scenario: This repository's change from another board

- **WHEN** the `Pointer` is `harness: openspec/changes/foo/` in the harness,
  and `origin/main` holds `foo`
- **THEN** it is read as `openspec/changes/foo/`, and `d2ass:
  openspec/changes/foo/` refuses

## ADDED Requirements

### Requirement: A fix card's done is proven by its merged pull request

When the card's `Pointer` is wholly `pr:<N>`, `N` a positive whole number with
no leading zero, or that behind this repository's own name, `status --to done`
SHALL read pull request `N` of the repository `origin` names from GitHub, and
SHALL write only when it is merged and its base branch is `main`. `--to
proposed` or `applied` with such a `Pointer` SHALL refuse without the read. A
read that fails SHALL refuse.

#### Scenario: A pull request merged into main

- **WHEN** the `Pointer` is `pr:350` and pull request 350 of `origin`'s
  repository is merged into `main`
- **THEN** `status --to done` writes the status, and fetches nothing from
  `origin`

#### Scenario: A pull request still open

- **WHEN** pull request 350 is open, or a draft
- **THEN** `status --to done` refuses naming it, and writes nothing

#### Scenario: A pull request closed without merging

- **WHEN** pull request 350 is closed and not merged
- **THEN** `status --to done` refuses and writes nothing

#### Scenario: A pull request merged into another branch

- **WHEN** pull request 350 is merged into `release`
- **THEN** `status --to done` refuses naming the base, and writes nothing

#### Scenario: Applied asked of a pull request

- **WHEN** the `Pointer` is `pr:350` and `--to` is `applied` or `proposed`
- **THEN** `status` refuses without reading the pull request

#### Scenario: A pull request from another board

- **WHEN** the `Pointer` is `harness: pr:350` in the harness
- **THEN** it is read as `pr:350`, and `d2ass: pr:350` refuses quoting it

#### Scenario: A pointer that is not a number

- **WHEN** the `Pointer` reads `pr:abc`, `pr:0`, `pr:035`, `pr: 350`,
  `PR:350`, `#350` or `pr:350 (fix)`
- **THEN** `status --to done` refuses quoting it, without reading a pull
  request

#### Scenario: GitHub does not answer

- **WHEN** `gh` exits non-zero, does not answer within its limit, prints what
  is not a pull request, or `origin` names no owner and repository
- **THEN** `status --to done` refuses and writes nothing

#### Scenario: A proven pull request at a full limit

- **WHEN** the card reads `approved`, five cards are in the range, and pull
  request 350 is merged into `main`
- **THEN** `status --to done` makes no count and writes the status
