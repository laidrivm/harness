## ADDED Requirements

### Requirement: The runner runs harness code only from its own checkout

The runner SHALL run the board loop, the goal check and every other harness
script from a checkout it alone writes, at the harness commit the
repository's `main` pins. It SHALL never run a harness file from a session's
clone, its `node_modules` included.

#### Scenario: A session edits the harness copy in its clone

- **WHEN** a session's clone holds an edited
  `node_modules/harness/bun/board-loop.ts` or `goal-check.ts`
- **THEN** the pass runs the runner's own copy, and the edited file is never
  executed

#### Scenario: The pin moves on main

- **WHEN** the repository's `main` pins a harness commit other than the one
  the runner's checkout holds
- **THEN** the runner fetches that commit into its checkout and the pass runs
  it, read from `main`, never from the session's branch

#### Scenario: The pin names no full commit

- **WHEN** the part of `main`'s harness pin after `#` is not a full commit, or
  the fetch from the harness's remote does not bring it
- **THEN** no pass starts, and the stop file names the value

### Requirement: The runner runs nothing in a session's clone as itself

Every git, bun or `claude` command the runner runs in a session's clone SHALL
run as the session user through one launcher, with the environment the
session allowlist names and no secret. The runner SHALL read nothing from that
clone that a command of its own then executes.

#### Scenario: A hook or a config command in the session's clone

- **WHEN** the session's clone sets `core.fsmonitor`, `core.hooksPath` or a
  filter driver to a command
- **THEN** any run of that command during the pass is as the session user,
  never as the runner

#### Scenario: Every command in the clone goes through the launcher

- **WHEN** a pass runs against a clone
- **THEN** each command whose working directory is that clone was started
  through the launcher

### Requirement: The runner pushes from its own push clone, a commit whose tests passed

The runner SHALL make every push, the board loop's and the CI flow's fix push
alike, from a push clone it alone writes, into which it takes
the session's commits from a bundle the session user writes. It SHALL push a
commit only when the goal check, run with that commit checked out on its step
branch, finds a passing pre-PR record the session's clone made of that
commit's SHA. That push SHALL run no hook, and the runner's bun SHALL load no
configuration from the pushed tree.

#### Scenario: A commit with a passing pre-PR record

- **WHEN** the bundle's step branch tip has a passing pre-PR record
- **THEN** the runner pushes exactly that SHA, and no hook runs

#### Scenario: A commit with no pre-PR record

- **WHEN** the bundle's tip has no passing pre-PR record
- **THEN** the runner pushes nothing and the pass ends `open`, naming the
  missing record

#### Scenario: The CI flow's fix push

- **WHEN** a CI fix session answers `fixed` and its bundle's tip is a new
  commit on top of the run's `head_sha` with a passing pre-PR record
- **THEN** the runner pushes that tip from its push clone, with no hook and
  no force, and the App's token never enters the session's clone

#### Scenario: A CI fix with no pre-PR record

- **WHEN** a CI fix session answers `fixed` and its tip has no passing pre-PR
  record
- **THEN** the runner pushes nothing and the flow exits 1, naming the missing
  record

#### Scenario: A preload in the pushed tree

- **WHEN** the pushed tree holds a `bunfig.toml` with a `preload`
- **THEN** no bun process the runner starts loads it

### Requirement: The user's GitHub token reaches only the push

The pass's environment SHALL hold no GitHub token. With no App configured, the
runner SHALL read the user's token from its secret file for the push, the
pull request it opens and the check that reads that pull request, and for
nothing else; with the App configured it SHALL not read that file. The
pass's `gh` SHALL read its configuration from an empty directory the pass
owns, never from a login stored in the runner's home.

#### Scenario: A login stored in the runner's home

- **WHEN** `runner`'s home holds a `gh` login and a pass runs a `gh` call
  other than the push, the pull request and its check
- **THEN** that call finds no stored login and runs unauthenticated

#### Scenario: The pass's environment

- **WHEN** a pass is running, before its push
- **THEN** no process of the pass holds `GH_TOKEN` or the token file's value

#### Scenario: The App is configured

- **WHEN** the pass runs with the App's settings
- **THEN** the user's token file is never opened, and a host with no such
  file starts the pass

### Requirement: Only the key holder reads the App's private key

The App's private key SHALL be readable by the key-holder user alone. The
runner SHALL obtain an installation token only by asking the key holder for
one repository; the token SHALL last at most an hour and carry permissions
from a fixed set, and it SHALL never appear in a process's arguments.

#### Scenario: The runner reads the key

- **WHEN** the runner or the session user opens the App's key file
- **THEN** the open fails for lack of permission

#### Scenario: A repository outside the installation

- **WHEN** the runner asks for a token for a repository the key holder's list
  does not name
- **THEN** the key holder mints nothing and exits non-zero, naming the
  repository

#### Scenario: A permission outside the fixed set

- **WHEN** the runner asks for a permission, or a level, the fixed set does
  not hold
- **THEN** the key holder mints nothing and exits non-zero, naming it

### Requirement: The session user reads no secret file

The session user SHALL be unable to read any secret file on the host: the
GitHub token, the Notion bot's token, the App's key, the runner's claude.ai
login, and the SSH and tunnel keys.

#### Scenario: Each secret file, as the session user

- **WHEN** the session user tries to read each secret file the host README
  provisions
- **THEN** every read fails for lack of permission, and the test names any
  file that it could read

## MODIFIED Requirements

### Requirement: The wrapper starts the pass with the environment it names

The wrapper SHALL start the pass with an environment holding only the
variables it names: the path, the home, the locale, the Claude Code token
read from the host's secret file, the App's id and the key holder's mint
command when the host configures the App, the setting that keeps Claude Code
from updating itself, and `CLAUDECODE` when its own environment holds it. It
SHALL accept a clone only by a name that is a single path segment under the
clones directory.

#### Scenario: The host's other variables

- **WHEN** the wrapper's own environment holds a variable it does not name
- **THEN** the pass's environment does not hold it

#### Scenario: The tokens stay out of process arguments

- **WHEN** the pass is running
- **THEN** no process's arguments hold the Claude Code token or a GitHub
  token

#### Scenario: Started from a Claude Code session

- **WHEN** the wrapper is started with `CLAUDECODE` in its environment
- **THEN** the pass receives it and the runner refuses, as `board-loop`'s
  *Started from an agent's shell* fixes

#### Scenario: A clone name that leaves the clones directory

- **WHEN** the clone named is empty, holds a `/`, is `..`, or names no git
  clone
- **THEN** the wrapper starts no pass, takes no lock, writes no stop file, and
  exits non-zero

#### Scenario: A secret file missing

- **WHEN** a secret file the wrapper reads is absent, empty or holds only
  whitespace
- **THEN** the wrapper starts no pass and exits non-zero, naming the file, and
  writes the stop file

#### Scenario: The App's settings reach the pass

- **WHEN** the host configures the App
- **THEN** the pass's environment holds the App's id and the mint command, and
  no path to the App's key

### Requirement: Remote Control runs on the saved login alone, and a failing login is reported

The process that runs `claude remote-control` on the host SHALL run as the
runner user and SHALL start with
none of `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` and
`ANTHROPIC_AUTH_TOKEN` in its environment, so the user's saved claude.ai login
is the credential it uses; the setup-token SHALL reach only the unattended
passes. A check SHALL run `claude auth status` on a timer in that process's
environment and SHALL report to the user a login that fails or carries the
expiry warning.

#### Scenario: A token variable in the remote-control files

- **WHEN** the tracked script or unit that starts `claude remote-control` sets
  or passes on `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` or
  `ANTHROPIC_AUTH_TOKEN`
- **THEN** the suite fails, naming the file and the variable

#### Scenario: A token variable inherited by the script

- **WHEN** the script that starts `claude remote-control` is run with any of
  the three variables in its environment
- **THEN** `claude` starts without them

#### Scenario: A login that fails

- **WHEN** `claude auth status` exits non-zero in the remote-control user's
  environment
- **THEN** the check exits non-zero, printing one line that says the login
  failed, and the user is told

#### Scenario: A login about to expire

- **WHEN** `claude auth status` succeeds and its output carries the expiry
  warning
- **THEN** the check exits non-zero, printing one line that names the
  warning, and the user is told

#### Scenario: The user it runs as

- **WHEN** the tracked script or unit starts `claude remote-control`
- **THEN** it starts it as the runner user, and that process cannot read the
  App's key
