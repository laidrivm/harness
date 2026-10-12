# loop-guard — design

## Context

The harness's in-session hooks are the command guard (`PreToolUse`, Bash) and
the turn gate (`UserPromptSubmit` and `Stop`). Both are bun scripts that run
from the working tree in the harness and from `node_modules/harness/bun/` in a
consumer, through the texts in `bun/bootstrap.ts`. Neither sees what a tool
returned. The turn gate keeps a per-session mark in the OS temp directory and
fails open. The motivation is in proposal.md, *Why*, and the requirements are
in `specs/loop-guard/spec.md`.

What Claude Code exposes was read from its hooks reference
(`code.claude.com/docs/en/hooks`, which `docs.claude.com` redirects to) on
2026-10-12, with Claude Code 2.1.296 installed. It says:

- `PostToolUseFailure` fires once for each tool call that "started executing"
  and then failed. It does not fire for a call rejected before execution: an
  unknown tool, input failing schema or tool-specific validation (returned as
  a `tool_use_error`), or a permission denial. A call a `PreToolUse` hook
  blocks never starts executing either. Its input carries
  the common fields (`session_id`, `cwd`, and `agent_id` inside a sub-agent)
  and also `tool_name`, `tool_input`, `tool_use_id`, `error` and an optional
  `is_interrupt`. The docs advise keying on `tool_name`, `is_interrupt` and
  the error's `Exit code N` first line. The hook does not fire when a running
  tool is cancelled.
- A `decision: "block"` from `PostToolUseFailure` returns its `reason` to
  Claude as a tool error, and the turn continues. Exit 2 also only shows
  stderr to Claude, since the tool has already failed.
- `continue: false` with `stopReason` "stops processing entirely" and takes
  precedence over every event-specific decision. The reason stays in the
  conversation, so Claude sees it if the session is resumed. The page names,
  event by event, those that ignore `continue`, and `PostToolUseFailure` is
  not one of them. It gives no consolidated list.
- A command hook's default timeout is 600 s on tool events. A timed-out hook
  is cancelled and decides nothing. Exit codes other than 0 and 2 are
  non-blocking errors.
- Settings-file hooks run inside sub-agents, and in `claude -p` unless it runs
  with `--bare`.
- In an unattended session, Claude Code bounds every Bash call itself
  (`code.claude.com/docs/en/tools-reference`). A foreground call moves to the
  background at its timeout, which is 2 min by default and at most 10 min. A
  background call is stopped after 30 min by default, or 2 h at most. A
  `claude -p` run waits at most 10 min of idle time for other background work
  after its result.

## Goals / Non-Goals

**Goals:** one script on one event, pure functions for the fingerprint and the
decision so `bun test` covers them, and records through the ledger's writer.

**Non-Goals:** a hook on successful calls, any change to the command guard or
the turn gate, and a timer.

## Decisions

### Count on `PostToolUseFailure` alone

The guard counts failures and never resets on a success.

- *Alternative: also register `PostToolUse` to clear a call's count when it
  succeeds.* That costs a bun start on every successful call, which is nearly
  every call, to cover a call that failed the same way twice, succeeded, and
  then failed the same way twice more. The error text already separates a red
  test that turned into a different red from one that stayed put.
- *Alternative: a `PreToolUse` hook on every tool that refuses the next
  identical call before it runs,* as the card first sketched. It saves one run
  of the failing call, at the cost of a bun start before every call of every
  tool. The repeat that matters is already spent by the time it is counted.

### The fingerprint is tool, input and normalised error, hashed

The key is the SHA-256 of `tool_name`, `tool_input` with `description` removed
and serialised with sorted keys, and `error` with each run of digits replaced
by `#` and each run of whitespace by one space. The count file maps these
hashes to counts, so nothing in it reads back as a command or an error.

- *Alternative: tool and error only.* This is what the card's example asked
  for: `update_content` returning "No matches found" several times. A
  different input is a change of approach, even when it fails the same way.
  The transcripts back this only weakly. The three keys it would have tripped
  on in *Measurements* include two that were not loops: an agent editing four
  different files it had not read yet, and three edits to files a linter had
  changed. But all three are rejections the hook never receives.
- *Alternative: the error's first line only,* as the docs suggest for
  matching. For Bash that line is `Exit code 1`, which merges every failing
  command into one.

### The count lives beside the turn gate's marks

There is one JSON file per session, or per session and sub-agent, under
`join(tmpdir(), "loop-guard")`. It is keyed by `session_id`, plus `agent_id`
when one is present, and it uses the turn gate's test for an id that is safe
as a file name. The count needs to last only as long as the session, so the
temp directory, which a reboot clears, is the right lifetime. The ledger is the
wrong home: it is append-only and kept forever.

### Warn at three, stop at four

The thresholds are fixed by `specs/loop-guard/spec.md` and are not
configurable. The warning goes out as `decision: "block"` with a `reason`,
which reaches Claude beside the error and leaves the turn running. The stop
goes out as `{"continue": false, "stopReason": "loop-guard: …"}`.

- *Alternative: stop at three with no warning.* The card asks for a chance to
  change approach first. One extra failed call is the cost.
- *Alternative: tell interactive from unattended sessions, and only warn when
  a person is present.* No documented hook input says which it is. A person
  who reads a stop types "continue", which is cheap. An unattended loop that
  is only warned goes on spending.

### The stop is the escalation

Without a person present, a reason that a launcher can read is all a hook can
deliver. `claude -p` returns the stop in its result, and an orchestrator
reading a sub-agent's output sees the same text. Turning that text into a
question for the user is the questions card's work. This change fixes only the
`loop-guard:` prefix that card can match on.

### Records go through the ledger's writer

Each warning and each stop is one call to the writer that
`gate-decision-ledger` step 1 adds to `bun/gate-ledger.ts`. The gate is
`loop-guard`, the decision is `warned` or `stopped`, and the rule is
`repeated-failure`. The writer is already silent on failure, so the guard's
decision does not depend on it.

### No timers

The card asked for an idle timer and a completion timer. Neither fits here. A
hook runs only when an event fires, and the hang the idle timer is for is the
absence of events. A completion timer needs a process outside the session.
What the docs show Claude Code already doing in an unattended session (see
*Context*) bounds a hang inside a call. What is left is a session that waits
silently between calls, and that is the launcher's to time. It is recorded as
a non-goal and not given a card here: the orchestrator owns the launcher.

### Hooks, not a mod

The card weighed a mod, which watches `tool.call`, keeps its count in memory
and answers `deny`. The harness ships no plugin today, mods are unverified in
`claude -p`, and the mod API is marked as changing between releases. The pure
functions here move into a mod unchanged, if the mod-plugin card is taken up.

## Measurements

The retained transcripts were scanned on 2026-10-12, in all of
`~/.claude/projects/`: the harness, d2ass, mellon and two others. That is 53
files, the oldest from 2026-09-11, holding 130 failed calls once permission
refusals and user interruptions are excluded. The scan read every error
result, validation rejections included, so it counts a superset of what the
hook receives.

- Keyed by tool, input and normalised error, as decided: no transcript holds
  any call that failed the same way twice. The guard would never have warned.
- Keyed by tool and error alone: one d2ass transcript reaches three or more,
  on three keys. The first is four Edits to files not yet read, each on a
  different file. The second is three Edits to files modified since they were
  read. The third is three commits the command guard refused on `main`.
  None of the three would reach the hook. The Edits are `tool_use_error`
  validation rejections, and the commits were blocked by a `PreToolUse` hook,
  so none of them started executing (*Context*).

So the measurement shows no false positive for the chosen key in a month of
ordinary work. It also shows no loop caught. The evidence that one is needed
is the card's: unattended runs, where nobody is watching. The count is cheap
when it is wrong, since a warning costs one sentence and a stop costs one
"continue".

## Risks / Trade-offs

- [`continue: false` from `PostToolUseFailure` may not end a `claude -p` run,
  or may stop only the sub-agent it fired in] → Task 1.1 probes both before
  any code is written. If the stop is not honoured, the step reports `BLOCKED`
  instead of redesigning in place.
- [The turn gate's `Stop` hook may run after the stop and refuse it] → Probed
  in task 1.1. The turn gate refuses at most once per mark. A loop stopped in
  a turn that also completed a task group could therefore cost one extra
  continuation, which is accepted.
- [Parallel failures in one session can race on the count file and lose an
  increment] → The guard undercounts, so it fails open. Accepted.
- [Count files accumulate in the temp directory] → One small file per session,
  cleared on reboot, as the turn gate's marks are. It gets a `ponytail:`
  comment naming pruning as the upgrade.
- [The thresholds are judgement, not measurement] → No loop has been recorded
  yet to measure them against. The ledger's counts are what would show
  whether three and four are right.

## Migration Plan

The harness registers the hook in its own `.claude/settings.json`. Consumers
gain it on their next pin bump, when `sync.ts` writes it, and their check
fails until it is written. Rolling back means reverting the change. The count
files are inert.
