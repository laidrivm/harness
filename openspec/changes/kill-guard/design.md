# kill-guard — design

## Context

The guard reads one Bash call's text before it runs (`bun/command-guard.ts`),
resolves each command's name past paths, wrappers and nesting
(`command-words.ts`, `command-parse.ts`) and refuses by rule id. It sees the
typed line and nothing the shell computes: a variable, a substitution's
output, what `xargs` reads from a pipe. The 06.11 calls were plain
`kill <pid> <pid>…` with literal pids taken from `ps aux | grep` (see
proposal.md — Why). The card left three questions open; the decisions below
answer them.

Measured on 07.11 on this machine:

- The Bash tool's shell is a child of the `claude` process, and a subagent's
  shell has the same parent as the main session's: this agent's shell
  (`zsh -c …`, pid 30635) and the main thread's both hang under
  `claude --resume …` (pid 5962). Subagents run inside that one process.
- In a fresh Bash tool call, zsh's `$!` is `0`, and `kill $!` became
  `kill 0`: the call ended with exit 144 and printed nothing, the whole
  process group of that call having been signalled.

## Goals / Non-Goals

**Goals:**

- Refuse every form the 06.11 session used, and the forms a session would
  reach for next when that one is refused: `pkill -f`, `killall`,
  `pgrep … | xargs kill`, `kill $(pgrep …)`.
- Keep the guard's one-bun-start cost on a call it allows: no process-table
  read, no file read.

**Non-Goals:**

- Letting a session signal a process it started in an earlier call by pid.
  `TaskStop` covers a task started with `run_in_background`; a process
  started detached (`nohup … &`) has to be stopped by the user.
- Signals sent by a test or a script the session runs. The guard sees the
  Bash call, not what the processes it starts do, and the harness's own
  tests signal only children they spawned.

## Decisions

### 1. Which pids are the session's: none the guard can name (card question 1)

The guard allows a `kill` only when every operand is a job spec, `%…`. A job
spec resolves against the job table of the shell running the line, and each
Bash call is a new shell, so `%1` can only name a job that same line started
with `&`. Everything else is refused.

Alternatives considered:

- **Ancestry**: allow `kill <pid>` when the pid descends from the session's
  `claude` process, read with `ps`. Rejected: subagents share that process
  (measured above), so one agent's pre-pr is a descendant of every other
  agent's session too — the very collision 06.11 showed, moved inside one
  session. It also misses a detached process re-parented to `launchd`, costs
  a `ps` walk per pid, and still cannot read `$pid` or `$(pgrep …)`.
- **A ledger of spawned pids**, written by a `PostToolUse` hook from what each
  launch printed. Rejected: a launch prints its pid only when asked to, a
  background task's output is not the hook's to read, and the ledger would
  need its own concurrency and expiry for a case `TaskStop` already covers.
- **Refuse every `kill`**. Rejected only because `kill %1` costs nothing to
  keep and d2ass's agents already use it.

### 2. `$!`, `$PPID`, `kill -0`, `kill %1` (card question 2)

- `$!` is refused like any variable. It would name the line's own last
  background job, but in a shell that started none zsh reads it as `0`, and
  `kill 0` signals the caller's whole process group (measured above).
- `$PPID` is refused: the Bash tool's parent is `claude` itself.
- `kill -0 <pid>` passes: signal 0 sends nothing and only tests that the pid
  exists. So do `kill -l` and `kill -L`, which list signal names.
- `kill %1` passes, as decided above; so do `kill -9 %1`, `kill -s KILL %1`
  and `kill -- %1`. The signal is the first word when it starts with `-`
  (`-s` and `-n` take the next word as theirs), and a `--` after it is passed
  over; every word left is an operand.
- A word starting with `-` among the operands is a process group, and is
  refused like a pid.

### 3. Wrappers and substitutions

A `kill` whose name is not the command's first word after assignments and
redirections — `xargs kill`, `command kill`, `env kill`, `sudo kill` — is
refused whatever its operands. `xargs` appends the pids it reads from the
pipe, so `xargs kill %1` would signal pids the guard never saw; telling
`xargs` from the harmless wrappers would mean modelling each wrapper's
options, which `invocations` deliberately does not do. A `kill` in a command
a substitution interrupts (`FED`) is refused, since the substitution's output
becomes operands the parse never holds. `pkill` and `killall` are refused
however they are reached; `invocations` already finds them past every
wrapper.

### 4. The reason (card question 3)

One reason for the two rule ids, `kill-signal` and `kill-by-name`: stop a
background task you started with `TaskStop`; a job this same line started is
`kill %N`; any other process is not the session's to signal — ask the user.
It does not suggest a pid from the session's own output, since decision 1
refuses that pid too.

### 5. Where the check lives

A `killSignal(part, name, rest)` in `command-guard-exec.ts`, beside
`bunTestRetry` and `depsArgs`, which already read one invocation's words with
`args()` and `FED`; `check()` calls it in the same place. No new module.

## Risks / Trade-offs

- [A session cannot stop its own detached process by pid] → it starts
  long-lived processes with `run_in_background` and stops them with
  `TaskStop`; a process already detached goes to the user. d2ass's untracked
  `settings.local.json` allows three `pkill -f` patterns for its dev server;
  those calls become refusals (proposal.md — Impact).
- [A rule for `kill` inside a program text the guard cannot read] → already
  refused: a `-c` string with `$` in it, `bun -e`, `python3 -c` and an
  uncommitted script are refused by the existing unread-program and
  interpreter checks before any signal.
- [Over-refusal of contrived forms such as `env -i kill %1`] → accepted, the
  safe way to be wrong, as for the guard's other checks.
- [Another signal sender, such as `launchctl kill` or `osascript`] → not
  covered; no session was seen using one, and a gate against an unseen
  threat is not added.

## Migration Plan

Ships with the next harness pin bump; nothing to migrate. The stop-gap
Safety rule in `core/rules.md` is deleted in the same pull request.
