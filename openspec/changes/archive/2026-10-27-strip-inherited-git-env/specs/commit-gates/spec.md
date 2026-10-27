# commit-gates — delta

## ADDED Requirements

### Requirement: The pre-push hook drops git's repository variables

Before any command it starts, the harness's pre-push hook SHALL remove from
its environment every variable that `git rev-parse --local-env-vars` names,
so no check it runs inherits the repository git handed the hook. The list
SHALL be git's own, read when the hook runs, and no copy of it SHALL be kept
in the harness.

#### Scenario: A push from a worktree

- **WHEN** a branch is pushed from a linked worktree, so git hands the hook
  an absolute `GIT_DIR` naming that worktree's directory under the shared
  `.git`
- **THEN** no command the hook starts sees `GIT_DIR`, so each git call of the
  suite it runs finds its repository from its own working directory

#### Scenario: Every variable on git's list

- **WHEN** the hook is started with `GIT_DIR`, `GIT_INDEX_FILE` and
  `GIT_CONFIG_COUNT` set to a decoy repository's values
- **THEN** the commands it starts see none of them, and the decoy's refs and
  config are as they were

### Requirement: The test suite refuses to start under git's repository variables

The harness's `bun test`, started at the repository's root, SHALL exit
non-zero before any test file loads while
any variable that `git rev-parse --local-env-vars` names is set, whatever its
value, empty included, and SHALL name each such variable on stderr. A list
it cannot read SHALL refuse the same way. A variable outside that list SHALL
NOT refuse.

#### Scenario: A suite started under a decoy repository

- **WHEN** `bun test` starts with `GIT_DIR` naming a decoy repository that
  has no remote
- **THEN** it exits non-zero naming `GIT_DIR`, runs no test, and the decoy's
  refs and config are as they were

#### Scenario: A variable set but empty

- **WHEN** `bun test` starts with `GIT_PREFIX` set to the empty string, as git
  sets it for a hook run at a checkout's top level
- **THEN** it refuses and names `GIT_PREFIX`

#### Scenario: A git variable outside the list

- **WHEN** `bun test` starts with `GIT_EDITOR` set and nothing on git's list
- **THEN** the suite runs, because only git's list decides — a session that
  sets an editor for git is not inside another repository

#### Scenario: The list cannot be read

- **WHEN** `git rev-parse --local-env-vars` fails when the suite starts
- **THEN** the suite exits non-zero naming that failure and runs no test
