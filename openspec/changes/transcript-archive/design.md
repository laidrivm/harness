# transcript-archive — design

## Context

Claude Code writes one `<id>.jsonl` per session under
`~/.claude/projects/<project>/` (or `$CLAUDE_CONFIG_DIR/projects/`). Beside it
sits an `<id>/` directory holding `subagents/` and `tool-results/`. Each line
of the transcript carries `cwd`, `gitBranch` and `sessionId`.

The explore of 2026-10-18 read the hooks reference for `SessionEnd`. Its event
carries `session_id`, `transcript_path`, `cwd` and `reason`, one of
`clear|resume|logout|prompt_input_exit|other`. The hook cannot stop the
session. The event's hooks share a 1.5 s budget, which a per-hook `timeout`
raises to as much as 60 s. The transcript is written asynchronously, so it can
lag the event. `claude -p` without `--bare` runs `SessionEnd` on SIGTERM but
not on SIGKILL. The board loop sends SIGKILL 5 s after its SIGTERM
(`bun/board-loop-session.ts`), and Ctrl-C at the runner sends SIGKILL at once.

The closest existing artefact is the gate ledger (`bun/gate-ledger.ts`,
`openspec/specs/gate-ledger/`). It is a per-user state file outside every tree,
and this archive takes the same state directory and the same rule for
resolving it.

`HOOKS` in `bun/bootstrap.ts` is the one list that `sync-settings.ts` writes
and `settings.ts` checks. Its entries carry `event`, `matcher`, `command`,
`name` and `sole`, with no `timeout`.

## Goals / Non-Goals

**Goals:** a copy of every session that ends on this machine, each findable by
project, branch and date, kept 180 days and readable only by its owner.

**Non-Goals:** see the proposal. Wiring the board loop to run the catch-up
after a pass is also left out: the next `session-wrapup` on the machine picks
up whatever a pass killed.

## Decisions

### The user's decisions (2026-10-18)

- **No scrubbing on export.** The archive is 0600, under a 0700 directory, and
  never leaves the machine. A scrubber would need a secret grammar the harness
  does not have, and every miss would read as a promise kept.
- **Retention is the archive's own, 180 days**, not Claude Code's
  `cleanupPeriodDays`. Restoring that setting is the user's act that
  `proposal.md` names under Readiness.

### Where the copy goes

`<state>/harness/transcripts/<project>/`, where `<state>` is what
`ledgerFile()` resolves: `$XDG_STATE_HOME` when it is absolute, else
`~/.local/state`. `apply` lifts that resolution into one exported function the
ledger and the archive both call, rather than writing it a second time.
`<project>` is the basename of the transcript's directory, Claude Code's own
encoding of the project path. The alternative was the realpath the ledger
records. It was rejected because the catch-up walks Claude Code's directories,
and reusing their names maps a source to its copy with no table.

### One record per session, in its own file

`<id>.meta.json` beside `<id>.jsonl`, overwritten on each export. A shared
`sessions.jsonl` was rejected: an append per export gives a resumed session
several lines, which every reader would have to fold, and a prune would have
to rewrite the file. A file per session is replaced and deleted with its copy.

### Copy to a temporary name, then rename

Each file is written to `<name>.tmp` beside its target, given its mode and its
source's modification time, then renamed over the target. A rename inside one
directory is atomic, so a kill mid-copy leaves the previous copy whole. The
record is written the same way, and a record that does not parse counts as
none, so the catch-up writes it again (CodeRabbit review). The
`<id>/` tree is copied file by file in this way, and a file that has left the
source is removed from the copy.

### One export of a session at a time

A catch-up can walk into a session whose `SessionEnd` hook is exporting it at
that moment. Both would write the same `.tmp` names, and both could find no
record and then overwrite each other's. So each export of a session first
creates `<id>.lock` beside its copy with an exclusive create, and removes it
when done. The hook, which alone knows `HEAD` and the real end reason, waits
for a held lock for up to 10 s of its 60 s timeout. The catch-up skips a
locked session and counts it as skipped; the next catch-up takes it. A lock
older than 120 s is a killed export's and is taken over. Inside the lock the
read of the record and its rewrite cannot interleave with another export.

### The modification time is the retention clock

A copy keeps its source's `mtime`, which is the session's last activity. That
gives one clock to three decisions: whether a source has changed since it was
copied (with the size), whether a copy is past 180 days, and whether a live
source is too old to archive. The last stops a ping-pong while
`cleanupPeriodDays` is 365: without it, the catch-up would re-archive what the
prune had just deleted. The export date is in the record, not the clock.

### The catch-up walks every project

Board-loop and fork sessions run in clones under scratchpad paths, each a
project of its own under `projects/`. A catch-up limited to the current
project would miss exactly the sessions that SIGKILL ends. Walking the
directory costs one `stat` per transcript. A session still running is copied
as it stands, and its own hook replaces the copy when it ends.

The catch-up writes a whole record only where none exists. The hook's record
holds `HEAD` and the real end reason, which a transcript cannot supply, so a
catch-up that replaces a copy keeps them. Every replacement refreshes
`archived`, since it is the date of the export the copy now reflects. A
record the catch-up wrote (`reason` `catch-up`) also gets `cwd` and `branch`
again, from the transcript's last line that carries them, since the session
may have switched branch after the earlier copy.

The catch-up compares `<id>.jsonl` and every file under `<id>/` by size and
modification time, not the transcript alone: a `subagents/` or
`tool-results/` file can change while the main transcript does not (local
CodeRabbit review). A session with no record is exported even when its files
match, since a kill can fall between a rename and the record.

A `.tmp` file that a kill left behind is overwritten by the next export of
that file. The prune judges it by its own modification time, so one whose
session never got a copy still goes. So does the `<id>/` a first export
killed between the two leaves, once its lock is gone too (CodeRabbit review).

### Every export prunes the whole archive

The hook and the catch-up both prune every project directory in the archive,
not only the one they export into. A project that receives no later session
— a clone removed from the VPS, a one-use scratchpad project — would
otherwise keep its copies past 180 days, and a machine that never runs
`session-wrapup`, such as the VPS, has no other pruner. One `readdir` per
project and a `stat` per session cost the hook a few milliseconds. The prune
deletes only inside the archive, so the hook still writes nothing outside it.

### A 60 s timeout, synchronous

The hook copies a transcript of tens of megabytes in well under a second, but
the 1.5 s shared budget is not enough for the largest, and the hook shares it
with any `SessionEnd` hook a project adds. The timeout is the most Claude Code
allows. A hook that finishes early holds the exit no longer than it runs. An
`async` registration would be killed when the process exits. The check
already refuses one, since it counts only a hook that can block.

`HOOKS` entries gain an optional `timeout`. The sync writes it into the
registration, and the check compares it whenever the entry has one. The
`core/rules.md` Code rule on pinning a hook's registration asks for that
comparison, since the timeout decides whether the hook finishes.

### The wrap-up runs it in step 3

Workflow state is the step that reconciles the session's state with the
world, and its board reconciliation already runs a harness script. The catch-up
line goes in the report, not the yield ledger, which counts review findings.
The skill gains `allowed-tools` entries for both spellings of the command, and
its Rules line on what it may write names the archive.

## Risks / Trade-offs

- [The 60 s ceiling is read from the docs, not measured] → task 1.8 ends a
  session whose transcript takes more than 1.5 s to copy and checks the copy
  is whole.
- [A SIGTERM followed by SIGKILL 5 s later can cut an export short] → the
  rename keeps the previous copy whole, and the catch-up re-copies the session.
- [Disk use: 483 MB in a week of `projects/`, kept 180 days, uncompressed] →
  compression is left to the search change, which decides the stored form.
- [A transcript format change moves `cwd` or `gitBranch`] → the catch-up then
  writes `null`, never a guess, and the hook's record does not depend on it.
- [The archive holds secrets from command output, uncleaned] → 0600 and 0700,
  outside every tree, by the user's decision.

## Migration Plan

The harness's own registration runs from the pin, so it does nothing until the
pin moves past this change's merge. A consumer gets it at its next bump, which
runs the sync. The first `session-wrapup` after that archives every transcript
Claude Code still keeps that is younger than 180 days. Rolling back is removing
the entry from `HOOKS` and syncing: the archive stays where it is, and nothing
reads it yet.
