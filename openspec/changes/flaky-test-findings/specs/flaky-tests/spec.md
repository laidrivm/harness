# flaky-tests — delta

## Purpose

How a flaky test — one that fails and then passes on an unchanged tree — is
noticed, named to the agent and recorded, and how a retry that would hide one
is refused before it runs or is committed.

## ADDED Requirements

### Requirement: A run that passes after an identical failed run is named as flaky

When a Bash call's output shows a failing bun test run, and the same command
later shows a passing run in the same session, from the same working directory,
on the same tree, the watch SHALL
tell the agent, through `additionalContext`, that the run is flaky rather than
green, naming every test the failing runs named. The same tree means the same
`HEAD`, the same uncommitted changes to tracked files, and the same untracked
files that are not ignored.

#### Scenario: Failed, then passed, unchanged

- **WHEN** `bun test` fails with `(fail) grp > flips [1.97ms]` and the same
  command then passes with nothing changed
- **THEN** the second call's `additionalContext` names `grp > flips`, without
  its duration, as flaky, and asks for a `flaky` finding and a card

#### Scenario: An edit between the two runs

- **WHEN** a tracked file is edited, or an untracked test file is created or
  changed, between the failing run and the passing one
- **THEN** the watch says nothing, since the tree the pass ran on is not the
  tree that failed

#### Scenario: A commit between the two runs

- **WHEN** a commit moves `HEAD` between the failing run and the passing one
- **THEN** the watch says nothing

#### Scenario: A different command passes

- **WHEN** `bun test` fails and `bun test bun/a.test.ts` then passes
- **THEN** the watch says nothing, because a narrower run is no evidence about
  the tests it did not run

#### Scenario: The same command from another directory

- **WHEN** `bun test` fails in one directory and the same command then passes
  in another directory of the same tree
- **THEN** the watch says nothing

#### Scenario: A pass with no failure before it

- **WHEN** a command passes and no failing run of it was seen on that tree
- **THEN** the watch says nothing

#### Scenario: Two failing runs, then a pass

- **WHEN** a run fails naming `a`, the same command fails again naming `b`,
  and it then passes on the same tree
- **THEN** the hint names both `a` and `b`

#### Scenario: The pass after a hint

- **WHEN** the watch has named a flaky run and the same command passes again
- **THEN** the watch says nothing the second time

#### Scenario: Another session's failure

- **WHEN** one session's run fails and another session's identical run passes
- **THEN** neither session is told anything

### Requirement: A test run is read from its output

The watch SHALL decide a run's outcome from bun's reporter in the call's
output, never from the call's exit code or the command's spelling: a `(fail)`
line or a nonzero `fail` count is a failing run, and a `0 fail` count with no
`(fail)` line is a passing run. Output carrying neither SHALL be no test run.

#### Scenario: A piped run that hides the exit code

- **WHEN** `bun test 2>&1 | tail -40` exits 0 with a `(fail)` line and
  `1 fail` in its output, and then exits 0 with `0 fail`
- **THEN** the watch names the flaky test, as for an unpiped run

#### Scenario: A run whose names were cut off

- **WHEN** the failing run's output shows `2 fail` but no `(fail)` line, and
  the same command then passes on the same tree
- **THEN** the hint names the run as flaky and says the failing names were not
  in the output

#### Scenario: A push whose pre-push hook runs the suite

- **WHEN** `git push` fails with a `(fail)` line from its pre-push hook and the
  same push then succeeds with `0 fail` on the same tree
- **THEN** the watch names the flaky test

#### Scenario: A script that wraps the suite

- **WHEN** `bun run test` fails with a `(fail)` line and then passes on the
  same tree
- **THEN** the watch names the flaky test

#### Scenario: A failing command that is not a test run

- **WHEN** a Bash call fails with output carrying no `(fail)` line and no
  `fail` count
- **THEN** the watch records nothing and says nothing

### Requirement: The watch never blocks

The watch SHALL NOT refuse a call or a turn: it SHALL exit 0 on every event,
and its only output SHALL be the hint. A flaky run is a finding for the agent
to report, not a gate to pass.

#### Scenario: A flaky run found

- **WHEN** the watch names a flaky run
- **THEN** it exits 0, and the call's result reaches the agent unchanged
  beside the hint

### Requirement: Each flaky finding is recorded in the gate ledger

The watch SHALL record each hint it gives as one record in the gate ledger,
through that ledger's writer and under its requirements *A record holds no
command text* and *Recording never changes a decision*, with the commit the
tree was read at. A failing run alone SHALL NOT be recorded.

#### Scenario: A finding recorded

- **WHEN** the watch names a flaky run at commit `C`
- **THEN** the ledger gains one record naming the watch, `flaky`, its rule id
  and `C`, and no test name, command or output

#### Scenario: A failure alone

- **WHEN** a test run fails and is not run again
- **THEN** the ledger is unchanged

### Requirement: The watch fails open

Whatever the watch cannot read or write SHALL decide nothing, and SHALL leave
the turn to go on as if the watch were absent. That covers an event that is not
JSON, a session id unsafe as a file name, a directory git cannot read, and a
store it cannot read or write.

#### Scenario: An unreadable event

- **WHEN** the watch receives an event that is not JSON
- **THEN** it exits 0 with no output

#### Scenario: Outside a repository

- **WHEN** a test run fails and passes in a directory that is not a git
  working tree
- **THEN** the watch exits 0 with no output both times

#### Scenario: An unwritable store

- **WHEN** the watch's store cannot be written and a run fails, then passes
- **THEN** both calls exit 0 with no output

### Requirement: Every consumer session runs the watch

The watch's registrations on `PostToolUse` and `PostToolUseFailure` SHALL be
among the hooks the harness registers in a consumer's `.claude/settings.json`,
and the consumer check SHALL fail a settings file that lacks either one, or
narrows one by a field that changes when it runs. Before the harness is
installed, each registration SHALL exit 0 and decide nothing.

#### Scenario: A consumer without the watch

- **WHEN** a consumer's settings carry every harness hook but the watch's
- **THEN** the check names each missing registration and the command that
  writes it

#### Scenario: A registration narrowed by `if`

- **WHEN** the watch's `PostToolUse` registration gains
  `"if": "Bash(bun test *)"`
- **THEN** the check fails, because `bun run test` and `git push` would no
  longer reach the watch

#### Scenario: Before the watch is installed

- **WHEN** a Bash call fails or succeeds in a clone where the harness is not
  installed yet
- **THEN** each registration exits 0 with no output

### Requirement: The guard refuses a test run with a retry

The command guard SHALL refuse a `bun test` invocation that carries
`--retry`, in any spelling, and a `bun run <script>` invocation that forwards
one. It SHALL NOT refuse `--rerun-each`, which finds flaky tests rather than
hiding them.

#### Scenario: A retry flag

- **WHEN** the agent attempts `bun test --retry=3`, `bun test --retry 3` or
  `bun --bun test --retry=1 bun/a.test.ts`
- **THEN** the guard blocks the call and names `--retry`

#### Scenario: A retry forwarded through a script

- **WHEN** the agent attempts `bun run test --retry=2`
- **THEN** the guard blocks the call

#### Scenario: Running each test many times

- **WHEN** the agent attempts `bun test --rerun-each=20`
- **THEN** the guard allows the call

### Requirement: The consumer check refuses a configured retry

`harness:check` SHALL fail a `retry` key under `[test]` in any tracked
`bunfig.toml`; a `retry` option passed to a test, `describe` or hook call in
any tracked source that imports `bun:test`; and a `bun test` or `bun run`
invocation carrying `--retry` in a command the tree holds — a tracked
`package.json`'s `scripts` or `simple-git-hooks` values, a tracked workflow's
`run:` step, a tracked file under `.githooks/` — read as the guard reads a
command line.

#### Scenario: A retry in bunfig

- **WHEN** a tracked `bunfig.toml`, at the root or below it, carries
  `retry = 2` under `[test]`
- **THEN** `harness:check` fails, naming the file

#### Scenario: A retry on a test

- **WHEN** a tracked file importing `bun:test` passes `{ retry: 2 }` as a
  test's options
- **THEN** `harness:check` fails, naming the file and the line

#### Scenario: The word in a string or a comment

- **WHEN** a file importing `bun:test` names `retry:` only inside a string, a
  template or a comment
- **THEN** `harness:check` reports nothing for it

#### Scenario: A retry key outside test code

- **WHEN** a tracked source that does not import `bun:test` carries
  `retry: true`, as an application's client options do
- **THEN** `harness:check` reports nothing for it

#### Scenario: A retry key in a test's fixture

- **WHEN** a file importing `bun:test` builds `const policy = { retry: 3 }`
  and hands it to the code under test, never to a test call
- **THEN** `harness:check` reports nothing for it

#### Scenario: A retry inside a script the agent runs

- **WHEN** a tracked `package.json` defines `"test": "bun test --retry=2"`,
  and the agent runs `bun run test`, which the guard allows
- **THEN** `harness:check` fails, naming the file and the script

#### Scenario: A retry in a workflow or a hook

- **WHEN** a tracked workflow step runs `bun test --retry=1`, or
  `.githooks/pre-push` does
- **THEN** `harness:check` fails, naming the file

#### Scenario: Running each test many times in a script

- **WHEN** a tracked `package.json` script runs `bun test --rerun-each=5`
- **THEN** `harness:check` reports nothing for it
