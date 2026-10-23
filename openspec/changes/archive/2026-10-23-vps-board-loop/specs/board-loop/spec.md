# board-loop delta

## ADDED Requirements

### Requirement: A timer the user set up may start the runner

The runner SHALL accept a start by a timer the user set up on a host of their
own, as `orchestrator` fixes, and SHALL then behave as it does when started
from the user's terminal. It SHALL require no terminal: no TTY on standard
input and no `TERM` in its environment. The refusal for `CLAUDECODE` in *The
runner is the user's script and starts from a clean clone* SHALL apply
whatever started it.

#### Scenario: Started with no terminal

- **WHEN** the runner starts with standard input not a TTY, no `TERM`, and no
  `CLAUDECODE`
- **THEN** the pass runs as it would from a terminal, and its line and record
  are the same

#### Scenario: A timer started inside a Claude Code session

- **WHEN** a timer's command starts the runner with `CLAUDECODE` in its
  environment
- **THEN** the runner refuses, as *Started from an agent's shell* fixes
