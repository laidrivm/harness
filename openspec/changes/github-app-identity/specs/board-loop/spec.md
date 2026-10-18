# board-loop delta

## ADDED Requirements

### Requirement: The runner pushes the step and opens its pull request

The stage session SHALL push nothing and open no pull request. Once it and
everything it started have ended, the runner SHALL push the step's branch to
`origin`, never by force, and open its pull request against the default
branch, only when `HEAD` is on that branch, the before-push goal check that
`stage-goal` fixes reads `goal met`, and the session's final message names the
pull request's title and body. Its verdict SHALL then be the full goal check.

#### Scenario: A step ready to push

- **WHEN** the session ends on the step's branch, the before-push check reads
  `goal met`, and the final message holds one `PR-TITLE:` line and one
  `PR-BODY:` line with a body below it
- **THEN** the runner pushes that branch without force, opens a pull request
  ready for review with that title and body, and records the full check's
  verdict

#### Scenario: A step not ready

- **WHEN** the before-push check reads `goal open`, the session ran past the
  limit, or `HEAD` is on any branch but the step's
- **THEN** the runner pushes nothing, opens nothing, and the branch keeps its
  commits for the pass that continues it

#### Scenario: No title or body

- **WHEN** the final message holds no `PR-TITLE:` line, two of them, no
  `PR-BODY:` line, or an empty title or body
- **THEN** the runner opens no pull request, and the pass records `open`
  naming what the message lacked

#### Scenario: The push is refused

- **WHEN** `origin` refuses the push, because its branch moved or the step
  touches a file the pushing identity may not write
- **THEN** the runner neither forces nor retries, opens nothing, and the pass
  records `open` with the push's failure

#### Scenario: The pull request already exists

- **WHEN** opening fails because a pull request whose head is `HEAD` already
  exists on the branch
- **THEN** the verdict is the full check's, which reads `goal met`

### Requirement: A session's environment is an allowlist

The runner SHALL start the pick session and the stage session with an
environment holding only the variables its allowlist names and the commit
identity *The runner pushes as the GitHub App when one is configured* adds,
never a copy of its own. The allowlist SHALL name no variable that carries a
GitHub credential or an SSH agent, and no App setting.

#### Scenario: A token in the runner's environment

- **WHEN** the runner starts with `GH_TOKEN`, `GITHUB_TOKEN`,
  `SSH_AUTH_SOCK` and the App settings set
- **THEN** neither session's environment holds any of them

#### Scenario: What a session needs

- **WHEN** the runner starts with `PATH`, `HOME` and `XDG_STATE_HOME` set
- **THEN** both sessions see them unchanged, so the pre-PR record a session
  writes is the one the runner's check reads

### Requirement: The runner pushes as the GitHub App when one is configured

When the runner's environment names an App's ID and the path of its private
key, the runner SHALL push and open the pull request with an installation
token minted after the stage session ends, for the clone's repository alone,
and SHALL author and commit the session's commits as the App's `[bot]` user.
The token SHALL reach no session, command line or file. With neither setting,
the runner SHALL use its user's own credentials.

#### Scenario: An App configured

- **WHEN** both settings are present and the step is ready to push
- **THEN** the push and the pull request are the App's, the token named only
  the clone's repository, and the session's commits name `<app>[bot]` as
  author and committer

#### Scenario: Half an App

- **WHEN** one setting is present without the other, the key cannot be read,
  or `origin` names no GitHub repository
- **THEN** the pass refuses before any session, naming the setting or the
  remote and never the key's contents

#### Scenario: GitHub does not answer

- **WHEN** a call to GitHub's API fails before the pick session
- **THEN** the pass refuses and launches no session; when the token cannot be
  minted after the stage session, the runner pushes nothing and the pass
  records `open`

#### Scenario: No App

- **WHEN** neither setting is present
- **THEN** the runner pushes and opens with its user's git and `gh`
  credentials, and the commits carry the clone's own identity

## MODIFIED Requirements

### Requirement: A step branch a session left is continued

When the branch of the step a pass carries already exists, in the clone or on
`origin`, the pass SHALL launch the stage session to continue it. The first
line of the launch form SHALL name that branch as one a session left, and
SHALL tell the session to switch to it rather than create it. The other lines
of the launch form SHALL NOT change. The runner SHALL NOT delete, reset or
recreate the branch, and SHALL push it only as *The runner pushes the step and
opens its pull request* allows.

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
