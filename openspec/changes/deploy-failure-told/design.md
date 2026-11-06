# deploy-failure-told — design

## Context

`orchestrator/deploy.sh` runs as root on the host from `harness-deploy.timer`.
It tells a failure through one file, `~/.harness-deploy-failed` in agent's
home, which the image's managed `SessionStart` hook prints and moves aside on
startup, clear and resume (`orchestrator/runner/managed-settings.json`). The
managed `UserPromptSubmit` hook only removes the fresh-session mark that lets
a deploy restart the session.

The three gaps the proposal names all sit in that path:

- Steps after `main` is up — `push()`'s three `failed "the push"` calls and
  `failed "the record"` — write the file after the restarted session's start
  hook has run. Under `locked()`, the next tick removes any failure file
  before `up` (`deploy.sh:130`), because a new attempt supersedes an older
  failure and the start can run before the wait for `main` sees it. While
  the session stays fresh, every tick removes the file, restarts, and writes
  it again after the start: no hook ever prints it.
- `rollback()` writes `failed "the wait for main"` and then `rolled-back`; a
  failed write is echoed to the journal only.
- `green()` runs `any(.check_runs[]; github-actions and success)` over
  `check-runs?check_name=test&filter=latest`.

### What `filter=latest` returns, observed 06.11

- `gh api repos/laidrivm/harness/commits/a03ec51…/check-runs?check_name=test&filter=latest`
  returns two runs, 121785033664 in suite 109454934843 and 121313516713 in
  suite 109065488184, both `success` — the two `push` runs `test.yml` made of
  that commit on 25.10 and 26.10. `eab4bdb…` returns two the same way. So
  `latest` keeps one run per name *per check suite*; a commit can carry more
  than one suite of `test` whenever a second workflow run is made of it.
- `gh api repos/laidrivm/mellon/commits/99d775c…/check-runs?filter=all`
  returns 20 runs, four of each job, all in suite 64414115511 (run
  24351935433, `run_attempt` 4); `filter=latest` returns five, one per name,
  `e2e` the newest attempt's. Re-runs stay in their run's suite, so a re-run
  of the same suite is decided correctly today; only a second suite is not.
- On this repository no commit has both a `push` and a `pull_request` run of
  `test.yml` (1426 runs read): pull request runs attach to the pull
  request's head, and a merge here makes a new commit. The case that reaches
  the deploy is the second `push` run of one commit, as above.

## Goals / Non-Goals

**Goals:**

- A failure the deploy writes after the session started reaches the session
  no later than its next prompt.
- A `rolled-back` record that cannot be written is in the failure file.
- The newest `test` run decides, across suites.

**Non-Goals:**

- Stopping the restart of a still-fresh session on every tick while a step
  after `main` keeps failing. That is the retry every failed step after the
  fast-forward gets (*The build fails*); a fresh session has no turn to
  lose, and the retry is what recovers a transient push failure. What the
  retry does to the previous image is under *Open Questions*.
- The symlink hole in `put()`: deferred by the user's decision of 06.11, its
  `shortcut:` comment stays.
- Telling the session at the moment of the failure, without a prompt or a
  start. Nothing the session runs between turns could print it, and a
  session with no prompt has nobody to tell.

## Decisions

### 1. The prompt hook reports the failure file too

`UserPromptSubmit` gains the report the start hook runs: when the file
exists, print the ask line and the file, then move it to
`.harness-deploy-failed.reported`. Claude Code adds a `UserPromptSubmit`
hook's plain-text standard output to the context, as it does
`SessionStart`'s (hooks reference, *Exit code 0*, read 06.11), so the
session reads it with the prompt that follows the failure.

The file the next tick removes is then harmless: that tick either succeeds,
which supersedes the failure, or writes the file again after the restart,
where the next prompt finds it. A prompt arriving between the removal and the
new write makes the session busy, so the following tick stops at `fresh()`
and leaves the new file for the prompt after.

Alternatives:

- Keep the failure file in `locked()` when it names the same head. A
  same-head failure from before the restart — the build's, the restart's —
  is superseded by the steps this run has just passed, and would be reported
  to the restarted session as current; telling them apart means parsing the
  step out of the line. It also tells nothing to a session that is never
  restarted, the busy one.
- Restart the runner once more after a late failure, so the start hook sees
  it. A second restart on every failing tick, and still nothing for a busy
  session.
- Record a late failure so later ticks stop retrying. It removes the retry
  that recovers a transient failure, and the session is still not told.

### 2. One report script, both hooks run it

The report becomes `orchestrator/runner/deploy-failed.sh`, copied to
`/opt/orchestrator/deploy-failed.sh` at mode 0755 beside the other scripts,
and both hook entries' command is that path. Two copies of the command in
the settings would have to be kept in step by hand. The `SessionStart`
entry keeps its `startup|clear|resume` matcher; the `UserPromptSubmit`
entry carries the mark's removal and the script as two hooks. Claude Code
runs an event's matching hooks in parallel (hooks reference, read 06.11),
so the two run in no order;
neither reads what the other writes.

The script exits 0 whatever its move does. Claude Code adds a hook's
standard output to the context only on exit 0, and the inline command
today exits with `mv`'s status: a move that fails — a directory at
`.harness-deploy-failed.reported` — drops the report it has just printed,
and does so on every later start. With exit 0 the report reaches the
session, the file stays where it was, and the next start or prompt reports
it again, which is the louder failure.

`orchestrator/layout-deploy.test.ts` runs the hook commands under `sh`; it
maps the command's path to the tree's file through the Dockerfile's `COPY`
line, read from the Dockerfile, so a renamed file or destination fails the
case rather than running nothing.

### 3. The rollback names a record it could not write

`rollback()` writes `rolled-back` first, then the failure file. When the
write fails it echoes the journal line as today and appends
` and the rolled-back record` to the step of every `failed` call it makes —
`the wait for main and the rolled-back record failed at <head>`, and the same
for `the tag back` and `the rollback's up`, since each call replaces the
line before it. Both writes still come before the tag back and `up`, so the
restored session's start finds both.

The file's line format, `<UTC time> deploy: <step> failed at <head>`, is
unchanged; only the step's words grow.

### 4. The newest run decides

`green()`'s filter becomes
`[.check_runs[] | select(.app.slug == "github-actions")] | max_by(.id) | .conclusion == "success"`
under `jq -e`. Check run ids grow with creation (121313516713 then
121785033664 above), so the largest id is the newest run, a re-run of an
older suite included. An empty list gives `null`, which compares unequal and
exits 1, the *absent* case. The URL keeps `filter=latest`: it already drops
the older attempts inside a suite, and the read stays one page.

A newest run that is `cancelled` keeps the head undeployed, as a failed one
does. `test.yml` cancels in progress per ref, so a run of `main` is
cancelled by a newer run of `main`, which is then the newest; a run
cancelled by hand stays undeployed until it is re-run or `main` moves,
which is what cancelling a check asks for.

Alternative: `max_by(.started_at)` — a queued run has no `started_at`, and
two jobs can start in the same second.

### 5. A consumer's bump reads the runs the same way

`bun/bump.ts`'s `greenHead()` reads the same URL and has the same
`some(success && github-actions)`. It takes the newest `github-actions` run
by `id` and requires its `success`, as `green()` does. The two cannot share
code — one is `jq` in a script that runs on a host with no bun, the other
TypeScript — so each carries a case for the two-suite answer, and each
comment names the per-suite reading of `filter=latest`.

## Risks / Trade-offs

- [A prompt cut short by a restart still gets no report from it] → the
  restarted session's start hook reports any file present; the late-failure
  file appears after that start and is reported at the next prompt.
- [`UserPromptSubmit` runs the script on every prompt] → one `[ -e ]` test
  when no file exists; the hook prints nothing then.
- [A page of check runs past 30] → `check_name=test&filter=latest` returns
  one run per suite; reaching 30 suites of `test` on one commit is not a
  case this host meets.
- [The image must be rebuilt to carry the hook] → the deploy that ships this
  change rebuilds it; until then the old hook stays, which is the behaviour
  today.

## Open Questions

- The retry after a late failure moves `previous` (local `/code-review`,
  06.11). Once `up` has run, the runner container runs the image built from
  the head. When a later step fails, the head is not recorded, and the next
  tick tags that container's image as `orchestrator-runner:previous`
  (`deploy.sh:218-220`) before it rebuilds. The image that was previous
  before the deploy is left dangling, and `prune` deletes it. If that tick's
  wait for `main` then fails, the rollback brings the runner up on the
  head's own image, and the light rollback no longer rolls back. This is the
  behaviour today, and the retry the non-goals keep depends on it. Asked on
  the card: fix it in this change — a `brought-up` record of the head whose
  images `up` started, with no re-tag while it names the head — or file a
  separate card.
