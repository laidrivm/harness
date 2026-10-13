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
2026-10-12 and 2026-10-13, with Claude Code 2.1.296 installed. It says:

- `PostToolUseFailure` fires once for each tool call that "started executing"
  and then failed. It does not fire for a call rejected before execution: an
  unknown tool, input failing schema or tool-specific validation (returned as
  a `tool_use_error`), or a permission denial. A call a `PreToolUse` hook
  blocks never starts executing either.
- Its input carries the common fields: `session_id`, `cwd`, `prompt_id`
  ("identifying the user prompt currently being processed", absent until the
  first user input), and `agent_id` inside a sub-agent. It also carries
  `tool_name`, `tool_input`, `tool_use_id`, `error` and an optional
  `is_interrupt`. The hook does not fire when a running tool is cancelled.
- Its only documented event-specific output is
  `hookSpecificOutput.additionalContext`, a "string added to Claude's context
  alongside the error". The decision table also lists a top-level
  `decision: "block"` for it, which returns `reason` to Claude as a tool error
  while the turn goes on. Exit 2 only shows stderr to Claude, since the tool
  has already failed.
- `continue: false` with `stopReason` is documented, for every event, to stop
  "processing entirely". Under `claude -p` it did not, when it came from
  `PostToolUseFailure` (*Measurements*). The page's own section for that event
  says nothing about `continue`.
- A `PreToolUse` command hook that exits 2 "blocks the tool call". Its stderr
  is the message Claude reads, and Claude Code then continues. The command
  guard relies on exactly this, and the same holds for
  `permissionDecision: "deny"` with a `permissionDecisionReason`.
- `PostToolBatch` runs once a batch of tool calls has resolved, before the
  next model call. `decision: "block"`, `continue: false` or exit 2 "stops the
  agentic loop before the next model call". Its input lists the calls with
  their responses, but has no failure flag. The page does not say how it is
  ordered against `PostToolUseFailure`.
- A `Stop` hook runs only once the turn is already ending. `stage-goal`'s
  probe showed `continue: false` from one ending a goal-driven `-p` run
  (`openspec/changes/stage-goal/design.md`). It cannot cut short a turn that
  is still calling tools, and a loop is exactly such a turn.
- A command hook's default timeout is 600 s on tool events. A timed-out hook
  is cancelled and decides nothing, so a stalled `PreToolUse` hook does not
  block. Exit codes other than 0 and 2 are non-blocking errors.
- Settings-file hooks run inside sub-agents, and in `claude -p` unless it runs
  with `--bare`.
- In an unattended session, Claude Code bounds every Bash call itself
  (`code.claude.com/docs/en/tools-reference`). A foreground call moves to the
  background at its timeout, which is 2 min by default and at most 10 min. A
  background call is stopped after 30 min by default, or 2 h at most. A
  `claude -p` run waits at most 10 min of idle time for other background work
  after its result.

## Goals / Non-Goals

**Goals:** one script on two events, sharing one count file. The call key, the
fingerprint and both decisions are pure functions, so `bun test` covers them.
Records go through the ledger's writer.

**Non-Goals:** a hook on successful calls, any change to the command guard or
the turn gate, ending the session, and a timer.

## Decisions

### Count after the failure, refuse before the call

`PostToolUseFailure` counts. `PreToolUse` refuses. One script serves both,
choosing its role from the event's `hook_event_name`.

- *Alternative: stop the session from `PostToolUseFailure` with
  `continue: false`.* This was the first draft, and it is refuted
  (*Measurements*).
- *Alternative: `PostToolBatch` with `decision: "block"`.* It is the one event
  documented to stop the loop, and it fires once per model turn rather than
  once per call. It sees no failure flag, so it would read the count file that
  `PostToolUseFailure` writes, and the docs do not order the two. After the
  `continue: false` result, a documented stop is not evidence of a working
  one. It is left to a later change, behind a probe of its own. The probe kit
  carries one as an optional extra.
- *Alternative: also register `PostToolUse` to clear a count when a call
  succeeds.* That costs a bun start on every successful call, to cover a call
  that failed the same way three times, succeeded, and then failed again. The
  bar's lifetime handles that case instead (*The bar lasts until the next
  prompt*).

The price is a bun start before every tool call, at the cost the command
guard's header records. That is the cost the first draft avoided, and it is now the
only documented mechanism that has been seen to work.

### The call key and the fingerprint

The **call key** is the SHA-256 of `tool_name` and of `tool_input` with
`description` removed, serialised with sorted keys. `PreToolUse` has only the
call, so the key is all it can match on.

The **fingerprint** is the SHA-256 of the call key and of `error`, with each
run of digits replaced by `#` and each run of whitespace by one space. Digits
are dropped because an error carries timestamps, ids and durations that differ
on every call and would hide a repeat. The cost is that errors differing only
by a number, such as HTTP 404 and 500, count as one. With the tool and input
unchanged the agent has not changed approach, so that is accepted. The count
file maps these hashes to counts, so nothing in it reads back as a command or
an error.

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
as a file name. It holds the counts by fingerprint, and the barred call keys,
each with the `prompt_id` it was barred under. The count needs to last only as
long as the session, so the temp directory, which a reboot clears, is the
right lifetime. The ledger is the wrong home: it is append-only and kept
forever.

### Warn at three, refuse from the fourth

The thresholds were settled by the user on 2026-10-12 and are fixed by
`specs/loop-guard/spec.md`, not by configuration.

- On the third failure with one fingerprint, `PostToolUseFailure` bars the
  call key. It answers with `additionalContext`, the documented field: the
  call has failed the same way three times, and the next identical call will
  be refused.
- `PreToolUse` refuses a barred call by exiting 2 with a reason on stderr that
  starts `loop-guard:`, the form the command guard already uses, and repeats
  the warning's advice: change approach or end the turn `BLOCKED`. An identical
  call made after the third failure is recorded therefore never runs.
  Identical calls made in parallel, and checked before that record is
  written, can still run. Nothing orders the hooks of separate calls in one
  batch.

- *Alternative: refuse at the third, with no warning.* The card asks for a
  chance to change approach first. One extra failed call is the cost.

### The bar lasts until the next prompt

A call key stays barred while `prompt_id` equals the one recorded with it. A
new prompt, whether a person's reply or a launcher resuming the session with
an answer, lifts it. If the call then fails the same way once more, its count
is past three, so it is barred again under the new prompt. The bar lifts on
its own because nothing else can tell the guard that the cause was fixed
outside the session. If an event carries no `prompt_id`, the bar holds for
the session.

- *Alternative: bar for the whole session.* A session resumed after its
  database was started could never run the call it was waiting on.

### The guard refuses the call, it does not end the session

The guard stops the repeat, not the agent. An agent that keeps calling the
barred command is refused each time, at the cost of a model turn and no tool
run. Ending such a run is the launcher's job. A launcher can see the
`loop-guard:` refusals in the session's output, or count the guard's records
in the ledger. It can also cap the run with `--max-turns`, which `stage-goal`'s
probe saw end a `-p` run with `error_max_turns`.

Turning that into a question for the user is the questions card's work. This
change fixes only the `loop-guard:` prefix that card can match on.

### Records go through the ledger's writer

Each warning and each refusal is one call to `record` in `bun/gate-ledger.ts`.
The gate is `loop-guard`, the decision is `warned` or `refused`, and the rule
is `repeated-failure`. The writer is already silent on failure, so the guard's
decision does not depend on it.

### No timers

The card asked for an idle timer and a completion timer. Neither fits here. A
hook runs only when an event fires, and the hang the idle timer is for is the
absence of events. A completion timer needs a process outside the session.
What the docs show Claude Code already doing in an unattended session (see
*Context*) bounds a hang inside a call. What is left is a session that waits
silently between calls, and that is the launcher's to time. The user settled
this on 2026-10-12.

### Hooks, not a mod

The card weighed a mod, which watches `tool.call`, keeps its count in memory
and answers `deny`. The harness ships no plugin today, mods are unverified in
`claude -p`, and the mod API is marked as changing between releases. The pure
functions here move into a mod unchanged, if the mod-plugin card is taken up.

## Measurements

**The probe that refuted the first draft (2026-10-13).** This was the user's
run of task 1.1's first question, before any guard code. The setup:
- a scratch repository whose `PostToolUseFailure` hook logged each event and,
  from the second failure on, printed
  `{"continue": false, "stopReason": "loop-guard: probe …"}`;
- `claude -p` told to run `false` three times, one call at a time, with
  stream-json output and `permission_mode` `default`.

What happened:
- The first and second `false` each fired `PostToolUseFailure`, and the second
  answered `continue: false`.
- The third `false` still ran. It fired the hook again, which answered
  `continue: false` again.
- The turn then ended normally, through `Stop`, with the model's own "Done.".
- The process exited 0, and `loop-guard: probe` appeared nowhere in the
  stream-json output.

So `continue: false` from this event neither stopped the run nor surfaced its
reason. The second, third and fourth questions of that probe were not run.

**The probe that confirmed the revision (2026-10-13).** The user ran R1 of the
revised kit. The setup:
- a scratch repository whose hook counted failures per Bash command;
- on a command's second failure, the hook barred it and answered with an
  `additionalContext` warning;
- `PreToolUse` refused the barred command with exit 2 and a `loop-guard:`
  reason;
- `claude -p` was told to run `false` four times and quote any hook note.

The hook bars at the second failure, not the third, only to keep the run
short.

The four counts:
- `FAILED false` in the log: 2;
- `DECISION refused` in the log: 1;
- `loop-guard: probe refused` in the stream-json output: 3;
- `loop-guard: probe warning` in that output: 2.

So the barred call never ran again (R1). The refusal's reason reached the
model and the `-p` output (R2), and so did the warning (R3). The model tried the
refused call once and did not try it again.

R4 (the bar inside a sub-agent) and R5 (`PostToolBatch`) were not run. R4
stays in task 1.1.

**Transcripts.** The retained transcripts were scanned on 2026-10-12, in all of
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
is the card's: unattended runs, where nobody is watching. The guard is cheap
when it is wrong. A warning costs one sentence. A refusal costs one call that
a new prompt lets through again.

## Risks / Trade-offs

- [A `PreToolUse` refusal may behave differently outside Bash, or inside a
  sub-agent] → Task 1.1 probes a sub-agent. The R1 probe and the command
  guard's refusals are the evidence for Bash. Other tools are covered only by
  the docs, which promise the same block for every tool.
- [An agent may keep calling the barred command, spending model turns] → Each
  refusal is recorded. Ending the run is the launcher's job (*The guard
  refuses the call, it does not end the session*).
- [Every tool call pays a bun start] → At the cost the command guard's header
  records, beside calls that take far longer. It is the price of the only
  mechanism seen to work.
- [Parallel failures in one session can race on the count file and lose an
  increment] → The guard undercounts, so it fails open. Accepted.
- [Count files accumulate in the temp directory] → One small file per session,
  cleared on reboot, as the turn gate's marks are. It gets a `ponytail:`
  comment naming pruning as the upgrade.
- [The thresholds are judgement, not measurement] → The user settled them. The
  ledger's counts are what would show whether three and four are right.

## Migration Plan

The harness registers both hooks in its own `.claude/settings.json`. Consumers
gain them on their next pin bump, when `sync.ts` writes them, and their check
fails until they are written. Rolling back means reverting the change. The
count files are inert.
