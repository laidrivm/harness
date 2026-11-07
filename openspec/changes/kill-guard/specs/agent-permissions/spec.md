## ADDED Requirements

### Requirement: A process is never signalled by name

The command guard SHALL block every `pkill` and `killall`, whatever their
options and wherever they stand on the line. Both pick their targets by name
across the machine, so neither can be shown to reach only a process the
session started. The reason SHALL name `TaskStop` for a background task the
session started.

#### Scenario: A name matched across the machine

- **WHEN** the agent attempts `pkill -f "bun test"`, `killall bun` or
  `pkill -P 123`
- **THEN** the hook blocks the call, and the reason names `TaskStop`

#### Scenario: A wrapped or nested pkill

- **WHEN** the agent attempts `/usr/bin/pkill bun`, `command pkill bun`,
  `noglob pkill -f "bun test"`, `bash -c "killall bun"` or
  `ps aux | grep bun && pkill bun`
- **THEN** the hook blocks the call

### Requirement: A signal goes only to a job of the line's own shell

The guard SHALL pass a `kill` whose first word is `-0`, `-l` or `-L`, which
sends no signal, however it is reached. Any other `kill` SHALL be blocked
unless no wrapper stands before it, no substitution feeds it, and every
operand is a literal job spec of the shell running the line (`%1`, `%+`,
`%sleep`): a pid, a process group, and a word carrying `$`, `$!` among them,
are refused. The reason SHALL name `TaskStop`, `kill %N` and asking the user.

#### Scenario: Pids found across the machine

- **WHEN** the agent attempts `kill 95034 27453`, `kill -9 68348` or
  `kill -TERM -- -123`
- **THEN** the hook blocks the call, and the reason names `TaskStop`,
  `kill %N` and the user

#### Scenario: Pids the guard cannot read

- **WHEN** the agent attempts `kill $pid`, `kill $PPID`, `kill $!`,
  `kill %$x`, `kill -$x %1`, `kill $(pgrep bun)` or `kill %1 $(pgrep bun)`
- **THEN** the hook blocks the call, because the pid is known only once the
  shell runs — `%$x` splits into `%1 95034` when `x` holds two words — and
  `$!` in a shell that started no job is `0`, which zsh reads as the whole
  process group

#### Scenario: Pids fed through a wrapper

- **WHEN** the agent attempts `pgrep bun | xargs kill`, `xargs kill %1`,
  `command kill %1`, `env kill %1`, `nocorrect kill 95034` or
  `caffeinate -i kill 95034`
- **THEN** the hook blocks the call, because `xargs` appends pids the guard
  never sees, and a name behind a zsh precommand modifier is still run

#### Scenario: A job the line started

- **WHEN** the agent attempts `sleep 30 & kill %1`, `kill -9 %1`,
  `kill -s KILL %1`, `kill -- %+`, `/bin/kill %1 2>/dev/null` or
  `{ kill %1; }`
- **THEN** the call is not blocked

#### Scenario: No signal sent

- **WHEN** the agent attempts `kill -0 95034`, `kill -l`, `kill -l 15`,
  `if kill -0 95034; then echo up; fi`, `xargs kill -0` or
  `kill -0 $(pgrep bun)`
- **THEN** the call is not blocked

#### Scenario: A kill written inside a program the guard reads

- **WHEN** the agent attempts `bash -c "kill 95034"` or `eval kill 95034`
- **THEN** the hook blocks the call
