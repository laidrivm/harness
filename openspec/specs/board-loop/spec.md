# board-loop Specification

## Purpose

A runner the user starts once that takes the next takeable change from the
board and carries its next stage in a fresh unattended session, so that work
moves across the board without a person driving each stage.

## Requirements

### Requirement: The runner is the user's script and starts from a clean clone

The runner SHALL refuse to start when `CLAUDECODE` is in its environment. It
SHALL refuse a clone that `~/.claude.json` does not record as a trusted
workspace under its real path, because a session there ignores the tracked
`permissions.allow`. It SHALL refuse a tracked edit, or a branch tip no
remote-tracking branch contains. Otherwise it SHALL fetch and fast-forward
the default branch, refusing where it cannot. It SHALL never create a merge
commit or reset.
It SHALL then run `bun install --frozen-lockfile` and refuse when that fails,
so that no session it launches has to install.

#### Scenario: Started from an agent's shell

- **WHEN** the runner starts with `CLAUDECODE` set, to any value including
  the empty string
- **THEN** it exits non-zero, saying the user starts it from a terminal of
  their own, and it has run no git, `gh` or `claude` command

#### Scenario: An untrusted clone

- **WHEN** the clone's real path is not a trusted workspace in
  `~/.claude.json`
- **THEN** the pass is refused, naming how to trust it, before any fetch or
  session

#### Scenario: The previous pass's step branch

- **WHEN** the clone is on a step branch that the previous pass pushed and
  the tree is clean
- **THEN** the runner switches to the default branch at its remote's tip and
  the pass goes on

#### Scenario: Unpushed work

- **WHEN** the current branch holds a commit that no remote-tracking branch
  contains
- **THEN** the runner refuses, leaving the branch and the tree as they were

#### Scenario: An edited tracked file

- **WHEN** a tracked file differs from `HEAD`
- **THEN** the runner refuses. An untracked file alone does not stop it

#### Scenario: The install fails

- **WHEN** `bun install --frozen-lockfile` exits non-zero after the
  fast-forward, for example because `bun.lock` no longer matches
  `package.json`
- **THEN** the runner refuses, records `refused`, prints the install's
  failure, and launches no session

#### Scenario: The pin moved on the default branch

- **WHEN** the fast-forward brings a commit that moves a pinned dependency
- **THEN** the install runs against the new lockfile before any session
  starts

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

### Requirement: A pass carries one step unattended and records the check's verdict

A pass SHALL launch the step as one fresh `claude -p` session. The session
runs in auto mode with nobody to answer prompts, and in the launch form
`stage-goal` fixes, under a prompt that declares it unattended. The pass
SHALL end the session one hour after launch. It SHALL then run the step's
goal check itself, and SHALL write one ledger record and one printed line per
pass.

#### Scenario: The step met its goal

- **WHEN** the session ends and the check's last line reads `goal met`
- **THEN** the pass records `loop`, `met`, `apply`, prints the change and the
  step, and exits 0

#### Scenario: The session claims success that the check denies

- **WHEN** `claude` exits 0 and the check reads `goal open`
- **THEN** the pass records `open`, prints what the check says is missing,
  and exits 1

#### Scenario: The session runs past the limit

- **WHEN** the session is still running one hour after launch
- **THEN** the pass ends it, records `timeout`, and exits 1

#### Scenario: Every pass leaves a record

- **WHEN** a pass is refused, finds no takeable change, or carries a step
- **THEN** the ledger gains exactly one `loop` record. A ledger that cannot
  be written changes neither the printed line nor the exit status

#### Scenario: Permissions are never bypassed

- **WHEN** the runner launches any session
- **THEN** its command line carries neither `bypassPermissions` nor
  `--dangerously-skip-permissions`

### Requirement: A pass takes the first takeable card in the board's order

A pass SHALL take the takeable change whose card comes first in `Board view`.
A card whose open question the user has answered comes first, then the
`applying` column, then `proposed`. Within each, the user's order applies
(`task-board`, *A column is a queue the user orders*). A short session SHALL
read the board that `harness.board` names, and SHALL return one `PICK:` line.
The runner SHALL accept only a change from its own takeable list or its answer
candidates. It SHALL take no change on the user's word or by its own order.

The pick session SHALL take an answer candidate only when its card's `Assign`
holds the user and its page-level discussion, resolved or not, holds the
user's answer after the last question there, as `task-board`'s *An open
question waits on its card, assigned to the user* defines the answer. Such a
card stands in `applied` or `applying`, so the pick session SHALL read
`applied` too.

Before it returns, the pick session SHALL move the card it picks to the status
of the stage the pass carries: `applying` for an apply step, from `proposed`
or, for an answer candidate, from `applied`. It SHALL then read the card back,
and SHALL write nothing else. The runner SHALL NOT read or wait on that move.
A card the pick moved SHALL stay where the move left it, whatever the pass
then does, so the next pass takes it first.

#### Scenario: The user dragged a card up

- **WHEN** two changes are takeable and the user has dragged the second
  one's card above the first in `proposed`
- **THEN** the pass carries the second

#### Scenario: A picked card is claimed

- **WHEN** the pick session picks a card at `proposed`
- **THEN** the card reads `applying` before the stage session starts, and no
  other card or property was written

#### Scenario: A card already applying

- **WHEN** the card the pick session picks is at `applying`
- **THEN** its `Status` is not written

#### Scenario: An answered card goes first

- **WHEN** an answer candidate's card in `applied` holds the user's answer and
  another change's card leads `applying`
- **THEN** the pass carries the answer candidate's step, and its card moves to
  `applying`

#### Scenario: A candidate with no answer

- **WHEN** an answer candidate's card has no comment by the user after its last
  question, or its `Assign` is empty
- **THEN** the pick session passes over it

#### Scenario: A pick outside the list

- **WHEN** the pick session names a change that is neither takeable nor an
  answer candidate, names none, or returns no single `PICK:` line
- **THEN** the pass launches no stage session, and records `idle` for
  `PICK: none` and `refused` otherwise

#### Scenario: No board named

- **WHEN** the project's `package.json` holds no `harness.board`
- **THEN** the pass refuses, naming the key, and launches no session
