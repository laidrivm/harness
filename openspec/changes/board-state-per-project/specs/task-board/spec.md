# task-board — delta spec

## MODIFIED Requirements

### Requirement: There are three boards and a card goes to one of them

The routing rule SHALL name three boards — `D2ASS` for d2ass's product work,
`Harness` for the work on the agent scaffolding, and `mellon` for the second
project that sits on that scaffolding — and every card SHALL sit on the board
of the repository that owns its work. Which of the three a repository's own
tree decides is the name that repository gives under `harness.board`, which
*A repository names the board its tree decides* fixes.

A board SHALL exist for each of those repositories that exists, and SHALL NOT
be created before one does. All three exist. The rule named the third before
its repository did, because naming is what makes it complete — an empty
board kept in step with two others serves no reader, where a rule that stops
at two leaves a session with nowhere to look second.

The scaffolding has a repository of its own, and `mellon` is a third. So the
three boards are not three views of one project: they are three trees, and a
session reads exactly one of them — the one its repository names. That is
what makes the routing rule load-bearing rather than tidy — a session that
cannot find a card has to know which board to look at second, and the rule is
what tells it, in place of searching all three.

A card SHALL NOT be duplicated across boards, and work that would sit on two
SHALL be split into the cards each board owns rather than mirrored.

#### Scenario: Work on this repository's product

- **WHEN** a card names work whose files are under d2ass's `src/`, `e2e/` or
  its specs for the product
- **THEN** it SHALL sit on `D2ASS`

#### Scenario: Work on the agent scaffolding

- **WHEN** a card names work on the rulebook, the review toolkit, the gates,
  the skills or the workflow
- **THEN** it SHALL sit on `Harness`, whichever repository the session
  that found it was working in

#### Scenario: A card whose board holds no tree here

- **WHEN** a session reads a card on a board other than the one its
  repository's `harness.board` names
- **THEN** it SHALL treat the card as the whole record, and SHALL NOT report
  the absence of a matching directory in this repository as a discrepancy

#### Scenario: A card on the board this repository names

- **WHEN** a session in the harness's own repository reads a card on
  `Harness` whose `Pointer` names a directory under `openspec/changes/`
- **THEN** the card SHALL be read against this tree like any card on the
  board a repository names, and its absence from `D2ASS`'s tree SHALL NOT
  exempt it

### Requirement: Three statuses are derived and six are moved by hand

A card SHALL hold exactly one of nine statuses, one per handover between
OpenSpec stages:

- `idea` — entered for a later explore;
- `exploring` — a session has started exploring and has not gathered the
  context yet;
- `explored` — the context is gathered, and saved where a proposal will need
  it;
- `proposing` — a session is writing the proposal, through its review and
  merge;
- `proposed` — the proposal is merged, and a session may take it to apply
  from a cleared context;
- `applying` — a session is applying it, through review, until its last
  pull request merges;
- `applied` — the change is merged and waits to be archived;
- `archiving` — a session is running the archive;
- `done` — archived; the change has been through the whole cycle.

The nine SHALL be the **options** of each board's `Status` property, named
exactly as listed above, and that property SHALL be of Notion's `select`
type rather than its `status` type. What a card carries and what anything in
this repository names is an option's **name**, which is what a read returns
and a write sets. An option additionally carries a
`collectionPropertyOption://` URL, which is its stable identity and is an
identifier for private content: it SHALL NOT be written into this public
repository, which refers to an option by name only.

`select` rather than `status` is forced rather than preferred. Measured
against the live connector, a `status` property takes no option list through
the DDL surface — `ALTER COLUMN "Status" SET STATUS('suggested':gray, …)`
fails validation at the character after `SET STATUS`, the type being terminal
in that grammar — while the identical eight options on a `select` are
accepted in one statement. Keeping `status` would make the vocabulary a
manual precondition on every board, which an apply stage can verify by
reading but never perform.

What `status` would have bought is Notion's fixed group keys, and nothing in
this contract reads them. What it costs is that the board's columns are its
options directly, with no second grouping level to choose wrongly.

The nine SHALL be the **complete** option list of that property, not an
addition to it: on every board the property SHALL be set to exactly these
nine, and any option a board carried before SHALL cease to exist. An option
kept beside them would be a status no requirement here names and a
reconciliation would never correct.

No card SHALL lose its status when the list changes. A card at a retired
option SHALL be carried to its successor before that option goes: `suggested`
to `idea`, `ready` to `proposed`, and `implementing` and `reviewing` to
`applying`.

The same setting applies to `mellon` when that board is provisioned, so that
a board created later is not a board with a different vocabulary.
A board whose options differ is a board whose view cannot be read by the
instruction that reads the others, and the routing rule would then have to
carry a per-board vocabulary as well as a per-board address.

A board's view MAY hide a column whose status holds no card, and this SHALL
NOT be read as the status being absent. The vocabulary is fixed here, in a
file in the repository, and never learned from the view — which is what makes
the hidden column harmless: a status with no cards has no work in it, and a
session reads the view to find work.

Derivation SHALL apply to the board the running repository's `harness.board`
names, and to no other. That is the one board whose tree is the repository
`bun/board-state.ts` runs in, so it SHALL report nothing for a card on either
of the other two, and a reconciliation run from that repository SHALL leave
those cards untouched — on the same terms it leaves the six hand-moved
statuses, and for the same reason: what would decide them is not readable
from here. Each board is derived from its own repository: `D2ASS` from
d2ass, `Harness` from the harness, `mellon` from mellon.

The distinction is not that the other boards are less important. It is that a
derivation reading this file tree can only be right about this repository,
and a derivation that runs anyway would report `idea` for every card on
a board whose work is proceeding elsewhere — a wrong answer delivered with
the same confidence as the 30/30 one.

`bun/board-state.ts` SHALL derive three statuses from the file tree alone
— `proposing`, `proposed` and `done` — reading no network and consulting no
service, so that its whole behaviour is exercisable from a fabricated
directory:

```text
done        openspec/changes/archive/<date>-<slug>/ exists
proposed    openspec/changes/<slug>/ holds proposal, design, tasks and specs/
proposing   openspec/changes/<slug>/ exists and is missing one of them
```

A derived status is a floor, not a value. `proposed` holds for a change from
the merge of its proposal until its archive, so a card at `applying`,
`applied` or `archiving` agrees with it, and only a card behind its derived
status disagrees.

The remaining six SHALL be moved by whoever does the work, in the turn the
work moves, and `bun/board-state.ts` SHALL NOT report them. Deriving them
was measured and refused: applied to the thirty archived changes, a
branch-name derivation gets fourteen wrong. Nine of those changes have no
`feat/<slug>` pull request at all, their work having shipped on `chore/` and
`fix/` branches that `core/git-and-prs.md` permits; and a step splits, so
`snapshot-build`'s eight steps merged as sixteen pull requests and
`file-size-cap`'s eight as twenty-two, which makes "pull requests at least
steps" a coincidence rather than a test. No key in this repository joins a
pull request to its change.

#### Scenario: A card at a retired status

- **WHEN** the option list is replaced while a card sits at `suggested`,
  `ready`, `implementing` or `reviewing`
- **THEN** that card SHALL read its successor afterwards, and no card on
  either board SHALL read empty

#### Scenario: A status holding no cards

- **WHEN** a board's view shows fewer than nine columns because some
  statuses hold no card
- **THEN** the missing statuses SHALL still be writable by name, and the
  view SHALL NOT be treated as the list of statuses that exist

#### Scenario: A complete change directory, no step applied

- **WHEN** a directory under `openspec/changes/` holds `proposal.md`,
  `design.md`, `tasks.md` and a `specs/` directory
- **THEN** the derived status SHALL be `proposed`

#### Scenario: A change directory missing an artefact

- **WHEN** a directory holds `proposal.md` and delta specs but no `tasks.md`,
  as a split proposal's first branch leaves it
- **THEN** the derived status SHALL be `proposing`, and SHALL NOT be `proposed`

#### Scenario: A change directory whose specs/ is empty

- **WHEN** a directory holds all three markdown artefacts and a `specs/`
  directory containing no delta spec
- **THEN** the derived status SHALL be `proposing` — the artefact is the
  delta, not the directory that would hold one, and a change with nothing to
  sync is not ready to apply

#### Scenario: A slug reported at no status at all

- **WHEN** a slug has no directory under `openspec/changes/` and none under
  `openspec/changes/archive/`
- **THEN** the output SHALL carry no entry for that slug at all, and SHALL NOT
  carry one whose status is `null`, `unknown` or `idea` — an absent key
  is the only shape a caller cannot mistake for a derived value, and
  `idea` is a status the script never derives

#### Scenario: An archived change

- **WHEN** a slug has a directory under `openspec/changes/archive/`
- **THEN** the derived status SHALL be `done`, whatever else the tree holds
  for that slug

#### Scenario: A status the tree cannot see

- **WHEN** a card sits at a status the derivation never reports, at or beyond
  the floor the tree derives for that slug
- **THEN** a reconciliation SHALL leave it untouched rather than resetting it
  to a derived value, and `bun/board-state.ts` SHALL NOT read the card to
  decide: it reports a slug from the tree alone, so a change at `applying`
  still derives `proposed`, the floor its card has already passed

#### Scenario: The derivation reaches no network

- **WHEN** `bun/board-state.ts` runs with no network route and no
  connector attached
- **THEN** it SHALL produce its full output — the name of its repository's
  board, the three derived statuses and the blocking edges, and none of the
  six it never reports — every value in it coming from the repository's
  files

#### Scenario: A card on a board whose tree is elsewhere

- **WHEN** a card sits at any status on a board other than the one the
  running repository's `harness.board` names
- **THEN** `bun/board-state.ts` SHALL report nothing for it, SHALL NOT name
  that board, and SHALL NOT report it as a card the tree is missing a
  directory for

## ADDED Requirements

### Requirement: A repository names the board its tree decides

A repository SHALL name, under `harness.board` in its `package.json`, the one
board whose cards its tree decides, by the name *There are three boards and a
card goes to one of them* gives it. `bun/board-state.ts` SHALL print that name
with what it derives, SHALL fail naming the key when it is absent, and SHALL
refuse a value that is not a name.

#### Scenario: The key is absent

- **WHEN** `bun/board-state.ts` runs in a repository whose `package.json` has
  no `harness.board`
- **THEN** it SHALL fail naming `harness.board` and the file, and SHALL print
  no statuses — a derivation with no board to carry it to is half an answer

#### Scenario: The key holds an identifier rather than a name

- **WHEN** `harness.board` holds a value carrying `://`, or a UUID with or
  without its hyphens, in either case
- **THEN** `bun/board-state.ts` SHALL fail naming the key, and SHALL NOT echo
  the value

#### Scenario: The key holds no name at all

- **WHEN** `harness.board` holds an empty or whitespace-only string, or a value
  that is not a string
- **THEN** `bun/board-state.ts` SHALL fail naming the key

#### Scenario: The harness reads its own board

- **WHEN** `bun/board-state.ts` runs in the harness's own repository
- **THEN** it SHALL print `Harness` as its board beside the statuses its own
  `openspec/changes/` derives

### Requirement: A board is reconciled when it is read and when a session ends

A session SHALL reconcile its repository's board at two moments: at the
`Board view` read it makes to choose work, and at `session-wrapup`, for the
cards the session's own changes point at. Each moment runs
`bun/board-state.ts`. It then compares every card whose `Pointer` is wholly a
directory of this tree with the floor printed for that slug, corrects a card
behind it, and reports each correction.

#### Scenario: A card behind its floor at the board read

- **WHEN** a session reads its board's `Board view` to choose work and a card
  whose `Pointer` names `openspec/changes/archive/<date>-<slug>/` reads
  `proposed`
- **THEN** in that turn it SHALL set the card to `done`, re-read it, and report
  the correction

#### Scenario: A stage moved and its card forgotten

- **WHEN** a session archives a change and reaches `session-wrapup` with that
  change's card still at `archiving` or earlier
- **THEN** the wrap-up SHALL set the card to `done`, re-read it, and report the
  correction, before the next session's board read could find it

#### Scenario: A session that touched no change

- **WHEN** `session-wrapup` runs in a session whose work pointed at no change
  directory
- **THEN** it SHALL report that it reconciled nothing, and SHALL NOT read the
  rest of the board

#### Scenario: A card whose pointer names no directory of this tree

- **WHEN** a card on the board this repository names carries a `Pointer` that
  is empty, or carries text around a path, in a form other than the
  cross-repository one
- **THEN** the reconciliation SHALL NOT compare it, and SHALL list it as
  naming no directory of this tree rather than correcting it

#### Scenario: A well-formed pointer to a slug the tree lacks

- **WHEN** a card's `Pointer` is wholly `openspec/changes/<slug>/` or
  `openspec/changes/archive/<date>-<slug>/`, and the tree has no directory at
  that path
- **THEN** the reconciliation SHALL list the card as missing from the tree,
  and SHALL NOT change its status

### Requirement: A card for another repository's change points across

A card whose work lies in a change of another repository SHALL carry the
pointer `<repo>: openspec/changes/<slug>/`, or the archived path in the same
form: the repository's name, a colon and a space, then the path with nothing
after it. A task number SHALL go in the card's body. This is the one exception
to the repository-relative path *A board records a task's status and nothing
the tree holds* fixes. A reconciliation SHALL skip such a card without
comparing or listing it.

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
