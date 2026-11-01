# work-finish — delta

## ADDED Requirements

### Requirement: Finish records its pull request on the card

`finish` given `--card`, once its pull request exists, opened by that call or
already open, SHALL read which change directories the branch adds files to
against its merge base with `origin/main`, fetched first, renames read as a
deletion and an addition: directories under `openspec/changes/` other than
`archive/`, and directories under `openspec/changes/archive/`. When there is
exactly one, `finish` SHALL write
that directory's path, with a trailing slash, to the card's `Pointer` where
the `Pointer` is empty or names the same slug's unarchived directory, and
SHALL read it back. A card on a board other than the one the repository
names takes the cross-repository form, the repository's name, a colon and a
space before the path, and a `Pointer` already in that form for this
repository keeps it. It SHALL leave alone a `Pointer` that already says it,
and, saying so, a `Pointer` in any other form: `pr:<N>`, another change,
another repository's. A branch adding files to no change directory or to
several SHALL write no `Pointer` and SHALL say so.

`finish` SHALL then put the pull request on the card's `Ссылки` list as
`[#N](<url>) — <kind>`, the kind `proposal` when the branch adds a
`proposal.md`, `design.md` or `tasks.md` to a directory outside `archive/`,
else `archive` when it adds files to a directory inside it, else `apply`,
unless a block of the card
already links that pull request. The item SHALL go directly under the
items already following the `Ссылки` line, and a card with no `Ссылки` line
SHALL get one at the end of its body. Both writes SHALL come after the push
and before the question read. The record is auxiliary: an `origin/main` that
cannot be fetched or a merge base that cannot be found SHALL write neither
and say so in one line, and a read or write Notion refuses or does not answer
SHALL stop the record and be said in one line naming the step; in each case
`finish` SHALL go on to the question read and the ready switch, and a later
`finish` writes only what is missing. Without `--card`, `finish` SHALL write
nothing to Notion.

#### Scenario: A proposal's first finish

- **WHEN** a branch adds `openspec/changes/foo/`, the card's `Pointer` is
  empty and its body has no `Ссылки` line, and `finish --card` opens #370
- **THEN** the `Pointer` reads `openspec/changes/foo/`, the body ends with a
  `Ссылки` line and `[#370](<url>) — proposal` under it, and `finish` goes on
  to the question read

#### Scenario: A second finish on the same pull request

- **WHEN** `finish --card` runs again on that branch after a push, its pull
  request a draft again
- **THEN** it writes neither the `Pointer` nor a second link, and says the
  `Pointer` already names the change

#### Scenario: An archive branch

- **WHEN** the branch moves `openspec/changes/foo/` to
  `openspec/changes/archive/2026-11-02-foo/` and the `Pointer` reads
  `openspec/changes/foo/`
- **THEN** the `Pointer` reads `openspec/changes/archive/2026-11-02-foo/`
  and the link's kind is `archive`

#### Scenario: An apply branch

- **WHEN** the branch edits `openspec/changes/foo/tasks.md` and code, adds
  no file under `openspec/changes/`, and the `Pointer` reads
  `openspec/changes/foo/`
- **THEN** the `Pointer` stays, `finish` says the branch adds files to no
  change directory, and the link's kind is `apply`

#### Scenario: An apply branch adding a delta spec

- **WHEN** the branch adds `openspec/changes/foo/specs/x/spec.md` to a change
  its base already holds, and no `proposal.md`, `design.md` or `tasks.md`
- **THEN** the link's kind is `apply`

#### Scenario: A branch whose change cannot be told

- **WHEN** no merge base with `origin/main` is found, as in a shallow clone
- **THEN** `finish` writes neither the `Pointer` nor the link, says it could
  not tell the branch's change, and goes on to the question read and the
  ready switch

#### Scenario: A fix card

- **WHEN** the card's `Pointer` reads `pr:350` and the branch adds no file
  under `openspec/changes/`
- **THEN** the `Pointer` stays `pr:350`

#### Scenario: A main that archived a change after the branch forked

- **WHEN** `origin/main` archived `openspec/changes/bar/` after the branch's
  merge base, and the branch adds only `openspec/changes/foo/`
- **THEN** `finish` writes `openspec/changes/foo/`, not reading `bar` as
  added

#### Scenario: A proposal's second half

- **WHEN** a `-plan` branch adds `design.md` and `tasks.md` to
  `openspec/changes/foo/`, which its base already holds, and the card's
  `Pointer` is empty
- **THEN** the `Pointer` reads `openspec/changes/foo/`, and the link's kind
  is `proposal`

#### Scenario: A card on another repository's board

- **WHEN** the card's `Pointer` is empty, it sits on a board the repository
  does not name, and the branch adds `openspec/changes/foo/` in `harness`
- **THEN** the `Pointer` reads `harness: openspec/changes/foo/`

#### Scenario: Several added directories

- **WHEN** the branch adds `openspec/changes/foo/` and
  `openspec/changes/bar/`
- **THEN** the `Pointer` is left as it is, `finish` says the branch adds
  files to two change directories, and the link's kind is `proposal`

#### Scenario: A write Notion refuses

- **WHEN** Notion answers the block append with 403
- **THEN** `finish` names the step and the status in one line, goes on to
  the question read and the ready switch, and a later `finish` adds only the
  missing link
