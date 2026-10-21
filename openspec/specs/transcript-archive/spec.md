# transcript-archive Specification

## Purpose

Keeps a private copy of every Claude Code session transcript on the machine
that ran it, outside Claude Code's own cleanup, with enough metadata to find
the session by project, branch and date.

## Requirements

### Requirement: An ended session's transcript is archived

When a session ends, the harness SHALL copy its `<id>.jsonl`, and the sibling
`<id>/` directory when one exists, into `harness/transcripts/<project>/` under
the state directory that `gate-ledger`'s *The ledger lives outside every
working tree* fixes. `<project>` SHALL be the name of the directory that holds
the transcript, as Claude Code names it under its `projects/` directory.

#### Scenario: A session with subagents

- **WHEN** a session whose `<id>/` holds `subagents/` and `tool-results/`
  ends
- **THEN** the archive holds `<id>.jsonl` and `<id>/` with every file in it,
  each byte for byte the source

#### Scenario: A session with no sibling directory

- **WHEN** a session with no `<id>/` ends
- **THEN** the archive holds its `<id>.jsonl` and no `<id>/`

#### Scenario: Nothing lands in the tree

- **WHEN** a session in a consumer ends
- **THEN** `git status` in the consumer shows nothing new

### Requirement: The archive is readable only by its owner

Every file the archive writes SHALL have mode 0600 and every directory under
`harness/transcripts/`, that one included, mode 0700, whatever the umask and
the source's modes.

#### Scenario: A permissive umask

- **WHEN** a session ends under umask `022` and its transcript is mode 0644
- **THEN** each archived file is 0600 and each archived directory is 0700

### Requirement: Each archived session carries one metadata record

Beside the copy the harness SHALL write `<id>.meta.json`, one JSON object
holding `session_id`, `cwd`, `branch`, `head`, `reason` and `archived`, the
ISO date of the export. A value that cannot be read SHALL be `null`.

#### Scenario: A session on a branch

- **WHEN** a session whose `cwd` is a checkout on `spec/demo` ends with reason
  `prompt_input_exit`
- **THEN** the record names that `cwd`, `spec/demo`, the checkout's `HEAD`
  sha, `prompt_input_exit` and today's date

#### Scenario: A session outside any repository

- **WHEN** a session whose `cwd` is no git work tree ends
- **THEN** `branch` and `head` are `null` and the rest is written

### Requirement: Archiving a session again replaces its copy

A session archived again, as after a resume, SHALL leave one copy holding the
latest transcript and one record. An export cut short SHALL leave the previous
copy of each file, the record included, whole rather than a truncated one.

#### Scenario: A resumed session ends again

- **WHEN** a session is archived, resumed, extended and ended again
- **THEN** the archive holds one `<id>.jsonl`, equal to the longer transcript,
  and one record naming the second end's reason

#### Scenario: Two exports of one session at once

- **WHEN** a catch-up reaches a session while that session's hook is
  exporting it
- **THEN** one export runs at a time, the copy of each file is whole, and the
  record holds the hook's `head` and `reason`

#### Scenario: An export killed mid-copy

- **WHEN** the export is killed while it copies a file that a previous export
  archived
- **THEN** the archive's copy of that file is the previous one, whole

### Requirement: Archiving never stops a session

The hook SHALL exit 0 on every fault and write nothing outside the archive. An event whose `session_id` is not a plain name, or whose
`transcript_path` is not `<session_id>.jsonl`, SHALL archive nothing.

#### Scenario: A malformed event

- **WHEN** the hook reads input that is not JSON, or JSON with no
  `transcript_path`
- **THEN** it exits 0 and writes nothing

#### Scenario: A session id that climbs out

- **WHEN** the event's `session_id` is `../x`
- **THEN** the hook exits 0 and nothing is written outside the archive

#### Scenario: A transcript already gone

- **WHEN** the event names a transcript that does not exist
- **THEN** the hook exits 0 and writes nothing

### Requirement: The archive hook is registered with a timeout of 60 seconds

The harness SHALL register the hook under `SessionEnd`, as a synchronous
command, with `timeout` 60. The sync SHALL write that timeout, and the policy
check SHALL fail, naming the hook, when the registration is missing, differs
or carries another timeout.

#### Scenario: A registration with no timeout

- **WHEN** a consumer's `SessionEnd` registration carries the hook's command
  and no `timeout`
- **THEN** the policy check fails naming the archive hook, and after a sync it
  passes

### Requirement: A catch-up archives the sessions no hook archived

`--catch-up` SHALL walk every project directory under Claude Code's
`projects/` and archive each session that has no record, or whose
`<id>.jsonl` or a file under `<id>/` has no copy, has left the source, or
differs from its copy in size or modification time. It SHALL write a whole
record only where none exists, with `reason` `catch-up` and `head` `null`; a
record that cannot be read or parsed counts as none. Replacing a copy, it SHALL refresh `archived`, refresh `cwd` and `branch` only
in a record whose `reason` is `catch-up`, and keep the `head` and `reason` of
any other. It SHALL skip, and count as skipped, a session another export
holds, and print one line counting what it archived, skipped, pruned and
failed.

#### Scenario: A catch-up record after a branch switch

- **WHEN** a catch-up copied a running session, the session switched branch,
  and a later catch-up copies it again
- **THEN** the record names the new branch and the later export's date

#### Scenario: A session the board loop killed

- **WHEN** a session was SIGKILLed, so its hook never ran
- **THEN** the catch-up archives it, with a record whose `cwd` and `branch`
  are the transcript's last `cwd` and `gitBranch`

#### Scenario: A transcript that lagged its hook

- **WHEN** a session's transcript gained lines after its hook archived it
- **THEN** the catch-up replaces the copy and keeps the hook's record

#### Scenario: An unchanged session

- **WHEN** a session's copy matches its source and its record exists
- **THEN** the catch-up rewrites neither the copy nor the record, and counts
  it as skipped

#### Scenario: A copy whose record was never written

- **WHEN** an export was killed after its transcript's rename and before its
  record
- **THEN** the catch-up writes the record

#### Scenario: A record that does not parse

- **WHEN** a session's copy matches its source and its `<id>.meta.json` is
  not a JSON object
- **THEN** the catch-up writes a whole record with `reason` `catch-up`

#### Scenario: A change under the sibling directory only

- **WHEN** a file was added under `<id>/` and another removed after the
  export, and `<id>.jsonl` is unchanged
- **THEN** the catch-up copies the added file and removes the other from the
  copy

#### Scenario: One unreadable session

- **WHEN** one session's transcript cannot be read
- **THEN** the catch-up archives the others, counts one failure, and exits 0

### Requirement: The archive keeps a session 180 days

A copy SHALL keep its source's modification time. The hook and the catch-up,
each over every project directory in the archive, SHALL delete each session
whose archived transcript was last modified more than 180 days ago, with its
`<id>/` and record, and each `.tmp` file last modified that long ago. The
catch-up SHALL NOT archive a source older than that.

#### Scenario: A session past the period

- **WHEN** an archived transcript was last modified 181 days ago
- **THEN** the next export deletes it, its directory and its record

#### Scenario: A temporary file with no copy beside it

- **WHEN** a first export was killed mid-copy, its source is gone, and the
  `.tmp` file it left was last modified 181 days ago
- **THEN** the next export deletes the `.tmp` file

#### Scenario: A live transcript past the period

- **WHEN** Claude Code still keeps a transcript last modified 181 days ago
- **THEN** the catch-up neither archives it nor counts it as failed

### Requirement: The wrap-up runs the catch-up

`session-wrapup` SHALL run the catch-up in its Workflow state step and report
the line it prints.

#### Scenario: A wrap-up after a killed session

- **WHEN** a session runs `session-wrapup` after another session on the
  machine was SIGKILLed
- **THEN** the killed session is in the archive and the wrap-up names the
  catch-up's line
