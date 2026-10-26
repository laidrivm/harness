# commit-gates — delta

## ADDED Requirements

### Requirement: The pre-push hook refuses a push into a ready pull request

Before its other checks, the pre-push hook SHALL refuse a push that updates a
branch on a GitHub remote while that branch has an open pull request that is
not a draft, naming `gh pr ready <n> --undo`, and SHALL refuse one whose pull
requests it cannot read. A branch with no open pull request or a draft one,
and a remote not on GitHub, SHALL pass. This check alone reads the hook's
ref-update records.

#### Scenario: A push into a ready pull request

- **WHEN** a push updates `feat/x` on `github.com` and `feat/x` has open pull
  request #7, not a draft
- **THEN** the hook names `gh pr ready 7 --undo`, exits non-zero before
  `bun test`, and the push does not happen

#### Scenario: A push into a draft

- **WHEN** a push updates `feat/x` and its open pull request is a draft
- **THEN** the draft check passes and the hook goes on to `bun test`

#### Scenario: A pull request state the hook cannot read

- **WHEN** a push updates a branch on `github.com` and its pull requests
  cannot be read
- **THEN** the hook exits non-zero and the push does not happen

#### Scenario: A push with nothing to update

- **WHEN** a push finds `origin` already at `HEAD`, so git hands the hook no
  ref-update record
- **THEN** the draft check reads no pull request and passes

#### Scenario: A remote that is not on GitHub

- **WHEN** a push updates a branch of a remote whose URL is a local path
- **THEN** the draft check reads no pull request and passes
