# transcript-archive

## Why

Session transcripts are the raw material for several cards on the board:
finding repeated procedures worth a skill, evals on lost incidents, a token
review, and whether an incident still earns its rule. Claude Code deletes them
after `cleanupPeriodDays`, which is 30 days by default, and nothing keeps a
copy. `~/.claude/projects/` grew from 93 MB across 5 projects on 2026-10-11 to
483 MB across 14 on 2026-10-18. Nothing links a transcript to the branch it
worked on.

## What Changes

- A `SessionEnd` hook, `bun/transcript-archive.ts`, copies the ended session's
  `<id>.jsonl` and its sibling `<id>/` directory (`subagents/`,
  `tool-results/`) into the user's state directory, beside the gate ledger and
  outside every working tree. It writes one metadata record per session: id,
  `cwd`, branch, `HEAD`, end reason and date. Archiving the same session again,
  as after a resume, replaces its copy. The hook never stops a session.
- `bun/bootstrap.ts`'s `HOOKS` gains the entry with an explicit `timeout`, so
  the sync writes it and the policy check pins it. The registration shape gains
  a `timeout` field for this.
- `--catch-up` archives the sessions no hook archived: one SIGKILLed, as the
  board loop does 5 s after a SIGTERM, one that crashed, or one whose
  transcript was still being written when its hook ran. `session-wrapup` runs
  it in its Workflow state step.
- The archive keeps a session 180 days. Both modes prune older ones.
- On the VPS that the sibling proposal `vps-board-loop` sets up, the same hook
  runs for every `claude -p` session, since `-p` without `--bare` runs the
  project's hooks. That machine keeps an archive of its own.

## Non-goals

- **Search.** A SQLite FTS index over the archive is the follow-up change this
  one feeds, as is compressing the copies.
- **One archive shared across machines**, and cloud sessions and routines,
  which leave no local files.
- **Scrubbing secrets** on export. The user decided against it (2026-10-18):
  the archive is readable only by its owner and never leaves the machine.
- **The orchestrator's session registry** (task → branches → sessions). The
  metadata record is what such a registry would read.

## Capabilities

### New Capabilities

- `transcript-archive`: where a session's transcript is copied when the
  session ends, what the copy records about it, how a missed session is caught
  up, and how long a copy is kept.

### Modified Capabilities

None. The registration is one more of the hooks that `harness-updates`'
*Sync writes every value the policy check dictates* already covers. The new
capability fixes its timeout.

## Impact

- `bun/transcript-archive.ts` and its tests, new.
- `bun/bootstrap.ts`, `bun/sync-settings.ts` and `bun/settings.ts`: the
  `timeout` field, written and compared.
- `.claude/settings.json`: the registration, written by the sync. In the
  harness it runs from the pin, so it does nothing until the pin moves past
  the merge.
- `core/skills/session-wrapup/SKILL.md`: the catch-up in step 3, its
  `allowed-tools` entries, and its Rules line on what the skill may write.
- `README.md`: one bullet naming the hook and the archive's place.
- Consumers get the hook at their next bump, through the sync.

## Readiness

- **User act:** once the export has run for a week, remove
  `"cleanupPeriodDays": 365` from `~/.claude/settings.json`. It was set by hand
  on 2026-10-11 as a stopgap, outside every tree, and covers every project on
  the machine. The alternative is to keep a period the export is sure to beat.
  The VPS and the workstation never had it set.
