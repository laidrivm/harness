## ADDED Requirements

### Requirement: The runner keeps one persistent session running as the session user

The container's start SHALL start, before sshd, a detached tmux session
`main` as the session user running the start script. The script SHALL loop:
in the session's clone, `git pull --ff-only` and then
`bun install --frozen-lockfile`, each failure printing a line that names it;
then `claude` with Remote Control under a fixed name, always a new
conversation; and, once `claude` exits, a 5-second pause before the next
round.

#### Scenario: Claude Code exits

- **WHEN** `claude` in `main` exits, by a crash or `/exit`
- **THEN** after 5 seconds the script pulls, installs and starts `claude`
  again, as a new conversation, never `--continue` (user, 02.11, answer 1 a)

#### Scenario: The pull fails

- **WHEN** `git pull --ff-only` fails, on a diverged branch or a failed
  token
- **THEN** the pane shows a line naming the pull, and `claude` starts on the
  tree the clone already holds

#### Scenario: The install fails

- **WHEN** `bun install --frozen-lockfile` fails
- **THEN** the pane shows a line naming the install, and `claude` starts all
  the same

#### Scenario: No clone yet

- **WHEN** the session's clone does not exist
- **THEN** the script runs neither the pull nor the install and starts
  `claude` in the session user's home

#### Scenario: The container restarts

- **WHEN** the runner container restarts or is recreated
- **THEN** `main` exists again as the session user, and its `claude` runs
  with Remote Control

### Requirement: The session's gh mints a token for each call

`gh` on the image's `PATH` SHALL be a wrapper. Called by the session user
with `GH_TOKEN` unset or empty, it SHALL ask the key holder for a token for
`laidrivm/harness` with `contents` and `pull_requests` write, `checks`,
`actions` and `statuses` read and `workflows` write (decision 39 б), and run
the real `gh` with that token in that process's environment alone. git's
credential helper SHALL be this wrapper. No token SHALL be written to disk.

#### Scenario: A call with no token

- **WHEN** the session user runs `gh` with no `GH_TOKEN`
- **THEN** the real `gh` runs with a token minted for that call in its
  environment, and no process's arguments hold the token

#### Scenario: A token already set

- **WHEN** `gh` runs with `GH_TOKEN` set, as `readPullRequests()` sets a
  read-only token
- **THEN** the real `gh` runs with that token, and nothing is minted

#### Scenario: Another user

- **WHEN** a user other than the session user, `runner` among them, runs
  `gh` with no `GH_TOKEN`
- **THEN** the real `gh` runs as it is, and nothing is minted

#### Scenario: The mint fails

- **WHEN** the key holder's mint exits non-zero
- **THEN** the wrapper exits with the mint's status and the real `gh` does
  not run

#### Scenario: The mint answers with no token

- **WHEN** the key holder's mint exits 0 and prints no token
- **THEN** the wrapper exits 1, naming it, and the real `gh` does not run

#### Scenario: git reaches GitHub

- **WHEN** the session user's git fetches from or pushes to `github.com`
- **THEN** git takes its credential from the wrapper, so a push an hour or
  more after the session started succeeds

#### Scenario: A permission the mint does not hold

- **WHEN** the wrapper asks for a permission or level outside the key
  holder's fixed set
- **THEN** the suite fails, naming it

### Requirement: The image carries the tools the pre-push gates run

The runner image SHALL carry a Node release of 22 or later as `node`, never
a link to bun, and the `actionlint` and `gitleaks` binaries from the images
and digests `.github/workflows/lint.yml` pins. It SHALL pin Claude Code by
version and checksum with its auto-updater off.

#### Scenario: A linter pin that drifts from CI's

- **WHEN** the Dockerfile's `actionlint` or `gitleaks` image differs from the
  one `lint.yml` names, tag or digest
- **THEN** the suite fails, naming both

#### Scenario: Node is bun

- **WHEN** the image links `node` to bun or installs no Node
- **THEN** the suite fails

#### Scenario: A tool that does not run

- **WHEN** the image is built and `node`, `actionlint`, `gitleaks` or
  `claude` cannot print its version
- **THEN** the build fails

### Requirement: The session commits as the App's bot, named only on the host

The commit identity SHALL reach the session from the `runner` service's
environment, interpolated from an untracked `orchestrator/.env` that compose
refuses to start without. No tracked file SHALL hold the App's slug, its
bot's numeric id or its bot's email.

#### Scenario: No identity on the host

- **WHEN** `orchestrator/.env` is absent or lacks a variable the identity
  needs
- **THEN** `docker compose up` refuses, naming the variable

#### Scenario: A bot email in a tracked file

- **WHEN** a tracked file under `orchestrator/` holds a GitHub bot's noreply
  address
- **THEN** the suite fails, naming the file

## RENAMED Requirements

- FROM: `### Requirement: No tracked file starts Remote Control`
- TO: `### Requirement: Only the session's start script starts Remote Control`

## MODIFIED Requirements

### Requirement: Only the session's start script starts Remote Control

No file under `orchestrator/` SHALL start Claude Code with Remote Control,
save `orchestrator/runner/session.sh`, the start script of the persistent
session, and `orchestrator/README.md`, which documents the session. Remote
Control on the host is that session, which the user reaches and clears from
the Claude app, and the emergency session the user starts by hand and ends.

#### Scenario: A tracked file that starts Remote Control

- **WHEN** a tracked file under `orchestrator/` other than the start script
  and the README runs `claude remote-control` or passes `--remote-control`
- **THEN** the suite fails, naming the file

### Requirement: Only the key holder reads the App's private key

The App's private key SHALL be readable by the key-holder user alone among
the host's unprivileged users; no automated `runner` or session user SHALL
read it. Root reads every file, and the user's emergency root session MAY
read the key while it runs (`design.md` *Remote Control is the user's root
session*). The
runner and the session user SHALL obtain an installation token only by
asking the key holder for one repository; the token SHALL last at most an
hour and carry permissions from a fixed set, and it SHALL never appear in a
process's arguments.

#### Scenario: The runner reads the key

- **WHEN** the runner or the session user opens the App's key file
- **THEN** the open fails for lack of permission

#### Scenario: The runner asks the key holder

- **WHEN** the runner or the session user needs the App's slug or a token
- **THEN** it runs the mint command for one repository, with `--slug` or the
  permissions, and reads the answer from that command's stdout alone

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

The session user SHALL be unable to read any secret file on the host outside
its own home: the runner's Notion bot token, the App's key, the claude.ai
login in root's home, every file the runner container mounts as a secret,
and the SSH and tunnel keys. Its own claude.ai login and its Notion settings
(roadmap decisions 16 and 42) SHALL live in its home, readable by it alone.

#### Scenario: Each secret file, as the session user

- **WHEN** the session user tries to read each secret file the host README
  provisions
- **THEN** every read fails for lack of permission, and the test names any
  file that it could read

#### Scenario: The session's own login

- **WHEN** the session user's claude.ai login or Notion settings file is in
  its home
- **THEN** its mode is 0600 and its owner the session user, and no other
  unprivileged user can read it
