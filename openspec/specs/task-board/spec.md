# task-board Specification

## Purpose

Where a task's status is recorded and read, which of the nine statuses the
file tree derives and which are moved by hand, how a session reads a board,
and what a card may not hold. It exists because a status is a fact somebody
has to remember and type, and a file is the wrong instrument for one: the
queue this replaces drifted twice in the week the change was proposed, and
nothing read an entry to check it.

The boards are not in this repository and this repository is public, so what
is written here is a board's name, a view's name and an option's name — never
a URL, which is an identifier for private content.

## Requirements

### Requirement: A board records a task's status and nothing the tree holds

The project SHALL keep its tasks on boards in the Notion workspace, on which
every task not yet finished, and every change already archived, has exactly
one card. A card SHALL carry its status, a title, a pointer to where its content
lives, and a summary, and SHALL NOT carry a copy of anything else the
repository holds. The summary is the one exception and is bounded: at most 500
characters, enough to rank a card by and too few to restate a proposal.
*A card can be ranked without opening the repository* fixes what it says.

The pointer SHALL be a **property** of the card rather than a line of its
body. A property is what a view can display and a query can filter on; a line
of prose is neither, and a pointer that cannot be read without opening the
card is not what the saved view exists to spare a session. Neither live board
carries such a property today — `Name`, `Status` and `Assign` are the whole
schema of both — so it is added before the first card is written.

The property SHALL be named `Pointer` and SHALL be of Notion's `rich_text`
type, on every board, so that one instruction reads all of them. Its value
SHALL be a repository-relative path with a trailing slash —
`openspec/changes/<slug>/` or `openspec/changes/archive/<date>-<slug>/` — and
SHALL read as empty, rather than as absent, where the card has no directory.

How `rich_text` encodes those two states on the wire is not fixed here and
SHALL be measured before the first card is written. It was unmeasured when
this requirement was written — Notion's REST surface takes a `rich_text`
value as an array of rich-text objects rather than a scalar, and no write
through this project's connector had been made to see what that surface
accepts — and what the measurement found belongs wherever the run that made
it recorded it, never here. A requirement naming an encoding nobody has
exercised is the kind this capability has already paid for once, in the
status property whose options turned out not to be settable at all; a
requirement naming one somebody has is wrong the day the connector changes
its surface.

`rich_text` rather than `url`, because a repository-relative path is not a
URL: a `url` property holding one either renders a broken link or forces an
absolute address that pins the card to a host and a default branch name,
both facts about today rather than about the change. Not a `relation`, which
joins rows across a boundary the blocking requirement below closes. Empty
rather than absent, because a card whose body is the record
is a state this capability provides for, and an unset property is
indistinguishable from one nobody has filled in yet.

The prohibition is the requirement's substance rather than its caveat. The
queue this board replaces held a thirteen-line prose entry for each of
nineteen changes whose `proposal.md`, `design.md`, `tasks.md` and delta specs
were already in the tree — restating what a directory beside them said better.
Two of those entries were wrong within a week of being written. A second copy
is checked by nothing.

Where a card's subject has a directory, the pointer SHALL be that path. Where
it has none — a finding not yet proposed, or a task brief that predates the
change directories — the card body is the record, and it SHALL hold what a
proposal would need: what was observed, where, and what makes it work rather
than an opinion.

A card SHALL keep its identity across that boundary, WHERE the card's owning
tree is this repository. WHEN a directory is created here for such a card that
had none, the **same card** SHALL gain the pointer and lose the record its body held,
keeping its summary and links, rather
than a second card being made beside it. What the body
held has by then been written into `proposal.md`, so keeping it leaves two
accounts of one thing with only one of them reviewed — which is the duplication
this requirement exists to prevent, arriving by the one route the rest of it
does not close.

Every `D2ASS` card that is not `done` crosses this boundary eventually: nine
of the twenty-one entries this change moves to that board are findings with
no directory, and each becomes a change or is dropped. A card on `Harness` or
`mellon` SHALL NOT be required to cross it — their trees are not here, so the
directory that would supply the pointer can never appear, and a rule waiting
for it would hold every such card permanently in breach.

#### Scenario: A card for a change that exists in the tree

- **WHEN** a card names a change with a directory under `openspec/changes/`
- **THEN** it SHALL carry that path and its summary, and SHALL NOT otherwise
  restate the change's why, its scope, its measurements or its ordering

#### Scenario: A card for a finding with no change

- **WHEN** a card names work that has no directory anywhere in the tree
- **THEN** the card body SHALL be the record, and no file in the repository
  SHALL be expected to hold it

#### Scenario: A finding that becomes a change

- **WHEN** `openspec/changes/<slug>/` is created for a card that carried its
  record in its body
- **THEN** that card SHALL gain the path as its pointer and its body SHALL be
  cut to its summary and links in the same turn, and no second card SHALL be created for the change

#### Scenario: A card and the tree disagreeing

- **WHEN** a card sits behind the status the file tree derives for it
- **THEN** the tree SHALL be taken as right and the card corrected, the board
  being authoritative only for what the tree cannot express — a card past the
  derived status agrees with it and is left alone

### Requirement: There are three boards and a card goes to one of them

The routing rule SHALL name three boards — `D2ASS` for this repository's
product work, `Harness` for the work on the agent scaffolding, and `mellon`
for the second project that will sit on that scaffolding — and every card
SHALL sit on the board of the repository that owns its work.

A board SHALL exist for each of those repositories that exists, and SHALL NOT
be created before one does: `D2ASS` and `Harness` today, `mellon`'s on the day
that repository is. The rule names the third anyway, because naming is what
makes it complete — an empty board kept in step with two others serves no
reader, where a rule that stops at two leaves a session with nowhere to look
second.

The scaffolding is to leave for a repository of its own, and `mellon` is a
repository this one does not contain. So the three boards are not three views
of one project: they are three trees, only one of which is readable from
here. That is what makes the routing rule load-bearing rather than tidy — a
session that cannot find a card has to know which board to look at second,
and the rule is what tells it, in place of searching all three.

A card SHALL NOT be duplicated across boards, and work that would sit on two
SHALL be split into the cards each board owns rather than mirrored.

#### Scenario: Work on this repository's product

- **WHEN** a card names work whose files are under `src/`, `e2e/` or this
  repository's specs for the product
- **THEN** it SHALL sit on `D2ASS`

#### Scenario: Work on the agent scaffolding

- **WHEN** a card names work on the rulebook, the review toolkit, the gates,
  the skills or the workflow
- **THEN** it SHALL sit on `Harness`, whether or not that work is still
  carried out in this repository

#### Scenario: A card whose board holds no tree here

- **WHEN** a session reads a card on `Harness` or `mellon`
- **THEN** it SHALL treat the card as the whole record, and SHALL NOT report
  the absence of a matching directory in this repository as a discrepancy

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

Derivation SHALL apply to `D2ASS` alone. It is the only board whose tree is
this repository, so `scripts/board-state.ts` SHALL report nothing for a card
on `Harness` or `mellon` and a reconciliation SHALL leave those cards
untouched — on the same terms it leaves the six hand-moved statuses, and for
the same reason: what would decide them is not readable from here. Every card
on those two boards is therefore hand-moved, whatever its status.

The distinction is not that the other boards are less important. It is that a
derivation reading this file tree can only be right about this repository,
and a derivation that runs anyway would report `idea` for every card on
a board whose work is proceeding elsewhere — a wrong answer delivered with
the same confidence as the 30/30 one.

`scripts/board-state.ts` SHALL derive three statuses from the file tree alone
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
work moves, and `scripts/board-state.ts` SHALL NOT report them. Deriving them
was measured and refused: applied to the thirty archived changes, a
branch-name derivation gets fourteen wrong. Nine of those changes have no
`feat/<slug>` pull request at all, their work having shipped on `chore/` and
`fix/` branches that `docs/git-and-prs.md` permits; and a step splits, so
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
  to a derived value, and `scripts/board-state.ts` SHALL NOT read the card to
  decide: it reports a slug from the tree alone, so a change at `applying`
  still derives `proposed`, the floor its card has already passed

#### Scenario: The derivation reaches no network

- **WHEN** `scripts/board-state.ts` runs with no network route and no
  connector attached
- **THEN** it SHALL produce its full output — the three derived statuses and
  the blocking edges, and none of the six it never reports — every value in
  it coming from the file tree

#### Scenario: A card on a board whose tree is elsewhere

- **WHEN** a card sits on `Harness` or `mellon` at any status
- **THEN** `scripts/board-state.ts` SHALL report nothing for it, and SHALL
  NOT report it as a card the tree is missing a directory for

### Requirement: A card names what blocks it, derived from the tree

A card SHALL name the tasks that must land before it can be taken up, and
`scripts/board-state.ts` SHALL derive that set from an `after:` list in each
change's `.openspec.yaml` — never from the board, and never from the prose of
a proposal's `## Ordering`.

An `after:` edge SHALL NOT cross a board. A slug identifies a change
directory in *this* repository, and nothing identifies one in the repository
`Harness` is leaving for or in `mellon`'s — the same absent key that stops
the middle statuses deriving. A dependency that genuinely crosses repositories
SHALL be written in the depending card's body as prose, where its being
unchecked is visible, rather than as an `after:` entry the derivation would
have to resolve and could not.

A change's `after:` list SHALL name the slugs its `## Ordering` section
argues for, and that section SHALL keep the argument: the list is the fact and
the prose is the reason, so a reader asking *why* this order is not sent to a
YAML file and a session asking *what is takeable* is not sent to sixteen
proposals.

A card whose `after:` names a slug that is not `done` SHALL be reported as
blocked, and a session choosing work SHALL NOT take it. Blocked SHALL be
**computed at the time of asking** rather than stored on the card: it is a
fact about what has landed, so a card that holds it goes stale the moment its
predecessor is archived, and nothing points at the staleness. What is stored
is the `after:` list, which changes only when the ordering argument does.

This is worth deriving where `implementing` was not, and the difference is
that a key exists. `## Ordering` names its predecessors as slugs, and a slug
is exactly what identifies a change directory; the pull-request derivation
failed because nothing joined a pull request to its change. Prose is still
not the source — *after `laning-phase-model`*, *`candidacy-gate` must be
applied and synced first*, and *SHOULD NOT be applied before
`outcome-calibration`* are three phrasings of one relation and one of them is
a negation, so the list is written rather than parsed out.

Measured on the prose as it stands. Six of the seventeen changes have a
predecessor, and taking every change slug an `## Ordering` section mentions
gets the predecessor set right for two of them. For the other four it adds
slugs that are not dependencies — a section argues about the changes around
it, not only the ones before it — and for two of those four the added slug is
a **successor** read as a predecessor: `laning-phase-model`'s section names
`suggestion-calibration`, which comes after it, and `lane-synergy-model`'s
does the same. An edge derived backwards blocks a task on work that is
waiting for it.

#### Scenario: A change whose predecessor has not landed

- **WHEN** a card's `after:` names a slug whose derived status is not `done`
- **THEN** the card SHALL be reported as blocked by that slug, and a session
  choosing work SHALL pass over it

#### Scenario: A change whose predecessors have all landed

- **WHEN** every slug in a card's `after:` is `done`
- **THEN** the card SHALL be reported as takeable, and the `after:` list SHALL
  NOT be emptied — what unblocked it stays readable

#### Scenario: A change with no ordering constraint

- **WHEN** a change's `.openspec.yaml` carries no `after:` key, as eleven of
  the seventeen do
- **THEN** it SHALL be reported as takeable, and the absent key SHALL NOT be
  read as an unmeasured or malformed one

#### Scenario: An `after:` naming a slug that does not exist

- **WHEN** an `after:` list names a slug with no directory under
  `openspec/changes/` and none under `openspec/changes/archive/`
- **THEN** the derivation SHALL fail naming the slug and the file, rather than
  treating the unresolvable name as landed — a typo that reads as `done`
  unblocks a task nothing has unblocked

#### Scenario: An `after:` that is not a list

- **WHEN** an `after:` key holds a bare string rather than a list of slugs
- **THEN** the derivation SHALL fail naming the file, and SHALL NOT iterate
  the string — YAML admits the scalar silently, and a per-character walk
  yields slugs that resolve to nothing, which the scenario above then
  reports as a typo in a file whose real defect is its shape

### Requirement: The board is read through a saved view

A session SHALL read a board through a named saved view — `Board view`, a
board grouped by `Status`, for what is open, and `Done` for what is archived
— and SHALL NOT read the data source with a SQL query. No instruction SHALL
send a session to a view this capability does not name; a further view saved
for a question the named ones cannot express is named here in the change that
saves it, as `Done` is.

A view SHALL NOT be created where one of that name already serves. Read off
both live databases: each carries a saved view named `Board view`, of type
`board`, grouped by `Status`. `Done` is saved beside it because no view
answered what it answers, which is the clause below rather than an exception
to it.

A view SHALL follow its grouping property through a type change rather than
being rebuilt after one. Measured on `D2ASS`: converting `Status` from
Notion's `status` type to its `select` type moved the view's own
`propertyType` with it and left view-mode reads working. Two defaults
arrived with the conversion — empty groups hidden, and a manual column order
— and neither is settable through the connector, the view DSL having no
directive for either. Both are accepted: the requirement above fixes what a
session reads the view *for*, and neither an absent empty column nor a column
order bears on it. Where a question the view
cannot express is asked once, the session MAY issue that query and SHALL say
in the same turn that it spent the metered path and why; asked twice, it is a
view.

The view SHALL be identified by its name rather than by a URL pasted into an
instruction, and a session that cannot find a view by that name SHALL say the
view is missing rather than fall back to a query. This repository is public
and the board is not, so a view URL is an identifier for private content and
does not belong in a tracked file; the name does.

This is a quota, not a preference. On this workspace's plan `query_data_sources`
is limited: view mode carries no tool-specific quota on any plan, while SQL
mode draws on a shared workspace usage limit and cannot span data sources.
Reading the queue is the one operation every session performs, so putting it
on the metered path spends the limit on the routine case and leaves nothing
for the exceptional one.

#### Scenario: A session starting work

- **WHEN** a session needs to know what is open and at what status
- **THEN** it SHALL query the saved board view, and the view's grouping SHALL
  be what supplies the statuses rather than a filter written at the call site

#### Scenario: A question the view does not answer, asked twice

- **WHEN** a question the saved view cannot express is asked a second time
- **THEN** a further view SHALL be saved for it rather than the SQL query
  repeated

#### Scenario: The named view is missing

- **WHEN** no view of that name exists on the board
- **THEN** the session SHALL report the view as missing and SHALL NOT read the
  data source with a query instead — a silent fallback spends the metered path
  on the routine case, which is what the requirement exists to prevent

### Requirement: Each task brief becomes one card and the directory goes

Each of the nine briefs under `tasks/` SHALL become exactly one card, and
`tasks/` SHALL leave the tree. No brief has a change directory anywhere —
they predate OpenSpec in this repository — so each card is the case this
capability already provides for, where the body is the record and no file is
expected to hold it.

One card each, rather than one card for the six that are done. `PLAN.md`
collapsed tasks 1, 2, 3, 6, 8 and 9 into a single line, and that line was
why what each of them decided was unreadable without opening six files that
were about to stop existing. A card per brief is what makes *task 6 chose
`biome check --staged` without `--write`* answerable, where a card per line
of `PLAN.md` would have recorded only that six tasks finished.

A brief's card SHALL carry what the brief recorded — what the task was, and
where its decisions are live now. Five of the nine already state that in a
`> **Status: DONE.**` block naming the live configuration; that block is what
the body is built from, not the brief's full text, which is a plan for work
that is finished.

`tasks/task-5.md` is the one still open. Its card SHALL hold the brief's scope
rather than a pointer to a file that is gone, and is found on `D2ASS` like any
other card rather than through a list of sources.

A brief's card SHALL be titled with the brief's filename — `tasks/task-1.md`
and not *Task 1 — bun supply chain* — because that filename is the only key
any surviving citation carries. A brief card's pointer is empty, its body
being the record, so nothing else on the card could join a cited path to it,
and a title chosen for readability would leave the four citations resolving
to nothing.

#### Scenario: A brief that is done

- **WHEN** a brief carries a `Status: DONE` block naming the live
  configuration its work produced
- **THEN** its card SHALL be `done` and its body SHALL carry that block,
  and SHALL NOT carry the brief's plan of steps

#### Scenario: The brief still open

- **WHEN** the card for `tasks/task-5.md` is created
- **THEN** the card SHALL hold the brief's scope, and the path SHALL NOT
  survive anywhere as a live citation

#### Scenario: An archived change citing a brief by path

- **WHEN** an archived change names `tasks/task-1.md`, `tasks/task-7.md` or
  `tasks/task-8.md`, as four archived artefacts do
- **THEN** the archived change SHALL NOT be edited, and the cited path SHALL
  be the title of exactly one card — the archive records what was proposed at
  the time, and a path it named is a fact about that time

#### Scenario: The directory's row in the ownership map

- **WHEN** `tasks/` holds no tracked file
- **THEN** its row SHALL leave the `README.md` ownership map, because
  `scripts/repo-layout.ts` refuses a documented directory holding none — a
  stale row here fails a check rather than merely reading wrong

### Requirement: A stage that completes moves its card in the same turn

WHEN a task changes stage — a proposal merges, a step's branch opens, a pull
request opens or merges, a change is archived — the card SHALL be moved in the
same turn, before the work is reported as done.

This replaces the obligation `docs/feature-workflow.md` states towards
`PLAN.md`, and it exists because that obligation was not met twice in one
week: an entry read `not yet proposed` after its proposal merged, and the
entry recording the always-on measurement read 743 against a measured 851.
Moving the obligation to a board does not by itself fix that, and this
requirement is the part that has to be honoured rather than the part that is
mechanised — the three derived statuses are the ones a reconciliation can
repair, and these six are not.

#### Scenario: A proposal merges

- **WHEN** a change's `spec/<slug>` pull request merges and its directory
  becomes complete
- **THEN** the card SHALL read `proposed` in that same turn, and a later
  reconciliation SHALL find nothing to correct

#### Scenario: A stage moved and not recorded

- **WHEN** a reconciliation finds a card whose derived status disagrees with
  the tree
- **THEN** it SHALL be corrected and the correction SHALL be reported, a
  silent repair leaving nobody aware the obligation was missed

### Requirement: A card can be ranked without opening the repository

Every card short of `done` SHALL carry an English title saying what the change
does, never its slug, and a body opening with a summary in Russian of at most
500 characters: what changes, why, and how large it is. The body SHALL end
with links on GitHub to the change's `proposal.md` once merged and to every
pull request it opens, each added in the turn that pull request opens. At
archive, the `proposal.md` link SHALL follow the file to its archived path.

#### Scenario: A card short of done

- **WHEN** the user reads a card at any status before `done`
- **THEN** its title says what the change does, its body opens with a Russian
  summary of at most 500 characters, and every pull request the change has
  opened is linked under it

### Requirement: A column is a queue the user orders

A session SHALL read cards in the order `Board view` returns — one manual
order per board, each column its slice for one status — and SHALL take the
first card in its column that is not blocked. The user's drag sets that
order; a session SHALL NOT reorder cards. `done` SHALL NOT be a column of
`Board view`: its cards SHALL be read through a view named `Done`, latest
archived first.

#### Scenario: A card the user dragged up

- **WHEN** the user drags a card above others in its column
- **THEN** `Board view` returns it before them, and a session choosing work
  from that column takes it first unless it is blocked

#### Scenario: A card reaching done

- **WHEN** a card's status becomes `done`
- **THEN** `Board view` no longer shows it, and `Done` lists it above every
  card archived before it

### Requirement: The boards are named where a session chooses its next task

`docs/feature-workflow.md` SHALL name the three boards, the work each one
takes, and the saved view a session reads them through, each by its name. It
SHALL carry no board URL, view URL or Notion identifier, because this
repository is public and the boards are not. No file read at every session
start SHALL be needed to find a board.

#### Scenario: The workflow doc names the boards by name alone

- **WHEN** the check reads `docs/feature-workflow.md`
- **THEN** it finds `D2ASS`, `Harness`, `mellon` and `Board view`, and fails
  naming whichever is missing
- **AND** it fails on a Notion URL, a `collection://`, `view://` or
  `collectionPropertyOption://` reference, or a UUID in either case
