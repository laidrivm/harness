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
  `bash -c "killall bun"` or `ps aux | grep bun && pkill bun`
- **THEN** the hook blocks the call

### Requirement: A signal goes only to a job of the line's own shell

The command guard SHALL block a `kill` unless every operand names a job of
the shell running that line (`%1`, `%+`, `%sleep`), the signal is `0`
(`kill -0`, which sends none), or it lists signals (`-l`, `-L`). A numeric
pid, a process group, a variable, `$!` among them, and a substitution's output
SHALL be refused, and so SHALL a `kill` behind a wrapper such as `xargs`. The
reason SHALL name `TaskStop`, `kill %N` and asking the user.

#### Scenario: Pids found across the machine

- **WHEN** the agent attempts `kill 95034 27453`, `kill -9 68348` or
  `kill -TERM -- -123`
- **THEN** the hook blocks the call, and the reason names `TaskStop`,
  `kill %N` and the user

#### Scenario: Pids the guard cannot read

- **WHEN** the agent attempts `kill $pid`, `kill $PPID`, `kill $!`,
  `kill $(pgrep bun)` or `kill %1 $(pgrep bun)`
- **THEN** the hook blocks the call, because the pid is known only once the
  shell runs, and `$!` in a shell that started no job is `0`, which zsh
  reads as the whole process group

#### Scenario: Pids fed through a wrapper

- **WHEN** the agent attempts `pgrep bun | xargs kill`, `xargs kill %1`,
  `command kill %1` or `env kill %1`
- **THEN** the hook blocks the call, because `xargs` appends pids the guard
  never sees

#### Scenario: A job the line started

- **WHEN** the agent attempts `sleep 30 & kill %1`, `kill -9 %1`,
  `kill -s KILL %1`, `kill -- %+` or `/bin/kill %1 2>/dev/null`
- **THEN** the call is not blocked

#### Scenario: No signal sent

- **WHEN** the agent attempts `kill -0 95034`, `kill -l` or `kill -l 15`
- **THEN** the call is not blocked

#### Scenario: A kill written inside a program the guard reads

- **WHEN** the agent attempts `bash -c "kill 95034"` or `eval kill 95034`
- **THEN** the hook blocks the call
