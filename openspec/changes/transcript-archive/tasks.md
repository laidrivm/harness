# transcript-archive — tasks

Two task groups, so the change ships as `feat/transcript-archive-1` and
`feat/transcript-archive-2`, in that order. Group 1 archives every session
that ends normally. Group 2 catches up the ones that do not. Numbers in
brackets refer to the proposal-stage `/zombies` list in the pull request.
Every test cites the scenarios it closes in a `// spec:` comment.

## 1. An ended session is archived, and the archive keeps 180 days

Closes every scenario of `transcript-archive` §*An ended session's transcript
is archived*, §*The archive is readable only by its owner*, §*Each archived
session carries one metadata record*, §*Archiving a session again replaces its
copy*, §*Archiving never stops a session*, §*The archive hook is registered
with a timeout of 60 seconds*, and *A session past the period* and *A
temporary file with no copy beside it* of §*The archive keeps a session 180
days*.

- [ ] 1.1 Write the failing cases first in a new
      `bun/transcript-archive.test.ts`. Drive the hook as a subprocess fed an
      event on stdin, with `XDG_STATE_HOME` and `CLAUDE_CONFIG_DIR` in a
      temporary directory, and record that each fails. Cover the copy with
      and without `<id>/`, an empty transcript, two sessions, a re-export, a
      file removed from `<id>/`, the modes under umask `022`, a 0755
      `transcripts/`, a relative `XDG_STATE_HOME`, the kept `mtime`, the
      record in a checkout and outside one, and a clean `git status` [1, 2,
      4–8, 12–17, 30]
- [ ] 1.2 In the same file, write the fault cases, each exiting 0: input that
      is not JSON, a `session_id` of `../x`, a `transcript_path` that does not
      end in `<session_id>.jsonl`, a missing transcript, an unwritable state
      directory, and an export killed mid-copy that leaves the previous copy
      whole [19–24]. A held lock makes the hook wait and then export; a lock
      older than 120 s is taken over [38]
- [ ] 1.3 Write the prune cases: 181 days pruned with `<id>/` and record,
      179 days kept, and a 181-day-old `.tmp` file with no copy beside it
      deleted, over every project directory in the archive, including one
      that holds no session of the exporting run [9, 10, 37]
- [ ] 1.4 Lift the state-directory resolution out of `ledgerFile()` in
      `bun/gate-ledger.ts` into one exported function that the ledger and the
      archive both call. Verify with `bun test bun/gate-ledger.test.ts`
- [ ] 1.5 Add `bun/transcript-archive.ts` as the design sets out: event
      validation, the per-session `<id>.lock` (exclusive create, a 10 s wait,
      taken over past 120 s), temp-and-rename copy with mode and `mtime`, the
      record, and the prune of the whole archive. Verify with 1.1–1.3
- [ ] 1.6 Add the `SessionEnd` entry to `HOOKS` in `bun/bootstrap.ts` with
      `timeout: 60`. Give the `HOOKS` shape an optional `timeout`, write it in
      `bun/sync-settings.ts`, and compare it in `bun/settings.ts` whenever the
      entry has one. Write the failing cases first in `bun/settings.test.ts`
      and `bun/sync-settings.test.ts`: no `timeout`, `timeout` 30, `async`,
      and a sync that writes 60 and then passes [31–34]. The existing case
      *an event left with no hooks once a previous version's are gone is
      dropped* in `bun/sync-settings.test.ts` uses `SessionEnd` as an event
      the harness does not register: move it to one the harness still does
      not, and keep it passing. `bun/settings.fixture.ts` writes each
      registration by hand, so it gains the `SessionEnd` entry with its
      timeout
- [ ] 1.7 Add the registration to the harness's tracked
      `.claude/settings.json` in the consumer text `HOOKS` gives it, as
      0bb2942 did for the loop guard — not through `bun/sync.ts`, which would
      also write a `harness/` copy of the rules into this tree. `bun/self-pin.test.ts`
      compares each registered hook object whole as `{ type, command }`, so
      add the entry's `timeout` to the expected object, then confirm it
      passes [35]
- [ ] 1.8 Measure the timeout in an attended session: end a session whose
      transcript takes more than 1.5 s to copy (a large one, or a copy slowed
      by a `sleep` in a scratch copy of the hook) and confirm the archive is
      whole. Record the Claude Code version in the pull request (unattended:
      card — hand the measurement on)
- [ ] 1.9 Add one bullet to `README.md`'s ownership list naming the hook, the
      archive's place, its modes and its 180-day period, and grep `README.md`
      and `core/` for a statement the hook makes false

## 2. A catch-up archives the sessions no hook archived

Closes every scenario of `transcript-archive` §*A catch-up archives the
sessions no hook archived* and §*The wrap-up runs the catch-up*, and *A live
transcript past the period* of §*The archive keeps a session 180 days*.

- [ ] 2.1 Write the failing cases first in `bun/transcript-archive.test.ts`:
      no `projects/` directory, a killed session archived with `catch-up`
      and `null` `head`, a lagging transcript re-copied with the hook's record
      kept, an unchanged session skipped and not rewritten, a matching copy
      with no record given one, a file added and another removed under
      `<id>/` with `<id>.jsonl` unchanged (local CodeRabbit review), one
      unreadable transcript counted as a failure, a transcript with no `cwd`
      or `gitBranch`, a live source past 180 days neither archived nor failed,
      the prune across every project, and the one count line [3, 11, 18,
      25–29]. A catch-up meeting a session its hook holds skips and counts
      it, and the hook's record survives both orders of the two exports
      [39]. A catch-up record re-copied after a branch switch names the new
      branch and the new `archived` date, while a hook record keeps its
      `head` and `reason` and gets the new date [40]
- [ ] 2.2 Add `--catch-up` to `bun/transcript-archive.ts`, walking every
      directory under `projects/` and reusing the hook's copy and prune.
      Verify with 2.1
- [ ] 2.3 In `core/skills/session-wrapup/SKILL.md`, add the catch-up to step
      3 (Workflow state), with both spellings of the command, the line it
      prints going in the report. Add both commands to `allowed-tools` and
      name the archive in the Rules line on what the skill may write. Write
      the failing test first: it reads the skill, finds both commands under
      the step 3 heading and in `allowed-tools`, and cites §*The wrap-up runs
      the catch-up*. Verify by running the step on a state directory holding
      a killed session [36]
