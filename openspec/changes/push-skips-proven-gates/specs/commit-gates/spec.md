## ADDED Requirements

### Requirement: The pre-push hook skips the gates a passing run record proved

The one exception to *The pre-push hook runs the gates named here*: the hook
SHALL skip its judged gates when the push updates or deletes no tag and every
commit it lands — each ref-update record's local sha but a deletion's — has a
pre-PR runner record of `project-checks` that passed, made in this checkout,
and none that failed or erred, and SHALL print one line naming those commits.
Otherwise it SHALL run them and print why. The draft check and the diff
budget SHALL run either way. No sha, or an unreadable ledger, skips nothing; a
torn line is no record.

#### Scenario: A head the runner passed

- **WHEN** the ledger holds a passing `project-checks` record of `C` in this
  checkout and a push lands `C`
- **THEN** the hook prints a line naming `C` and saying the gates were
  skipped, runs no gate, and still runs the draft check and the diff budget

#### Scenario: A head the runner did not pass

- **WHEN** the ledger holds no passing `project-checks` record of the commit
  a push lands
- **THEN** the hook prints a line naming the commit and saying why the gates
  run, and runs them

#### Scenario: Another step's pass at the commit

- **WHEN** the ledger holds a passing `diff-budget` record of `C`, a failing
  `project-checks` one, and a draft-check refusal naming `C`, and a push lands
  `C`
- **THEN** the hook runs its gates

#### Scenario: A pass and a later failure of one commit

- **WHEN** the ledger holds a passing and a failing `project-checks` record of
  `C` in this checkout, in either order, and a push lands `C`
- **THEN** the hook runs its gates, since a failure seen before the push is
  one the push does not go past

#### Scenario: Two refs, one unproven

- **WHEN** a push lands `C` and `D`, and only `C` has a passing
  `project-checks` record here
- **THEN** the hook runs its gates

#### Scenario: A push of a commit other than HEAD

- **WHEN** a push lands `C` while `HEAD` is another commit, and `C` has a
  passing `project-checks` record here
- **THEN** the hook skips its gates, since the record is of the commit the
  push lands

#### Scenario: A push that only deletes

- **WHEN** every ref-update record of a push is a deletion, or there is none
  and the input is empty or one blank line
- **THEN** the hook runs its gates

#### Scenario: A tag

- **WHEN** a push updates a ref under `refs/tags/`, annotated or lightweight,
  whose commit has a passing record, or deletes one beside a proven branch
- **THEN** the hook runs its gates, whatever the tag's sha

#### Scenario: A torn line beside a pass

- **WHEN** the ledger holds a passing `project-checks` record of `C` here and
  a line that is not JSON, and a push lands `C`
- **THEN** the hook skips its gates, the torn line counting as no record

#### Scenario: Another checkout of the same commit

- **WHEN** the passing record of `C` names another worktree's top level and
  a push from this checkout lands `C`
- **THEN** the hook runs its gates

#### Scenario: A dirty tree over a proven head

- **WHEN** `HEAD` is `C` with a passing record here, a tracked file has an
  uncommitted edit, and a push lands `C`
- **THEN** the hook skips its gates, since the record proves `C`'s own tree
  and the edit is not pushed

#### Scenario: A ledger the hook cannot read

- **WHEN** the ledger is absent or unreadable and a push lands a commit
- **THEN** the hook runs its gates

## MODIFIED Requirements

### Requirement: The pre-push hook refuses a push into a ready pull request

Before its other checks, the pre-push hook SHALL refuse a push that updates a
branch on a GitHub remote while that branch has an open pull request that is
not a draft, naming `gh pr ready <n> --undo`, and SHALL refuse one whose pull
requests it cannot read. A branch with no open pull request or a draft one,
and a remote not on GitHub, SHALL pass. This check and the gates' skip
(*The pre-push hook skips the gates a passing run record proved*) alone read
the hook's ref-update records, from one read the hook hands to both.

#### Scenario: A push into a ready pull request

- **WHEN** a push updates `feat/x` on `github.com` and `feat/x` has open pull
  request #7, not a draft
- **THEN** the hook names `gh pr ready 7 --undo`, exits non-zero before
  its gates, and the push does not happen

#### Scenario: A push under another name

- **WHEN** a push sends local `feat/x` to `refs/heads/release`, and `release`
  has an open pull request that is not a draft
- **THEN** the hook refuses, reading the branch from the remote ref

#### Scenario: A push into a draft

- **WHEN** a push updates `feat/x` and its open pull request is a draft
- **THEN** the draft check passes and the hook goes on past it

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
