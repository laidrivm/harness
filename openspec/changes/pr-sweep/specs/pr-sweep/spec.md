# pr-sweep delta

## Purpose

One run over a repository's open agent pull requests. It updates a branch
that is behind its base, hands off what needs an agent or the CI flow as a
record, and marks each head it judged, so a missed event or a state that has
no event is caught by the next run.

## ADDED Requirements

### Requirement: The sweep judges only open agent pull requests

The sweep SHALL judge an open pull request only when its head branch starts
with `feat/` or `spec/`, its head is in the same repository, and its author is
the GitHub App's bot, when one is configured, or the login of the runner's own
`gh` credential. Every other pull request SHALL get no call beyond the listing
and no output line. A draft agent pull request SHALL be skipped and not
marked.

#### Scenario: An agent branch by an allowed author

- **WHEN** an open pull request on `feat/demo-1` from the same repository is
  authored by the runner credential's login
- **THEN** the sweep judges it

#### Scenario: Another branch, another author or a fork

- **WHEN** an open pull request is on `fix/x`, or is authored by another
  login, or comes from a fork
- **THEN** the sweep makes no call about it and prints no line for it

#### Scenario: A draft

- **WHEN** an agent pull request is a draft
- **THEN** its line reads `skipped`, and no status is written

### Requirement: A head the sweep marked is not judged again

The sweep SHALL treat a head SHA as handled when a commit status with context
`harness/sweep` exists on it, and SHALL then make no call about that pull
request beyond the listing. A new head SHA SHALL be judged.

#### Scenario: A marked head

- **WHEN** the head SHA carries a `harness/sweep` status
- **THEN** the line reads `skipped` and no other call is made for that pull
  request

#### Scenario: A push after the mark

- **WHEN** a commit is pushed on top of a marked head
- **THEN** the next run judges the new head

### Requirement: A branch behind its base is updated by merge only

When the base branch holds a commit the head lacks, the sweep SHALL run
`gh pr update-branch` for that pull request without `--rebase`, SHALL write no
status, and SHALL judge nothing else for it in that run. The sweep SHALL never
rebase, reset or force-push a branch.

#### Scenario: Behind its base

- **WHEN** the base has a commit the head lacks and the two do not conflict
- **THEN** `gh pr update-branch` runs without `--rebase`, the line reads
  `updated`, and no status is written

#### Scenario: The update fails

- **WHEN** `gh pr update-branch` exits non-zero
- **THEN** the line reads `failed` with the error, no status is written, and
  the run exits 1

### Requirement: A head GitHub or CI has not settled waits for a later run

The sweep SHALL write no status and hand off nothing for a head whose
mergeability GitHub reports as unknown, or, once no drift is found, for a head
where any check is still running or no check exists yet. Its line SHALL read
`waiting` and name what it waits on.

#### Scenario: Mergeability not computed

- **WHEN** GitHub reports the pull request's mergeability as unknown
- **THEN** the line reads `waiting`, and no status is written

#### Scenario: A check still running

- **WHEN** one check on the head is queued or in progress and the others passed
- **THEN** the line reads `waiting`, naming that check

#### Scenario: No check yet

- **WHEN** the head has no check run and no commit status
- **THEN** the line reads `waiting`

### Requirement: A conflict with the base is handed off to an agent

When GitHub reports the pull request as conflicting with its base, the sweep
SHALL NOT try to update the branch. It SHALL hand off a `conflict` to an agent
and mark the head.

#### Scenario: A conflicting pull request

- **WHEN** the pull request conflicts with its base
- **THEN** no update is attempted, the line carries a `conflict` hand-off to
  `agent`, and the head is marked

### Requirement: A drifted harness copy is handed off to an agent

For a head whose `package.json` pins the harness under `dependencies`, the
sweep SHALL compare the head's `harness/` directory with the `core/` Markdown
files of the pinned harness commit, as `check.ts`'s drift check compares them,
and hand off each problem it names as one `drift` hand-off to an agent. Drift
SHALL be judged before CI, and a head with drift SHALL get no `ci` hand-off.

#### Scenario: A copy that differs

- **WHEN** the head's `harness/rules.md` differs from `core/rules.md` at the
  pinned commit
- **THEN** the line carries a `drift` hand-off naming that file, carries no
  `ci` hand-off whatever the checks read, and the head is marked

#### Scenario: A copy that is missing

- **WHEN** the head has no `harness/` directory and pins the harness under
  `dependencies`
- **THEN** the `drift` hand-off names every file of the pinned `core/`

#### Scenario: The harness itself

- **WHEN** the head's `package.json` has no `dependencies.harness`
- **THEN** no drift is judged, and nothing of `core/` is read

#### Scenario: A malformed pin

- **WHEN** `dependencies.harness` is not `github:laidrivm/harness#<40-hex>`
- **THEN** the line reads `failed` naming the value, and no status is written

### Requirement: Red CI is handed off to the CI flow and never re-run

Each check on the head SHALL be judged by its latest run. When any check other
than `harness/sweep` failed, the sweep SHALL hand off one `ci` hand-off to
`ciflow` naming every failed check, and mark the head. The sweep SHALL never
re-run, cancel or delete a CI run.

#### Scenario: A failed check

- **WHEN** every check finished and one failed
- **THEN** the line carries a `ci` hand-off to `ciflow` naming that check, the
  head is marked, and no run is re-run

#### Scenario: A check re-run green by someone else

- **WHEN** a check's earlier run failed and its latest run passed
- **THEN** that check counts as passed

### Requirement: A green head is handed off for a description check

When every check on the head passed and no drift or conflict was found, the
sweep SHALL hand off a `description` to an agent, unless the head commit is a
merge whose second parent the base branch already holds. It SHALL then mark
the head.

#### Scenario: A green head after a new commit

- **WHEN** every check passed on a head that is not a merge from the base
- **THEN** the line carries a `description` hand-off to `agent`, and the head
  is marked

#### Scenario: A green head the sweep's own update made

- **WHEN** every check passed on a head that merges the base into the branch
- **THEN** the line carries no hand-off, and the head is marked

### Requirement: Each judged pull request prints one line

The sweep SHALL print one JSON object per line on standard output for each
agent pull request, holding its repository, number, branch, head SHA, outcome
(`marked`, `updated`, `waiting`, `skipped` or `failed`), its hand-offs, and a
reason for every outcome but `marked` and `updated`. Every hand-off SHALL hold
its kind, its recipient and its detail.

#### Scenario: The line's shape

- **WHEN** a head is handed off for red CI
- **THEN** its line parses as JSON with the fields `design.md` fixes, and its
  one hand-off reads `kind` `ci`, `to` `ciflow` and the failed checks as
  `detail`

#### Scenario: A line printed before its mark fails

- **WHEN** the status write fails after the hand-offs were judged
- **THEN** the line reads `failed` and still carries the hand-offs

### Requirement: A judged head is marked after its line is decided

For a head judged as `marked`, the sweep SHALL write one commit status on it,
context `harness/sweep` and state `success`, whose description names the
hand-off kinds or says there were none. It SHALL write it only after the
hand-offs are decided, and SHALL write no status for any other outcome.

#### Scenario: The mark names the hand-offs

- **WHEN** a head is handed off for drift
- **THEN** its `harness/sweep` status is `success` and its description names
  `drift`

### Requirement: The run's exit status says whether every pull request was read

The sweep SHALL exit 2, with no call made, when its argument is not one
`<owner>/<repo>` whose two parts are valid GitHub names, the whole value
anchored. It SHALL exit 1 when the listing fails or any line reads `failed`,
and 0 otherwise.

#### Scenario: A bad argument

- **WHEN** the argument is empty, has a third segment, a `..`, a space or a
  newline
- **THEN** the sweep exits 2 and runs no `gh`

#### Scenario: A clean run

- **WHEN** no agent pull request is open
- **THEN** the sweep prints nothing and exits 0

#### Scenario: One pull request fails

- **WHEN** one pull request's line reads `failed` and another's `marked`
- **THEN** both lines are printed and the sweep exits 1

### Requirement: The sweep writes as the App when one is configured

With `HARNESS_GITHUB_APP_ID` and `HARNESS_GITHUB_APP_KEY` both set, the sweep
SHALL make every GitHub call after reading its own credential's login with an
installation token for the swept repository alone, minted at the start of the
run. With neither set, it SHALL use the runner user's own `gh` credential.
With one alone, it SHALL exit 1 before any call about a pull request.

#### Scenario: The App configured

- **WHEN** both settings are set
- **THEN** the token is requested for the swept repository alone, `gh` gets it
  through `GH_TOKEN`, and no process's arguments hold it

#### Scenario: One setting alone

- **WHEN** only `HARNESS_GITHUB_APP_ID` is set
- **THEN** the sweep exits 1 naming the missing setting, and lists nothing

#### Scenario: No App

- **WHEN** neither setting is set
- **THEN** no token is minted, and the bot is not an allowed author
