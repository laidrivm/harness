# board-loop — delta

## MODIFIED Requirements

### Requirement: A pass takes only a takeable change

A change SHALL be takeable when it is `proposed` (`bun/board-state.ts`) and
blocked by nothing in its `after:` list. Its `tasks.md` SHALL have a group
with an unticked box, and the first such group is the step. No open pull
request SHALL sit on that step's branch, as `git-and-prs.md` names it, and no
closed one SHALL have used the branch. A change that fails any of these SHALL
be passed over with its reason printed. A pull request query that fails SHALL
make the change untakeable.

A change that fails only because every box of its N groups is ticked SHALL be
an answer candidate instead. Its step is N+1 on `feat/<slug>-<N+1>`, and the
pull request rule above applies to that branch. When, besides, every step's
branch has a merged pull request, it SHALL also be an archive candidate
(*A change whose every step merged is verified and archived*). A card at
`approved`, `exploring`, `explored` or `proposing` SHALL be a candidate as
*An approved card is explored* and *An explored card is proposed* fix. A pass
SHALL be idle without a pick session only when it has no candidate of any
stage.

#### Scenario: A step waiting for the user's merge

- **WHEN** step 2 of a change has an open pull request on `feat/<slug>-2`
- **THEN** the change is not takeable, and the reason printed names that pull
  request

#### Scenario: The next group of a multi-group change

- **WHEN** a change's first group is ticked and its second is not
- **THEN** the step is 2, on `feat/<slug>-2`. A change with a single group
  has step 1, on `feat/<slug>`

#### Scenario: Every group ticked

- **WHEN** every box in a change's `tasks.md` is ticked, in N groups, and no
  pull request has used `feat/<slug>-<N+1>`
- **THEN** the change is an answer candidate for step N+1, and the pass runs
  the pick session even when no change is takeable

#### Scenario: Every step merged

- **WHEN** every group is ticked and every step's branch has a merged pull
  request
- **THEN** the change is an answer candidate and an archive candidate both,
  and the pick tells them apart by the card's discussion

#### Scenario: An answer's step

- **WHEN** the pick session names an answer candidate
- **THEN** the stage session carries step N+1 on `feat/<slug>-<N+1>`. Its
  goal names writing the card's answer into `tasks.md` as group N+1 and
  carrying that group, and its condition is the check for `apply`, the change
  and N+1

#### Scenario: No takeable change

- **WHEN** no change is takeable, none is an answer or archive candidate, and
  no card is a candidate
- **THEN** the pass is idle. It launches no session and exits 0

#### Scenario: `gh` unavailable

- **WHEN** the pull request query fails or `gh` is missing
- **THEN** no change is takeable, and the line printed for each change says
  the query failed

### Requirement: A pass takes the first takeable card in the board's order

A pass SHALL take the candidate whose card comes first in `Board view`,
reading the columns right to left, `archiving` to `approved`. A card whose
open question has an answer comes first. Within a column, the user's order
applies (`task-board`, *A column is a queue the user orders*). A short session
SHALL read the board that `harness.board` names, and SHALL return one line,
`PICK: <stage> <name>`, the stage one of `explore`, `propose`, `apply` and
`archive`, and the name a change's slug or, for a card with no change yet, the
card's id. The runner SHALL accept only a stage and name from its own lists.
It SHALL take no change on the user's word or by its own order.

The pick session SHALL take an answer candidate only when its card's
page-level discussion, resolved or not, holds an answer after the last
question there, as `task-board`'s *An open question waits on its card,
assigned to the user* defines the answer: the user's, when the card's `Assign`
holds the user, or a `harness-answer` by the integration's own id, whatever
`Assign` holds (*The runner has a stage session's question triaged before it
posts it*). A change that is both an answer and an archive candidate SHALL be
carried as the answer's step when the pick would take that answer, and as the
archive otherwise.

The pick session SHALL pass over a candidate whose card's page-level
discussion holds a question no answer follows, as the same definition reads
it, so a card waiting on the user costs no stage session.

Before it returns, the pick session SHALL move the card it picks to the status
of the stage the pass carries: `exploring`, `proposing`, `applying` or
`archiving`, from any status before it. It SHALL then read the card back, and
SHALL write nothing else. The runner SHALL NOT read or wait on that move. A
card the pick moved SHALL stay where the move left it, whatever the pass then
does, so the next pass takes it first.

#### Scenario: The user dragged a card up

- **WHEN** two changes are takeable and the user has dragged the second
  one's card above the first in `proposed`
- **THEN** the pass carries the second

#### Scenario: Right to left

- **WHEN** one card leads `explored` and an archive candidate's card stands in
  `applied`
- **THEN** the pass carries the archive

#### Scenario: A picked card is claimed

- **WHEN** the pick session picks a card at `proposed`
- **THEN** the card reads `applying` before the stage session starts, and no
  other card or property was written

#### Scenario: A card already applying

- **WHEN** the card the pick session picks is at `applying` for an apply
  step, or at `exploring` for an exploration
- **THEN** its `Status` is not written

#### Scenario: An answered card goes first

- **WHEN** an answer candidate's card in `applied` holds the user's answer and
  another change's card leads `applying`
- **THEN** the pass carries the answer candidate's step, and its card moves to
  `applying`

#### Scenario: A candidate with no answer

- **WHEN** an answer candidate's card holds, after its last question, neither
  the user's comment while its `Assign` holds the user nor a `harness-answer`
  by the integration's own id
- **THEN** the pick session passes over it

#### Scenario: A takeable card waiting on the user

- **WHEN** a candidate's card holds a question with no answer after it
- **THEN** the pick session passes over it, and takes it again once the user
  has answered

#### Scenario: A pick outside the list

- **WHEN** the pick session names a stage and name that is no candidate of
  the runner's, names none, or returns no single `PICK:` line
- **THEN** the pass launches no stage session, and records `idle` for
  `PICK: none` and `refused` otherwise

#### Scenario: No board named

- **WHEN** the project's `package.json` holds no `harness.board`
- **THEN** the pass refuses, naming the key, and launches no session

## ADDED Requirements

### Requirement: The runner reads the board's cards through the integration

With the integration configured, the runner SHALL read, before the pick
session, every card of the board `harness.board` names: its id, `Status` and
`Pointer`. It SHALL first move each card whose `Pointer` is wholly a
directory of this tree and whose status is behind the one `bun/board-state.ts`
derives for it to that status, and print each move. It SHALL count the cards
at `exploring`, `explored`, `proposing`, `proposed`, `applying`, `applied` and
`archiving`; while there are ten or more, no card at `approved` SHALL be a
candidate. A read that fails SHALL make no card a candidate and move none.
With no integration, no card SHALL be a candidate.

#### Scenario: Ten cards in work

- **WHEN** ten cards stand between `exploring` and `archiving` and one is at
  `approved`
- **THEN** the `approved` card is no candidate, and the pass carries any
  other stage

#### Scenario: A merged archive behind its card

- **WHEN** a card reads `archiving` and its change is archived on the default
  branch
- **THEN** the runner moves it to `done`, prints the move, and does not count
  it

#### Scenario: The board cannot be read

- **WHEN** the board read fails
- **THEN** the pass goes on with the tree's candidates alone, printing why

### Requirement: An approved card is explored

A card at `approved` or `exploring` SHALL be an explore candidate. The stage session SHALL set no goal, write nothing
to the tree or to Notion, and end with a line `NOTE:` and the note below it:
what the card asks, where the behaviour lives, the specs and changes it
touches, and its open questions as a numbered list. The runner SHALL append
the note to the card's body from the integration, under a line naming the
loop's exploration and the date, then move the card to `explored`. The pass
SHALL be `met` once both writes hold, recorded as `loop`, `met`, `explore`,
and `open` otherwise, naming what is missing. The exploration SHALL post no
question.

#### Scenario: An exploration that ends on a note

- **WHEN** the session's final message holds one `NOTE:` line with text
  below it
- **THEN** the card's body ends with the note, the card reads `explored`, and
  the pass exits 0

#### Scenario: No note

- **WHEN** the final message holds no `NOTE:` line, or an empty note
- **THEN** the runner writes nothing, the card stays `exploring`, and the
  pass records `open`

### Requirement: An explored card is proposed

A card at `explored`, or at `proposing` with an empty `Pointer`, SHALL be a
propose candidate. Its session SHALL run `/opsx:propose` on a new branch
`spec/<slug>` under the goal `stage-goal` fixes for `propose`, in its
before-push form, and end with a line `CHANGE: <slug>` and a `QUESTION:` that
names the card and holds the approval comment: every open question with its
options and a recommendation, the decisions taken and the assumptions made,
numbered in one sequence, opening with the mark and the branch and commit. When
`HEAD` is on `spec/<slug>` and the before-push check reads `goal met`, the
runner SHALL set the card's `Pointer` to `openspec/changes/<slug>/`, push the
branch with no pull request, and post the question as *The runner posts a
stage session's question from the integration* fixes.

A card at `proposing` whose `Pointer` names a change on `spec/<slug>` that no
pull request has used SHALL be a propose answer candidate once its question
is answered. Its session SHALL continue the branch, write the answers into the
artefacts, and either ask again or name the pull request; the runner SHALL
then open it, and the verdict SHALL be the full check for `propose`.

#### Scenario: A proposal waits for approval

- **WHEN** the session ends on `spec/<slug>` with a `CHANGE:` line, a question
  and a before-push check that reads `goal met`
- **THEN** the card's `Pointer` names the change, the branch is on `origin`
  with no pull request, the question is on the card, and the pass is
  `waiting`

#### Scenario: No approval comment

- **WHEN** the session ends with no `QUESTION:` line
- **THEN** the runner pushes nothing and posts nothing, and the pass records
  `open`

#### Scenario: The approval settled

- **WHEN** the user has answered the approval comment and the session names a
  title and body
- **THEN** the runner opens the proposal's pull request, and the pass records
  `met` for `propose`

### Requirement: A change whose every step merged is verified and archived

The session for an archive candidate SHALL work on `chore/archive-<slug>`,
run `/opsx:verify`, and only when it leaves nothing unsettled run
`/opsx:archive`, under the goal `stage-goal` fixes for `archive`, in its
before-push form. What only the user can settle SHALL end the session on a
question or on `BLOCKED —`. The runner SHALL push and open the pull request
as for a step, and the verdict SHALL be the full check for `archive`.

#### Scenario: A clean verify

- **WHEN** `/opsx:verify` reports nothing to settle and the before-push check
  for `archive` reads `goal met`
- **THEN** the runner opens the archive's pull request, and the pass records
  `met` for `archive`

#### Scenario: A verify that needs the user

- **WHEN** `/opsx:verify` reports a gap only the user can settle
- **THEN** the session archives nothing and asks, and the pass is `waiting`

### Requirement: A pass that meets the subscription's usage limit rests

When any session of a pass ends because the Claude subscription's usage limit
is spent, the pass SHALL end `limited`, exit 0, push and post nothing, and
print `board-loop: limited — until <time>` with the reset time in UTC as an
ISO 8601 instant. A reset time it cannot read SHALL be one hour after the
session ended. The card SHALL stay where the pick's move left it.

#### Scenario: The limit is spent mid-step

- **WHEN** the stage session's output says the usage limit is reached and
  names when it resets
- **THEN** the pass records `limited`, prints that time, and exits 0

#### Scenario: No reset time

- **WHEN** the output says the limit is reached and names no reset time
- **THEN** the line names one hour after the session ended
