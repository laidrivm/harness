# Spec Delta

## Purpose

What the harness does as a session's context window fills: when the session
is asked to run `/session-wrapup` before auto-compaction takes the window, how
often it is asked, and what the asking reads to know the window's size.

## ADDED Requirements

### Requirement: A full context asks for the wrap-up

The turn gate's `Stop` half SHALL refuse to end a turn whose context size is
at or above 800 000 tokens, by exiting 2 with a reason on stderr that tells the
session to finish the step in hand, run `/session-wrapup`, then tell the user
«можно /clear» — or, while a subagent it started is still running, to end the
turn saying the wrap-up waits for its report, and run it once the report is
in. Below the threshold it SHALL add nothing to the stop.

#### Scenario: A context past the threshold

- **WHEN** a stop arrives and the context size reads 812 000
- **THEN** the hook exits 2, and its stderr names `/session-wrapup`,
  «можно /clear», the running subagents and the size it read

#### Scenario: A context at the threshold

- **WHEN** the context size reads exactly 800 000
- **THEN** the hook refuses the stop

#### Scenario: A context below the threshold

- **WHEN** the context size reads 799 999
- **THEN** the turn ends as the turn gate alone decides it

### Requirement: A wrap-up already in the tail is not asked for

A stop at or above the threshold whose transcript tail holds a call of the
`session-wrapup` skill — the model's `Skill` call or the user's typed
`/session-wrapup` — after the tail's last compaction boundary, if any, SHALL
NOT be refused for size, and SHALL count as the context's one ask. A call
before that boundary belongs to an earlier context and SHALL NOT count.

#### Scenario: The wrap-up the done line started

- **WHEN** the turn ran `/session-wrapup` through the `Skill` tool after a
  `next:` line and its stop measures 815 000
- **THEN** the turn ends, and a later stop at 830 000 in that context ends too

#### Scenario: A wrap-up the user typed

- **WHEN** the tail holds the user's typed `/session-wrapup` and the stop
  measures 815 000
- **THEN** the turn ends

#### Scenario: A wrap-up from before a compaction

- **WHEN** the tail holds a `session-wrapup` call, then a compaction
  boundary, then replies up to 810 000, and the mark was re-armed
- **THEN** the stop is refused for size

### Requirement: An unattended session is not asked

A session whose first user message holds the line `This session runs
unattended.` (`agent-autonomy`) SHALL NOT be refused for size: a launcher
reads its final message. The line SHALL be read with the question gate's own
code, at most once per context.

#### Scenario: A board-loop stage past the threshold

- **WHEN** a session started with that line measures 820 000 at a stop, and
  830 000 at the next
- **THEN** both turns end as the turn gate alone decides them, and the line
  is read at the first stop alone

### Requirement: The size is the last reply's, read from the transcript's tail

The context size SHALL be `input_tokens + cache_read_input_tokens +
cache_creation_input_tokens` of the `usage` of the last main-thread assistant
reply in the event's `transcript_path`, read from the file's tail alone. A
reply marked as a sidechain, or whose sum is zero, SHALL be passed over. No
transcript, an unreadable one, or a tail with no such reply SHALL read as no
size, which asks nothing.

#### Scenario: The last reply counts

- **WHEN** the transcript's earlier reply reads 900 000 and its last reply
  reads 120 000, as after a compaction
- **THEN** the size is 120 000 and nothing is asked

#### Scenario: A sidechain or synthetic reply after the last real one

- **WHEN** the last assistant line is a sidechain's, or a reply whose usage
  sums to zero, and the reply before it reads 810 000
- **THEN** the size is 810 000

#### Scenario: A large transcript

- **WHEN** the transcript is larger than the tail the hook reads, and its
  only assistant reply, reading 810 000, lies before that tail
- **THEN** no size is read and nothing is asked

#### Scenario: A transcript smaller than the tail

- **WHEN** the transcript is smaller than the tail and its only assistant
  reply is its first line, reading 810 000
- **THEN** the size is 810 000

#### Scenario: No size to read

- **WHEN** the event names no transcript, the file is missing, or its tail
  holds no assistant reply with a usage
- **THEN** nothing is asked, and the turn gate's decision stands

### Requirement: The wrap-up is asked once per context

After a refusal for size, or a stop that counts as the ask, the hook SHALL NOT
refuse for size again in that session until a stop re-arms it: one that
measures under half the threshold, 400 000, which only a compaction or a
cleared context reaches, or one whose tail's last compaction boundary is not
the one the tail held when the record was written. The re-arm SHALL be read
at every stop with a size, a stop the turn gate refuses and one under a mark
it refused included. The record SHALL be kept per session id outside the
tree, where a restart of Claude Code that resumes the session id finds it.

#### Scenario: The continued turn

- **WHEN** the stop after a refusal for size measures 830 000
- **THEN** the turn ends

#### Scenario: A compaction re-arms it

- **WHEN** a refusal for size was made, a later stop measures 150 000, and a
  still later one 805 000
- **THEN** the last one is refused for size

#### Scenario: A small shrink does not re-arm it

- **WHEN** a refusal for size was made at 805 000, a later stop measures
  790 000, and a still later one 802 000
- **THEN** neither later stop is refused for size

#### Scenario: A wrap-up, a compaction and a large first stop

- **WHEN** a stop at 815 000 found a wrap-up in its tail, a compaction
  boundary follows, the first stop after it measures 500 000, and a later one
  810 000
- **THEN** the last one is refused for size

#### Scenario: The turn gate refuses the first stop after a compaction

- **WHEN** a refusal for size was made, the turn gate refuses a later stop
  that measures 150 000, and the first stop of a still later turn measures
  805 000
- **THEN** that stop is refused for size

#### Scenario: A resumed session above the threshold

- **WHEN** a session refused for size is resumed under the same session id
  and its first stop measures 820 000
- **THEN** the turn ends

#### Scenario: Two sessions

- **WHEN** session A was refused for size and session B, in the same
  repository, first measures 810 000
- **THEN** session B is refused for size

#### Scenario: An unsafe session id

- **WHEN** the event's session id is missing or is not safe as a file name
- **THEN** nothing is asked, so a refusal can never repeat for want of a
  record

### Requirement: The turn gate's own decisions come first

The round ceiling and the turn gate's refusal SHALL be decided before a
refusal for size is weighed. A stop the ceiling ends, a stop the turn gate
refuses, a stop under a mark the turn gate refused, since that refusal
promises the next stop ends the turn, and a stop with no mark at all, which
the turn gate lets end, SHALL NOT be refused for size. A stop under a mark
naming no commit, written outside a repository, or on a `HEAD` naming no
branch MAY be: the turn gate lets it end for want of a commit to judge, not
of its partner hook. A refusal for size SHALL leave
the mark where a refused turn leaves it, and SHALL NOT flag it as the turn
gate's refusal: the gate still judges the continued turn.

#### Scenario: The turn gate refuses at the same stop

- **WHEN** a stop completes a task group with no passing run of its tip, and
  the context size reads 850 000
- **THEN** the stop is refused with the turn gate's reason alone, the next
  stop of that turn ends, and the first stop of the next turn is refused for
  size

#### Scenario: The continued turn completes a group

- **WHEN** a stop is refused for size, and the continued turn commits and
  completes a task group with no passing run of its tip
- **THEN** the turn gate refuses its next stop

#### Scenario: No mark

- **WHEN** no prompt wrote the session's turn-gate mark, and a stop measures
  850 000
- **THEN** the turn ends

#### Scenario: Outside a repository

- **WHEN** a prompt outside a git repository wrote an empty mark, and a stop
  measures 850 000
- **THEN** the stop is refused for size

#### Scenario: On a detached HEAD

- **WHEN** a prompt marked a commit, `HEAD` is then detached, and a stop
  measures 850 000
- **THEN** the stop is refused for size

#### Scenario: The ceiling at the same stop

- **WHEN** the twentieth continued stop since the prompt measures 850 000
- **THEN** the session ends at the ceiling and no wrap-up is asked

#### Scenario: A message queued into the continued turn

- **WHEN** a stop is refused for size and a prompt arrives before the
  continued turn ends
- **THEN** the turn gate's mark is not moved by that prompt

### Requirement: Each refusal for size is recorded

Run as the hook, each refusal for size SHALL append one gate-ledger record:
gate `context-window`, decision `refused`, rule `wrapup`, beside whatever the
turn gate records for that stop. A stop that asks nothing SHALL record
nothing for size.

#### Scenario: A refusal over a passing run

- **WHEN** a turn that completed a group with a passing run of its tip
  measures 810 000 at its stop, and its next stop ends it
- **THEN** the ledger gains one `context-window refused wrapup` record and a
  `turn-gate passed` record for each of the two stops

#### Scenario: A stop below the threshold

- **WHEN** a stop measures 400 000
- **THEN** the ledger gains no `context-window` record

### Requirement: Only the session's own stop is asked

The harness SHALL register the check on `Stop` alone, never on `SubagentStop`:
a subagent's window and transcript are its own, and its result returns to the
session that runs the wrap-up.

#### Scenario: A subagent's stop

- **WHEN** a subagent ends with its own context past the threshold
- **THEN** no harness hook asks it for a wrap-up, and the settings register
  no `SubagentStop` hook
