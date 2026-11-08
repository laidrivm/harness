## ADDED Requirements

### Requirement: A process is never signalled by name

The command guard SHALL block every command one of whose words, by base
name, is `pkill`, `killall`, `killall5` or `skill`, wherever the word stands
and whatever comes before it. Each picks its targets by name across the
machine, so none can be shown to reach only a process the session started.
The reason SHALL name `TaskStop` for a background task the session started.

#### Scenario: A name matched across the machine

- **WHEN** the agent attempts `pkill -f "bun test"`, `killall bun`,
  `pkill -P 123` or `skill -KILL -c bun`
- **THEN** the hook blocks the call, and the reason names `TaskStop`

#### Scenario: Behind a prefix, nested or chained

- **WHEN** the agent attempts `/usr/bin/pkill bun`, `command pkill bun`,
  `noglob pkill -f "bun test"`, `setsid pkill bun`, `arch -arm64 pkill bun`,
  `bash -c "killall bun"` or `ps aux | grep bun && pkill bun`
- **THEN** the hook blocks the call

#### Scenario: The bare word in a search

- **WHEN** the agent attempts `git grep -n pkill`
- **THEN** the hook blocks the call, and the reason names a quoted
  `'[k]ill'`-style pattern for the search; `git commit -m "refuse pkill"`,
  whose message is one word, is not blocked

### Requirement: A signal goes only to a job of the line's own shell

The guard SHALL block a command holding the word `kill`, by base name,
unless `kill` is its command name with nothing but assignments,
redirections and reserved words before it, no substitution feeds the
command, and the words after it are: redirections glued to their targets; a
signal (`-0` only with plain numeric pids after it); a `--`; and literal job
specs (`%1`, `%+`). The reason SHALL name `TaskStop`, `kill %N` and the user.

#### Scenario: Pids found across the machine

- **WHEN** the agent attempts `kill 95034 27453`, `kill -9 68348`,
  `kill -TERM -- -123` or `kill %1 95034`
- **THEN** the hook blocks the call, and the reason names `TaskStop`,
  `kill %N` and the user

#### Scenario: Pids the guard cannot read

- **WHEN** the agent attempts `kill $pid`, `kill $PPID`, `kill $!`,
  `kill %$x`, `kill -$x %1`, `kill $(pgrep bun)`, `kill %1 $(pgrep bun)`,
  `kill -0 $(pgrep bun)` or `kill -0$(echo 9) 95034`
- **THEN** the hook blocks the call, because the pid is known only once the
  shell runs — `%$x` splits into `%1 95034` when `x` holds two words — and
  `$!` in a shell that started no job is `0`, which zsh reads as the whole
  process group

#### Scenario: A kill behind a prefix

- **WHEN** the agent attempts `pgrep bun | xargs kill`, `xargs kill %1`,
  `pgrep bun | xargs -I-0 kill -0`, `xargs kill -0`, `command kill %1`,
  `env kill %1`, `nocorrect kill 95034`, `watch -n1 kill 95034` or
  `find . -name x -exec kill {} ;`
- **THEN** the hook blocks the call, because a prefix may append or rewrite
  `kill`'s words

#### Scenario: A word that hides the next

- **WHEN** the agent attempts `kill '<' 95034`, `kill %1 '>' 95034` or
  `kill %1 > /dev/null`
- **THEN** the hook blocks the call, because a quoted `<` reaches `kill` as a
  word the parse cannot tell from a redirection

#### Scenario: A signal after a no-signal probe

- **WHEN** the agent attempts `kill -0 -s KILL 95034` or `kill -0 -9 95034`
- **THEN** the hook blocks the call, because bash reads `-s KILL` after `-0`
  and `-9` there is a process group

#### Scenario: A job the line started

- **WHEN** the agent attempts `sleep 30 & kill %1`, `kill -9 %1`,
  `kill -s KILL %1`, `kill -- %+`, `/bin/kill %1 2>/dev/null`,
  `FOO=1 kill %1` or `{ kill %1; }`
- **THEN** the call is not blocked

#### Scenario: No signal sent

- **WHEN** the agent attempts `kill -0 95034`, `kill -l`, a bare `kill` or
  `if kill -0 95034; then echo up; fi`
- **THEN** the call is not blocked

#### Scenario: A kill written inside a program the guard reads

- **WHEN** the agent attempts `bash -c "kill 95034"` or `eval kill 95034`
- **THEN** the hook blocks the call
