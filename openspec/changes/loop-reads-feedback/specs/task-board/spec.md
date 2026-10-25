## MODIFIED Requirements

### Requirement: A board records a task's status and nothing the tree holds

The project SHALL keep its tasks on boards in the Notion workspace, on which
every task not yet finished, and every change already archived, has exactly
one card. A card SHALL carry its status, a title, a pointer to where its content
lives, and a summary, and SHALL NOT carry a copy of anything else the
repository holds. The summary is the one exception and is bounded: about 500
characters, enough to rank a card by and too few to restate a proposal. It MAY
run longer where the extra text is context the ranking needs — a decision the
user took, what the card waits on — and SHALL NOT restate a proposal at any
length.
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

### Requirement: A card can be ranked without opening the repository

Every card short of `done` SHALL carry an English title saying what the change
does, never its slug, and a body opening with a summary in Russian of about
500 characters: what changes, why, and how large it is, longer only for context
the ranking needs, never a restated proposal. The body SHALL end
with links on GitHub to the change's `proposal.md` once merged and to every
pull request it opens, each added in the turn that pull request opens. At
archive, the `proposal.md` link SHALL follow the file to its archived path.

#### Scenario: A card short of done

- **WHEN** the user reads a card at any status before `done`
- **THEN** its title says what the change does, its body opens with a Russian
  summary of about 500 characters, and every pull request the change has
  opened is linked under it

#### Scenario: A summary that carries context

- **WHEN** a card's summary needs a decision the user took, or what the card
  waits on, to be ranked
- **THEN** the summary MAY pass 500 characters to hold it, and still restates
  no proposal

