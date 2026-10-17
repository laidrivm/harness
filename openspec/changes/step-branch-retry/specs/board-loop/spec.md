# board-loop — delta spec

## ADDED Requirements

### Requirement: A step branch a session left is continued

When the branch of the step a pass carries already exists, in the clone or on
`origin`, the pass SHALL launch the stage session to continue it. The first
line of the launch form SHALL name that branch as one a session left, and
SHALL tell the session to switch to it rather than create it. The other lines
of the launch form SHALL NOT change. The runner SHALL NOT delete, reset,
recreate or push the branch.

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

#### Scenario: An answer step's branch

- **WHEN** an answer candidate's branch for step N+1 already exists
- **THEN** the answer form's first line names that branch in the same way

### Requirement: An unpushed step branch does not stop the pass

A branch tip that no remote-tracking branch contains SHALL NOT stop the pass
when its branch is the step branch of a change the pass computes as takeable
or as an answer candidate. The runner SHALL switch from it to the default
branch as from any other branch, and the branch SHALL keep its commits. A
pass refused after that switch SHALL first switch the clone back to the
branch.

#### Scenario: A dead session's unpushed commits

- **WHEN** `HEAD` is on a takeable change's step branch, the tree is clean,
  and the branch holds a commit that no remote-tracking branch contains
- **THEN** the pass goes on from the default branch's tip, the step branch
  keeps its tip, and a pass that carries that step continues the branch

#### Scenario: Refused after the switch

- **WHEN** a pass that switched from such a branch is refused, for example
  because `bun install --frozen-lockfile` fails
- **THEN** the clone is back on that branch at its tip

## MODIFIED Requirements

### Requirement: The runner is the user's script and starts from a clean clone

The runner SHALL refuse to start when `CLAUDECODE` is in its environment. It
SHALL refuse a clone that `~/.claude.json` does not record as a trusted
workspace under its real path, because a session there ignores the tracked
`permissions.allow`. It SHALL refuse a tracked edit, or a branch tip no
remote-tracking branch contains, except as *An unpushed step branch does not
stop the pass* allows. Otherwise it SHALL fetch and fast-forward the default
branch, refusing where it cannot. It SHALL never create a merge commit or
reset.
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
  contains, and it is not the step branch of a change the pass computes as
  takeable or as an answer candidate
- **THEN** the runner refuses, naming the branch, launches no session, and
  leaves that branch checked out at the tip it had

#### Scenario: Unpushed work on a detached HEAD

- **WHEN** `HEAD` names no branch and holds a commit that no remote-tracking
  branch contains
- **THEN** the runner refuses before any fetch, leaving `HEAD` where it was

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
