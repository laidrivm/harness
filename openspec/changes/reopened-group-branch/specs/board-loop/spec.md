## MODIFIED Requirements

### Requirement: A pass takes only a takeable change

A change SHALL be takeable when it is `proposed` (`bun/board-state.ts`) and
blocked by nothing in its `after:` list. Its `tasks.md` SHALL have a group
with an unticked box, and the first such group is the step. No open pull
request SHALL sit on that step's branch, as `git-and-prs.md` names it, and no
closed one SHALL have used the branch. A change that fails any of these SHALL
be passed over with its reason printed. A pull request query that fails SHALL
make the change untakeable.

When every pull request that used the step's branch merged, the step SHALL
instead be carried on its retry branch: `<the step's branch>-<k>` for a
change of several groups and `feat/<slug>-1-<k>` for a single-group change,
with `k` the first number from 2 whose name is not one that only merged pull
requests used. The pull request rule above SHALL apply to that name. The runner SHALL try at
most ten names, from the step's branch, and SHALL pass the change over,
naming the last one, when every one of them only merged pull requests used.

A change that fails only because every box of its N groups is ticked SHALL be
an answer candidate instead. Its step is N+1 on `feat/<slug>-<N+1>`, and the
pull request rule above applies to that branch, with no retry branch. A pass
SHALL be idle without a pick session only when it has neither a takeable
change nor an answer candidate.

#### Scenario: A step waiting for the user's merge

- **WHEN** step 2 of a change has an open pull request on `feat/<slug>-2`
- **THEN** the change is not takeable, and the reason printed names that pull
  request

#### Scenario: The next group of a multi-group change

- **WHEN** a change's first group is ticked and its second is not
- **THEN** the step is 2, on `feat/<slug>-2`. A change with a single group
  has step 1, on `feat/<slug>`

#### Scenario: A group reopened after its pull request merged

- **WHEN** a change's group 4 holds an unticked box and the only pull request
  that used `feat/<slug>-4` merged
- **THEN** the step is 4, on `feat/<slug>-4-2`, when no pull request used
  that name, and the pass takes the change

#### Scenario: A single-group change reopened after its merge

- **WHEN** a single-group change holds an unticked box and a merged pull
  request used `feat/<slug>`
- **THEN** the step is 1, on `feat/<slug>-1-2`

#### Scenario: A retry branch waiting or withdrawn

- **WHEN** a merged pull request used `feat/<slug>-4` and an open or closed,
  unmerged one used `feat/<slug>-4-2`
- **THEN** the change is passed over, the reason naming that pull request and
  `feat/<slug>-4-2`, as for the step's branch itself

#### Scenario: A step's branch closed unmerged

- **WHEN** the step's branch was used by a pull request closed unmerged
- **THEN** the change is passed over, the reason naming that pull request,
  and no retry branch is tried

#### Scenario: Every group ticked

- **WHEN** every box in a change's `tasks.md` is ticked, in N groups, and no
  pull request has used `feat/<slug>-<N+1>`
- **THEN** the change is an answer candidate for step N+1, and the pass runs
  the pick session even when no change is takeable

#### Scenario: An answer candidate's branch merged

- **WHEN** every box of a change's N groups is ticked and a merged pull
  request used `feat/<slug>-<N+1>`
- **THEN** the change is passed over, the reason naming that pull request,
  and no retry branch is tried

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

### Requirement: A step branch a session left is continued

When the branch of the step a pass carries already exists, in the clone or on
`origin`, the pass SHALL launch the stage session to continue it. The first
line of the launch form SHALL name that branch as one a session left, and
SHALL tell the session to switch to it rather than create it. The other lines
SHALL be those of the launch form for a step with no branch left, including
its `--before-push` check and its `PR-TITLE:` and `PR-BODY:` lines. The runner SHALL NOT delete, reset or
recreate the branch, and SHALL push it only as *The runner pushes the step and
opens its pull request* allows. A retry branch that does not exist yet SHALL
be named in the first line too, with the merged pull request that used the
step's branch, as the branch to create from the default branch's tip.

#### Scenario: A local branch a session left

- **WHEN** the step's branch exists in the clone and no pull request has used
  it
- **THEN** the stage session's first line names the branch and tells the
  session to switch to it rather than create it, and the branch's tip is the
  one the earlier session left

#### Scenario: A branch pushed without a pull request

- **WHEN** the step's branch exists on `origin` alone and no pull request has
  used it
- **THEN** the stage session's first line names the branch in the same way

#### Scenario: No branch left

- **WHEN** the step's branch exists neither in the clone nor on `origin`
- **THEN** the stage session's prompt is the launch form `stage-goal` fixes,
  unchanged

#### Scenario: A retry branch not yet created

- **WHEN** the step is carried on a retry branch that exists neither in the
  clone nor on `origin`
- **THEN** the stage session's first line names the retry branch and the
  merged pull request, and tells the session to create that branch from the
  default branch's tip

#### Scenario: An answer step's branch

- **WHEN** an answer candidate's branch for step N+1 already exists
- **THEN** the answer form's first line names that branch in the same way
