## MODIFIED Requirements

### Requirement: A pass takes only a takeable change

A change SHALL be takeable when it is `proposed` (`bun/board-state.ts`) and
blocked by nothing in its `after:` list. Its `tasks.md` SHALL have a group
with an unticked box, and the first such group is the step. No open pull
request SHALL sit on that step's branch, as `git-and-prs.md` names it, and no
closed one SHALL have used the branch. A change that fails any of these SHALL
be passed over with its reason printed. A pull request query that fails SHALL
make the change untakeable.

When only merged pull requests used the step's branch, the group SHALL be
carried, and the runner SHALL read on, in order, the branch of each later
group with an unticked box, carrying each that only merged pull requests
used, up to the first that is not. An open or closed, unmerged pull request
on that first branch SHALL pass the change over as above, with no carry. The
step SHALL otherwise be a carry step N+1 on `feat/<slug>-<N+1>`, N the
groups the change holds, whose goal names moving every unticked task of the
carried groups into a new group N+1 and carrying that group. The pull
request rule above SHALL apply to that branch.

A change that fails only because every box of its N groups is ticked SHALL be
an answer candidate instead. Its step is N+1 on `feat/<slug>-<N+1>`, and the
pull request rule above applies to that branch. A pass SHALL be idle without
a pick session only when it has neither a takeable change nor an answer
candidate.

#### Scenario: A step waiting for the user's merge

- **WHEN** step 2 of a change has an open pull request on `feat/<slug>-2`
- **THEN** the change is not takeable, and the reason printed names that pull
  request

#### Scenario: The next group of a multi-group change

- **WHEN** a change's first group is ticked and its second is not
- **THEN** the step is 2, on `feat/<slug>-2`. A change with a single group
  has step 1, on `feat/<slug>`

#### Scenario: Merged groups reopened

- **WHEN** groups 4 and 5 of a change of five hold unticked boxes and only
  merged pull requests used `feat/<slug>-4` and `feat/<slug>-5`
- **THEN** the step is the carry step 6, on `feat/<slug>-6`, carrying groups
  4 and 5, when no pull request used that branch

#### Scenario: A carry ahead of a group not yet shipped

- **WHEN** group 4 of a change of six holds an unticked box, only a merged
  pull request used `feat/<slug>-4`, and none used `feat/<slug>-5`, whose
  group holds unticked boxes too
- **THEN** the step is the carry step 7, carrying group 4 alone

#### Scenario: A single-group change reopened after its merge

- **WHEN** a single-group change holds an unticked box and only a merged
  pull request used `feat/<slug>`
- **THEN** the step is the carry step 2, on `feat/<slug>-2`, carrying group 1

#### Scenario: A later group waiting or withdrawn

- **WHEN** only a merged pull request used `feat/<slug>-4`, and an open or a
  closed, unmerged one used `feat/<slug>-5`, both groups holding unticked
  boxes
- **THEN** the change is passed over, the reason naming that pull request and
  `feat/<slug>-5`, and no carry is tried

#### Scenario: A carry step's branch already used

- **WHEN** a change's groups would be carried as step N+1 and a pull request
  used `feat/<slug>-<N+1>`
- **THEN** the change is passed over, the reason naming that pull request

#### Scenario: A step's branch closed unmerged

- **WHEN** the step's branch was used by a pull request closed unmerged
- **THEN** the change is passed over, the reason naming that pull request,
  and no carry is tried

#### Scenario: A carry step

- **WHEN** the pick session names a change whose step is a carry
- **THEN** the stage session carries step N+1 on `feat/<slug>-<N+1>`. Its
  goal names moving every unticked task of the carried groups, its text
  unchanged, into a new group N+1, each moved task naming its old number and
  each old place the new one with no box, and carrying that group. Its
  condition is the check for `apply`, the change and N+1

#### Scenario: Every group ticked

- **WHEN** every box in a change's `tasks.md` is ticked, in N groups, and no
  pull request has used `feat/<slug>-<N+1>`
- **THEN** the change is an answer candidate for step N+1, and the pass runs
  the pick session even when no change is takeable

#### Scenario: An answer's step

- **WHEN** the pick session names an answer candidate
- **THEN** the stage session carries step N+1 on `feat/<slug>-<N+1>`. Its
  goal names writing the card's answer into `tasks.md` as group N+1 and
  carrying that group, and its condition is the check for `apply`, the change
  and N+1

#### Scenario: No takeable change

- **WHEN** no change is takeable and none is an answer candidate
- **THEN** the pass is idle. It launches no session and exits 0

#### Scenario: `gh` unavailable

- **WHEN** the pull request query fails or `gh` is missing
- **THEN** no change is takeable, and the line printed for each change says
  the query failed
