# orchestrator delta

## Purpose

The host that starts unattended agent runs outside any Claude Code session:
what its timer runs, what it hands that run, and what the tracked
`orchestrator/` directory may hold, so the host can be rebuilt from this tree
and a public tree holds none of its secrets.

## ADDED Requirements

### Requirement: The timer starts at most one pass per repository

The wrapper the timer runs SHALL take a non-blocking lock keyed by the
repository the clone's `origin` URL names, owner and name, before it starts a
pass. While another pass holds that lock, it SHALL start none, SHALL say the
lock is held, SHALL exit 0, and SHALL write no stop file. Two clones of one
repository SHALL share the lock, whether their URLs use HTTPS or SSH.

#### Scenario: A tick while a pass runs

- **WHEN** the timer fires while a pass of the same clone still holds the lock
- **THEN** no second pass starts, the line printed says the lock is held, the
  wrapper exits 0, and no stop file appears

#### Scenario: Two clones of one repository

- **WHEN** a pass runs in one clone and the wrapper is started for a second
  clone whose `origin` is the same repository
- **THEN** the second start runs no pass and says the lock is held

#### Scenario: Clones of two repositories

- **WHEN** passes are started for clones of two different repositories
- **THEN** both run

### Requirement: A failed pass pauses the timer until the user removes the stop file

When the pass exits non-zero, the wrapper SHALL write a stop file naming the
time, the exit status and the pass's last line, and SHALL exit with the pass's
status. While the stop file exists, the wrapper SHALL start no pass and SHALL
exit non-zero, naming the file. Nothing but the user SHALL remove it.

#### Scenario: The pass exits 1

- **WHEN** the board loop's pass exits 1
- **THEN** the stop file exists, holds the time, `1` and the pass's last line,
  and the wrapper exits 1

#### Scenario: The next tick after a failure

- **WHEN** the timer fires and the stop file exists
- **THEN** no pass starts, and the wrapper exits non-zero naming the stop file

#### Scenario: The user removes the stop file

- **WHEN** the user removes the stop file and the timer fires
- **THEN** a pass starts

#### Scenario: A pass that met its goal or found nothing

- **WHEN** the pass exits 0
- **THEN** no stop file is written

#### Scenario: The runner cannot start

- **WHEN** `bun` or the runner's file is missing, so the command exits
  non-zero without a pass
- **THEN** the stop file is written, as for a failed pass

#### Scenario: The connection that started the pass drops

- **WHEN** the session that started the wrapper hangs up mid-pass
- **THEN** the pass runs to its end, and the stop file reflects its exit
  status

### Requirement: The wrapper starts the pass with the environment it names

The wrapper SHALL start the pass with an environment holding only the
variables it names: the path, the home, the locale, the Claude Code token and
the GitHub token read from the host's secret files, the setting that keeps
Claude Code from updating itself, and `CLAUDECODE` when its own environment
holds it. It SHALL accept a clone only by a name that is a single path segment
under the clones directory.

#### Scenario: The host's other variables

- **WHEN** the wrapper's own environment holds a variable it does not name
- **THEN** the pass's environment does not hold it

#### Scenario: The tokens stay out of process arguments

- **WHEN** the pass is running
- **THEN** no process's arguments hold the Claude Code token or the GitHub
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

### Requirement: The orchestrator directory holds no secret

Every file under `orchestrator/` SHALL hold no token, key, password, host
address or n8n instance identifier. A value of that kind SHALL reach the host
from an untracked file there. A workflow exported from n8n SHALL keep only the
keys that describe the workflow, and a node's credential SHALL be referred to
by name alone.

#### Scenario: An exported workflow with instance data

- **WHEN** a tracked workflow holds `meta`, `shared`, `pinData` or a node
  credential carrying an `id`
- **THEN** the suite fails, naming the file and the key

#### Scenario: A literal secret in the compose file

- **WHEN** a service in the compose file sets a variable whose name says
  token, key, secret or password to a literal value rather than to a secret
  file
- **THEN** the suite fails, naming the service and the variable

#### Scenario: The secrets directory

- **WHEN** a file is written to the host's secrets directory under
  `orchestrator/`
- **THEN** git ignores it

### Requirement: Every pin in the orchestrator directory is exact and names what moves it

Each base image, image and tool version the orchestrator's files pin SHALL be
exact: an image by digest, a tool by full version. Beside each pin, a comment
SHALL name the tool that updates it, or say that nothing does. The n8n image
SHALL be no older than 2.38.2.

#### Scenario: An image named by tag alone

- **WHEN** a `FROM` line or an `image:` value carries no `@sha256:` digest
- **THEN** the suite fails, naming the line

#### Scenario: A pin without its note

- **WHEN** a pinned line has no comment beside it naming what updates it
- **THEN** the suite fails, naming the line

#### Scenario: An n8n image older than the fixes

- **WHEN** the n8n image's tag is below 2.38.2
- **THEN** the suite fails, naming the tag and the floor
