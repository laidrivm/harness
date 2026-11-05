# Spec Delta

## Purpose

What the harness does as a session's context window fills: when the session
is asked to run `/session-wrapup` before auto-compaction takes the window, how
often it is asked, and what the asking reads to know the window's size.

## ADDED Requirements

### Requirement: A full context asks for the wrap-up

The turn gate's `Stop` half SHALL refuse to end a turn whose context size is
at or above 800 000 tokens, by exiting 2 with a reason on stderr that tells the
session to wait for any subagent still running, finish the step in hand, run
`/session-wrapup` unless it is already running, then tell the user «можно
/clear». Below the threshold it SHALL add nothing to the stop.

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

### Requirement: An unattended session is not asked

A session whose first user message holds the line `This session runs
unattended.` (`agent-autonomy`) SHALL NOT be refused for size, whatever its
size: a launcher reads its final message, and a wrap-up there would rewrite
it. The line SHALL be read from the transcript by the same code the question
gate reads it with.

#### Scenario: A board-loop stage past the threshold

- **WHEN** a session started with that line measures 820 000 at a stop
- **THEN** the turn ends as the turn gate alone decides it

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

- **WHEN** the transcript is larger than the tail the hook reads, and the
  last reply lies within that tail
- **THEN** the size is read without reading the whole file

#### Scenario: A transcript smaller than the tail

- **WHEN** the transcript is smaller than the tail and its only assistant
  reply is its first line, reading 810 000
- **THEN** the size is 810 000

#### Scenario: No size to read

- **WHEN** the event names no transcript, the file is missing, or its tail
  holds no assistant reply with a usage
- **THEN** nothing is asked, and the turn gate's decision stands

### Requirement: The wrap-up is asked once per context

After a refusal for size, the hook SHALL NOT refuse for size again in that
session until a stop measures under half the threshold, 400 000, which only a
compaction or a cleared context reaches; that stop re-arms it. The record of
the refusal SHALL be kept per session id outside the tree, where a restart of
Claude Code that resumes the session finds it.

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

The round ceiling and the turn gate's refusal SHALL be decided before the
size is read, and a stop either ends or refuses SHALL NOT be refused for size;
nor SHALL a stop under a mark the turn gate refused. A refusal for size SHALL
flag the mark refused, as the turn gate's own refusal does, so the hook
refuses at most once per mark, and SHALL leave the mark where a refused turn
leaves it.

#### Scenario: The turn gate refuses at the same stop

- **WHEN** a stop completes a task group with no passing run of its tip, and
  the context size reads 850 000
- **THEN** the stop is refused with the turn gate's reason alone, the next
  stop of that turn ends, and the first stop of the next turn is refused for
  size

#### Scenario: The ceiling at the same stop

- **WHEN** the twentieth continued stop since the prompt measures 850 000
- **THEN** the session ends at the ceiling and no wrap-up is asked

#### Scenario: A message queued into the continued turn

- **WHEN** a stop is refused for size and a prompt arrives before the
  continued turn ends
- **THEN** the turn gate's mark is not moved by that prompt

### Requirement: Each refusal for size is recorded once

Run as the hook, each refusal for size SHALL append one gate-ledger record:
gate `context-window`, decision `refused`, rule `wrapup`, and no record of the
turn gate's for that stop; the turn gate's `passed` or `released` SHALL be
recorded for the stop that ends the turn. A stop that asks nothing SHALL
record nothing for size.

#### Scenario: A refusal over a passing run

- **WHEN** a turn that completed a group with a passing run of its tip
  measures 810 000 at its stop, and its next stop ends it
- **THEN** the ledger gains one `context-window refused wrapup` record and
  one `turn-gate passed` record

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
