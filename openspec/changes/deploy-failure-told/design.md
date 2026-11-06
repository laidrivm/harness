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
  lose, and the retry is what recovers a transient push failure. Decision 5
  stops the retry from moving the previous image.
- The symlink hole in `put()`: deferred by the user's decision of 06.11, its
  `shortcut:` comment stays.
- Telling the session at the moment of the failure, without a prompt or a
  start. Nothing the session runs between turns could print it, and a
  session with no prompt has nobody to tell.

## Decisions

### 1. The prompt hook reports the failure file too

`UserPromptSubmit` gains the report the start hook runs: when the file
exists, move it to `.harness-deploy-failed.reported` and print the ask line
and the file (decision 2 says why in that order). Claude Code adds a `UserPromptSubmit`
hook's plain-text standard output to the context, as it does
`SessionStart`'s (hooks reference, *Exit code 0*, read 06.11), so the
session reads it with the prompt that follows the failure.

The file the next tick removes is then harmless: that tick either succeeds,
which supersedes the failure, or writes the file again after the restart,
where the next prompt finds it. A prompt arriving after the restarted
session's start and before the new write makes the session busy, so the
following tick stops at `fresh()` and leaves the new file for the prompt
after. A prompt arriving between the removal and the restart is the one the
requirement *The deploy restarts the session only while it is fresh* already
lets the restart cut short; the restarted start marks the session fresh
again, and the report waits for the first prompt after the new write.

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
today exits with `mv`'s status: a move that fails — a directory agent
cannot write at `.harness-deploy-failed.reported`, since `mv` moves the file
into a writable one and exits 0 — drops the report it has just printed, and
does so on every later start. With exit 0 the report reaches the session,
the file stays where it was, and the next start or prompt reports it again,
which is the louder failure.

The script moves the file before it reads it, and reads whichever path the
file is then at (local `/code-review`, group 1). The deploy replaces the file
by `rm` and a new write, so a read before the move could print one failure
and move aside a newer one that arrived in between, unread. A directory at
`.reported`, writable or not, counts as a failed move, since `mv` would
nest the file inside a writable one where nothing looks. A file it cannot
read is still reported, by its path; one gone after a failed move, removed
by a deploy that superseded it, is not.

The inline command had no file whose mode could break it; the script does.
The Dockerfile's mode check covers it: a builder that took
`--chmod=0755` and set another mode fails the build, as it does for the
managed settings, rather than every start and prompt failing its hook. The
check scans all of `/opt/orchestrator`, and every file directly in it must
run for others but `clone-name.sh`, which is sourced (local `/code-review`,
group 1: a scan scoped by what it exempts, `core/rules.md`), so the other
scripts copied there are covered too.

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

### 4. The newest run decides, in one module both callers run

`bun/bump.ts`'s `greenHead()` reads the same URL and has the same
`some(success && github-actions)`, so the rule is lifted into one module,
`bun/green-run.ts`: an exported `green(runs)` that takes the newest
`github-actions` run by `id` and returns whether it concluded `success`;
an exported `collect(pages)` that takes the API's page bodies read so far
and returns their runs, or `more` while they hold fewer runs than the first
page's `total_count`; and, run as a script, both over a JSON array of those
bodies on standard input, exiting 0 for green, 1 for not, 2 for input it
cannot read and 3 for another page wanted. `greenHead()` imports both.
`deploy.sh`'s `green()` pipes the pages to it under the runner
image's bun, as it runs `jq` today, but runs the checkout's own file,
bind-mounted read-only:
`docker run --rm -i --mount "type=bind,source=${PWD%/*}/bun/green-run.ts,target=/green-run.ts,readonly" --entrypoint bun "$image" /green-run.ts`.
Every runner image carries bun (`FROM oven/bun`), and the host needs none.
A second copy, `jq` beside TypeScript, would be the two hand-kept copies
`core/rules.md` forbids. The module imports nothing, so it runs with no
`node_modules`.

The file comes from the checkout, never the image's `/opt/orchestrator/bun/`
(CodeRabbit on #464, 06.11). The name's image can predate the module: a
build that fails after the fast-forward leaves the name on the older image,
and a rollback tags the previous image back. Either way the image's copy is
missing, and a read through it would fail every tick. It would then block
the build that repairs the image, or the next head after a rollback. The
checkout's file is the version `deploy.sh` itself was read from, so script
and rule move together on each fast-forward, as the `jq` filter does today.
A missing file fails `--mount`, and that failure reads as a check that
cannot be read: the run exits 1 and the journal shows it. The `json()`
helper stays for `push()`'s read of the compose config.

Check run ids grow with creation (121313516713 then 121785033664 above), so
the largest id is the newest run, a re-run of an older suite included. An
empty list is not green, the *absent* case. The URL keeps `filter=latest`,
which already drops the older attempts inside a suite.

Every page is read (CodeRabbit on #464, round 2), since the newest run can
sit on any page: the API lists 30 runs a page unless asked, and the order
it lists them in is not documented. Both callers ask for `per_page=100` and
read page after page while `collect()` answers `more`, `deploy.sh` piping
every body read so far to each run of the script. `total_count` counts the
filtered runs, not the page's (observed 06.11: `a03ec51` with `per_page=1`
answers `total_count` 2 and one run), so the pages read hold every run once
they hold that many. A body with no `total_count`, or a page with no runs
while the count is short, cannot be read: each page read adds a run or ends
the read, so it ends.

A newest run that is `cancelled` keeps the head undeployed, as a failed one
does. `test.yml` cancels in progress per ref, so a run of `main` is
cancelled by a newer run of `main`, which is then the newest; a run
cancelled by hand stays undeployed until it is re-run or `main` moves,
which is what cancelling a check asks for.

The newest run decides whatever event made it. A `pull_request` run tests
the pull request's merge ref, not the commit, so a commit pushed to `main`
as a pull request's own head, with its `push` run failed and its pull
request run re-run green, would read as green. No such commit is among the
1426 runs read: a merge here makes a new commit. The read cannot tell the
suites' events apart without a second call per suite, so the case is left
as a known limit; the code before this change had it too.

Alternative: `max_by(.started_at)` — a queued run has no `started_at`, and
two jobs can start in the same second.

### 5. A retry keeps the previous image (the user's answer 1 а, 06.11)

Local `/code-review` found that the retry after a late failure moves
`previous`. Once `up` has run, the runner container runs the image built
from the head. When a later step fails, the head is not recorded, and the
next tick tags that container's image as `orchestrator-runner:previous`
(`deploy.sh:218-220`) before it rebuilds. The image that was previous before
the deploy is left dangling, and `prune` deletes it. If that tick's wait for
`main` then fails, the rollback brings the runner up on the head's own image,
so the light rollback has nothing to roll back to. The retry the non-goals
keep relies on that path, so the user chose to fix it here, not on a separate
card.

A third record, `brought-up` in the state directory, holds the head whose
images the run is about to bring up. `locked()` writes it right before
`up`, after the second check read and the look for the mark. A write that
fails is a failed step, `the brought-up record`, so nothing is brought up
with no record. Writing it before `up` rather than after covers an `up` that
fails part way and leaves the new runner running. Before its tag, the run
compares the record with the head. While they match, the image tagged as
previous is left as it is, and the build, `up` and the wait go on. A
different head, or no record, tags as today. The record is never removed. A
recorded or rolled-back head is not attempted again, and every newer head
differs from it.

Alternative: tag `previous` only when the name has no `previous` yet. That
also blocks the tag on a fresh deploy after a recorded one, so the second
deploy's rollback would bring back the first deploy's previous image.

## Risks / Trade-offs

- [A prompt cut short by a restart still gets no report from it] → the
  restarted session's start hook reports any file present; the late-failure
  file appears after that start and is reported at the next prompt.
- [`UserPromptSubmit` runs the script on every prompt] → one `[ -e ]` test
  when no file exists; the hook prints nothing then.
- [Runs created while the pages are read] → a run created between two page
  reads can land on the page already read and shift another onto the next,
  so the pages hold that one twice and miss the new run, as a single read
  misses a run created just after it. The deploy's second read before `up`
  and the next tick see it; the bump reads it on its next day.
- [The image must be rebuilt to carry the hook] → the deploy that ships this
  change rebuilds it; until then the old hook stays, which is the behaviour
  today.
- [The deploy that ships this change decides by the old rule] → that run is
  the `deploy.sh` read before its fast-forward, so both of its check reads
  use `any(success)`. If the head that carries this change has an older
  suite passed and a newer one failed, that run deploys it anyway (CodeRabbit
  on #464, 06.11). The window is one head, and every deploy so far has had
  the same exposure. Before merging the implementation, check that the
  merge commit's `test` runs come from one suite: `gh api
  repos/laidrivm/harness/commits/<sha>/check-runs?check_name=test&filter=latest`
  lists one run. The implementation's pull request body names this step.
