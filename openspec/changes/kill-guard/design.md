# kill-guard — design

## Context

The guard reads one Bash call's text before it runs (`bun/command-guard.ts`),
splits it into commands (`command-parse.ts`), resolves each command's name
past paths, wrappers and nesting (`command-words.ts`) and refuses by rule id.
It sees the typed line and nothing the shell computes: a variable, a
substitution's output, what `xargs` reads from a pipe. The parse also removes
quoting, so a quoted `'>'` and a redirection read alike. The 06.11 calls were
plain `kill <pid> <pid>…` with literal pids taken from `ps aux | grep` (see
proposal.md — Why). The card left three questions open; the decisions below
answer them.

Measured on 07.11 on this machine:

- The Bash tool's shell is a child of the `claude` process, and a subagent
  runs inside that process: this subagent's shell (`zsh -c …`, pid 30635)
  hangs directly under `claude --resume <the main session's id>` (pid 5962).
- In a fresh Bash tool call, zsh's `$!` is `0`, and `kill $!` became
  `kill 0`: the call ended with exit 144 and printed nothing, the whole
  process group of that call having been signalled.
- The second local review reproduced in zsh, on `sleep` children of its own:
  `kill -0$(echo 9) <pid>` sends SIGKILL, `pgrep … | xargs -I-0 kill -0`
  sends SIGTERM, and `kill '<' <pid>` sends SIGTERM to the pid.

## Goals / Non-Goals

**Goals:**

- Refuse every form the 06.11 session used, and the forms a session would
  reach for next when that one is refused: `pkill -f`, `killall`,
  `pgrep … | xargs kill`, `kill $(pgrep …)`, a `kill` behind a prefix the
  guard does not know.
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

### 2. A word, not an invocation, triggers the check

A command is judged as a signal whenever one of its words, by base name, is
`kill`, `pkill`, `killall`, `killall5` or `skill` — wherever that word stands,
not only where `invocations` would read a command name. `invocations` finds a
name past the prefixes it lists (`WRAPPERS`, `KEYWORDS`) and stops at any
other: `noglob pkill bun`, `setsid pkill bun`, `arch -arm64 pkill bun`,
`watch -n1 kill 95034`, `find . -exec kill {} ;` and zsh's `repeat 1 kill`
all read as some other command. Growing that list is the enumeration
*Scope a scan by what it exempts* forbids; matching the word exempts nothing
and needs no list of prefixes.

The cost is a refused search for the bare word: `git grep -n pkill`,
`grep -rn kill .`, `echo kill`. A quoted phrase is one word and is not
matched (`git commit -m "refuse pkill"` passes), and a pattern such as
`'\bkill\b'` or `'[k]ill'` finds the same lines — quoted, since zsh reads an
unquoted `[k]ill` as a glob and fails on no match; the reason says so.

- `pkill`, `killall`, `killall5` and `skill` pick their targets by name
  across the machine, and are refused as `kill-by-name` in any position.
- `kill` passes only where it is the command's name — the first word that can
  be one, past assignments, redirections and reserved words (`FOO=1 kill %1`,
  `if kill -0 …`, `{ kill %1; }`) — so a `kill` behind any prefix at all,
  `xargs`, `command`, `sudo`, `noglob` or one never listed, is refused as
  `kill-signal`. `xargs` appends the pids it reads, and with `-I` or `-J`
  rewrites any word of `kill`'s, so no operand of a wrapped `kill` can be
  trusted. Which word can be a name is decided by one predicate in
  `command-words.ts`, lifted out of `invocations` and used by both.
- A `kill` in a command a substitution interrupts (`FED`) is refused: the
  substitution's output joins the words, even the one before it —
  `kill -0$(echo 9)` is `kill -09`.

### 3. The words a passing `kill` may hold (card question 2)

Every word after `kill` is read raw, in order, and each must fit; anything
else refuses the call:

1. A redirection glued to its target (`2>/dev/null`, `>out`, `2>&1`) is
   skipped: if it was quoted, `kill` gets a word that names no process. An
   open one (`>`, `2>`, `<`) is refused, since read as an operator it would
   hide the next word, and if quoted it hides nothing from `kill`:
   `kill '<' 95034` signals 95034.
2. An optional signal: `-0`, which sends none; `-s` or `-n` with the next
   word matching `^[A-Za-z0-9]+$`; or one word matching `^-[A-Za-z0-9]+$`
   (`-9`, `-KILL`, `-l`). Then an optional `--`.
3. The operands. After `-0` each must match `^[0-9]+$`: a liveness probe of a
   pid, nothing more — bash's `kill` still reads `-s KILL` after a first
   `-0`, and a `-9` there is a process group, so neither is let through.
   After any other signal each must match `^%[A-Za-z0-9_+%-]*$`, a literal job
   spec.

Matching each word whole is what keeps an expansion out: `$` and glob
characters fail every pattern, and an expansion glued to `%` or `-` splits
into more words than the guard read — in zsh `x=(1 95034); kill %$x` runs
`kill %1 95034`.

So:

- `$!` is refused like any variable. It would name the line's own last
  background job, but in a shell that started none zsh reads it as `0`, and
  `kill 0` signals the caller's whole process group (measured above).
- `$PPID` is refused: the Bash tool's parent is `claude` itself.
- `kill -0 95034` passes; `xargs kill -0`, `kill -0 $(pgrep bun)` and
  `kill -0 -s KILL 95034` do not. `kill -l` passes as a signal word with no
  operand; `kill -l 15` is refused, a cost accepted.
- `kill %1`, `kill -9 %1`, `kill -s KILL %1`, `kill -- %+` and
  `kill %1 2>/dev/null` pass; a bare `kill` passes, signalling nothing.

### 4. The reason (card question 3)

One reason for the two rule ids: stop a background task you started with
`TaskStop`; a job this same line started is `kill %N`; any other process is
not the session's to signal — ask the user. It adds that the bare word is
matched anywhere, so a search for it is written as `'[k]ill'`. It does not
suggest a pid from the session's own output, since decision 1 refuses that
pid too.

### 5. Where the check lives

Two functions in `command-guard-exec.ts`, beside `bunTestRetry` and
`depsArgs`, each returning a reason or `undefined` as they do, one per rule
id: `killByName(part)` and `killSignal(part)`. Both take the command's words,
not an invocation, so `check()` calls them once per command, before its walk
over `invocations`, and blocks each under its own id. The name-position
predicate is lifted from `invocations` into an export of `command-words.ts`,
with `invocations` switched to it in the same change. No new module.

## Risks / Trade-offs

- [A session cannot stop its own detached process by pid] → it starts
  long-lived processes with `run_in_background` and stops them with
  `TaskStop`; a process already detached goes to the user. d2ass's untracked
  `settings.local.json` allows three `pkill -f` patterns for its dev server;
  those calls become refusals (proposal.md — Impact).
- [A search for the bare word is refused] → the reason names `'[k]ill'`, which
  finds the same lines.
- [A signal sent from a program text] → inline or uncommitted: a `-c`
  string with `$` in it, `bun -e`, `python3 -c` and an uncommitted script are
  refused by the existing unread-program and interpreter checks. A committed
  script's `process.kill`, and a command string a tool runs itself
  (`watch "kill 95034"`, `sh -c` inside a committed script), run unread, and
  stay with the rule.
- [Senders by another name: `playwright-cli kill-all`, which the vendored
  `core/skills/playwright-cli` names and which stops every Playwright daemon
  of the user; `fuser -k`] → not gated, since no session was seen using one
  against another's process; they are what the shortened Safety rule names.

## Migration Plan

Ships with the next harness pin bump; nothing to migrate. In the same pull
request the stop-gap Safety rule in `core/rules.md` is shortened, under
`agent-rulebook`'s *A rule only partly covered*, to the senders the guard
cannot read: a committed script, a command string a tool runs itself,
`playwright-cli kill-all`, `fuser -k`.
