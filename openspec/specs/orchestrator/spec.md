# orchestrator Specification

## Purpose

The host that starts unattended agent runs outside any Claude Code session:
what its timer runs, what it hands that run, and what the tracked
`orchestrator/` directory may hold, so the host can be rebuilt from this tree
and a public tree holds none of its secrets.

## Requirements

### Requirement: The timer starts at most one pass per repository

The wrapper the timer runs SHALL take a non-blocking lock keyed by the
repository the clone's `origin` URL names, owner and name, before it starts a
pass. While another pass holds that lock, it SHALL start none, SHALL say the
lock is held, SHALL exit 0, and SHALL write no stop file. Two clones of one
repository SHALL share the lock, whether their URLs use HTTPS or SSH.

#### Scenario: A tick while a pass runs

- **WHEN** the timer fires while a pass of the same clone still holds the lock
- **THEN** no second pass starts, the line printed says the lock is held, the
  wrapper exits 0, and no stop file appears

#### Scenario: Two clones of one repository

- **WHEN** a pass runs in one clone and the wrapper is started for a second
  clone whose `origin` is the same repository
- **THEN** the second start runs no pass and says the lock is held

#### Scenario: Clones of two repositories

- **WHEN** passes are started for clones of two different repositories
- **THEN** both run

### Requirement: A failed pass pauses the timer until the user removes the stop file

When the pass exits non-zero, other than as the first or second in a row of
the clone's passes to exit 75 (below), the wrapper SHALL write a stop file
naming the time, the exit status and the pass's last line, and SHALL exit with
the pass's status. While the stop file exists, the wrapper SHALL start no pass and SHALL
exit non-zero, naming the file. Nothing but the user SHALL remove it.

A pass that exits 75, the board loop's `retry`, SHALL write no stop file
while it is the first or second in a row of the clone's passes to exit 75;
the wrapper SHALL keep that count beside the stop file, and the third SHALL
write the stop file as a failed pass does, naming the count. A pass that exits
with any other status, and a tick that writes the stop file without starting
a pass, SHALL clear the count; a tick that finds the lock held or the stop
file present SHALL leave it. A fetch the wrapper itself makes
before the pass, of the push clone or of the harness pin, SHALL count as a
pass that exited 75 when it fails.
The wrapper SHALL exit 75 for each of them.

#### Scenario: The pass exits 1

- **WHEN** the board loop's pass exits 1
- **THEN** the stop file exists, holds the time, `1` and the pass's last line,
  and the wrapper exits 1

#### Scenario: The next tick after a failure

- **WHEN** the timer fires and the stop file exists
- **THEN** no pass starts, and the wrapper exits non-zero naming the stop file

#### Scenario: The user removes the stop file

- **WHEN** the user removes the stop file and the timer fires
- **THEN** a pass starts

#### Scenario: A pass that met its goal or found nothing

- **WHEN** the pass exits 0
- **THEN** no stop file is written

#### Scenario: A pass waiting on the user's answer

- **WHEN** the pass ends `waiting`, since a question on its card waits on the
  user, and exits 0
- **THEN** no stop file is written, and the next tick starts a pass

#### Scenario: A transient failure skips the tick

- **WHEN** the pass exits 75 and the clone's previous pass did not
- **THEN** no stop file is written, the wrapper exits 75, and the next tick
  starts a pass

#### Scenario: A third transient failure in a row

- **WHEN** the pass exits 75 and the clone's two previous passes did too
- **THEN** the stop file holds the time, `75`, the pass's last line and the
  count, and the wrapper exits 75

#### Scenario: A pass between transient failures

- **WHEN** a pass exits 75, the next exits 0, and the one after exits 75
- **THEN** no stop file is written

#### Scenario: The push clone cannot fetch

- **WHEN** the wrapper's fetch of the push clone's `origin` fails
- **THEN** it starts no pass, counts it as a pass that exited 75, and exits 75

#### Scenario: The runner cannot start

- **WHEN** `bun` or the runner's file is missing, so the command exits
  non-zero without a pass
- **THEN** the stop file is written, as for a failed pass

#### Scenario: The connection that started the pass drops

- **WHEN** the session that started the wrapper hangs up mid-pass
- **THEN** the pass runs to its end, and the stop file reflects its exit
  status

### Requirement: The wrapper starts the pass with the environment it names

The wrapper SHALL start the pass with an environment holding only the
variables it names: the path, the home, the locale, the Claude Code token
read from the host's secret file, the App's id and the key holder's mint
command, `HARNESS_AS_AGENT`, `GH_CONFIG_DIR` naming the pass's empty `gh`
configuration, the setting that keeps Claude Code from updating itself, and
`CLAUDECODE` when its own environment holds it. It
SHALL accept a clone only by a name that is a single path segment under the
clones directory.

#### Scenario: The host's other variables

- **WHEN** the wrapper's own environment holds a variable it does not name
- **THEN** the pass's environment does not hold it

#### Scenario: The tokens stay out of process arguments

- **WHEN** the pass is running
- **THEN** no process's arguments hold the Claude Code token or a GitHub
  token

#### Scenario: Started from a Claude Code session

- **WHEN** the wrapper is started with `CLAUDECODE` in its environment
- **THEN** the pass receives it and the runner refuses, as `board-loop`'s
  *Started from an agent's shell* fixes

#### Scenario: A clone name that leaves the clones directory

- **WHEN** the clone named is empty, holds a `/`, is `..`, or names no git
  clone
- **THEN** the wrapper starts no pass, takes no lock, writes no stop file, and
  exits non-zero

#### Scenario: A secret file missing

- **WHEN** a secret file the wrapper reads is absent, empty or holds only
  whitespace
- **THEN** the wrapper starts no pass and exits non-zero, naming the file, and
  writes the stop file

#### Scenario: The App's settings reach the pass

- **WHEN** the wrapper starts with the App's id and the mint command set, and
  a path to the App's key in its own environment
- **THEN** the pass's environment holds the App's id and the mint command, and
  no path to the App's key

### Requirement: The orchestrator directory holds no secret

Every file under `orchestrator/` SHALL hold no token, key, password, host
address or engine instance identifier. A value of that kind SHALL reach the
host from an untracked file there. The engine's workspace SHALL be tracked as
`wmill sync pull --skip-secrets` writes it, so a secret variable carries no
value, and a script SHALL refer to a secret by the variable's path alone.

#### Scenario: A variable with its value

- **WHEN** a tracked variable file under the engine's workspace carries a
  value
- **THEN** the suite fails, naming the file

#### Scenario: A literal secret in the compose file

- **WHEN** a service in the compose file sets a variable whose name says
  token, key, secret or password to a literal value rather than to a secret
  file
- **THEN** the suite fails, naming the service and the variable

#### Scenario: The secrets directory

- **WHEN** a file is written to the host's secrets directory under
  `orchestrator/`
- **THEN** git ignores it

### Requirement: Every pin in the orchestrator directory is exact and names what moves it

Each base image, image and tool version the orchestrator's files pin SHALL be
exact: an image by digest, a tool by full version. Beside each pin, a comment
SHALL name the tool that updates it, or say that nothing does. Windmill's
images SHALL be no older than 1.846.1, and its server and workers SHALL run
one version.

#### Scenario: An image named by tag alone

- **WHEN** a `FROM` line or an `image:` value carries no `@sha256:` digest
- **THEN** the suite fails, naming the line

#### Scenario: A pin without its note

- **WHEN** a pinned line has no comment beside it naming what updates it
- **THEN** the suite fails, naming the line

#### Scenario: A Windmill image older than the floor

- **WHEN** a Windmill image's tag is below 1.846.1, or the server and a
  worker carry different versions
- **THEN** the suite fails, naming the tags and the floor

### Requirement: A pass is stopped on the runner, never through the engine

A pass SHALL be stopped by a command on the runner that the user runs, which
ends the pass holding the repository's lock and writes the stop file. The
engine's key SHALL reach `pass.sh` alone, so cancelling a job SHALL NOT be
the way a pass stops.

#### Scenario: Stopping a running pass

- **WHEN** the user runs the stop command for a clone whose pass is running
- **THEN** the pass ends, the lock frees, and the stop file says the pass
  was stopped by hand, so the next tick is paused

#### Scenario: Nothing to stop

- **WHEN** the user runs the stop command and no pass holds the lock
- **THEN** it prints `idle`, exits 0 and writes no stop file

### Requirement: Only the session's start script starts Remote Control

No file under `orchestrator/` SHALL start Claude Code with Remote Control,
save `orchestrator/runner/session.sh`, the start script of the persistent
session, and `orchestrator/README.md`, which documents the session. Remote
Control on the host is that session, which the user reaches and clears from
the Claude app, and the emergency session the user starts by hand and ends.

#### Scenario: A tracked file that starts Remote Control

- **WHEN** a tracked file under `orchestrator/` other than the start script
  and the README runs `claude remote-control` or passes `--remote-control`
- **THEN** the suite fails, naming the file

### Requirement: An event is handled only once its signature verifies

The handler SHALL take the request's body as bytes and its event, delivery and
signature headers as one argument, refusing a value of the wrong shape. It
SHALL act on nothing before the body's HMAC-SHA256 under the webhook secret, a
file only the runner's user reads, matches the signature in a constant-time
comparison. It SHALL print one line naming its verdict, and exit 0 for an
event it handled or ignored and non-zero for one it refused.

#### Scenario: A valid delivery of an event no flow takes

- **WHEN** a correctly signed delivery names an event no flow handles, `ping`
  included, whether or not the App's settings are on the host
- **THEN** the handler starts nothing, prints that it ignored the event, and
  exits 0

#### Scenario: A wrong signature

- **WHEN** the signature is absent, not `sha256=` and 64 hex digits, or does
  not match the body
- **THEN** the handler parses no body, records no delivery, starts nothing,
  and exits non-zero without printing the secret or the expected signature

#### Scenario: A body changed in transit

- **WHEN** the body differs from the signed one by one byte, a trailing newline
  included
- **THEN** the signature does not verify

#### Scenario: A header value of the wrong shape

- **WHEN** the event name is not lower-case letters and underscores, the
  delivery id is not a GUID, or the argument holds other than three
  space-separated values
- **THEN** the handler reads no body and exits non-zero

#### Scenario: No secret on the host

- **WHEN** the secret file is missing, empty or holds only whitespace
- **THEN** the handler verifies nothing, starts nothing, and exits non-zero
  naming the file

### Requirement: A delivery is handled at most once

The handler SHALL record each verified delivery id before it acts, and SHALL
ignore a delivery whose id it has already recorded. An id whose handler ended,
by any exit or by being killed, before any flow posted to GitHub or started a
session SHALL count as not recorded, so that GitHub's redelivery is handled.
The ids of deliveries a flow acted on SHALL be kept.

#### Scenario: GitHub redelivers a handled delivery

- **WHEN** a delivery arrives with an id the handler already recorded
- **THEN** it starts nothing, prints that the delivery is a duplicate, and
  exits 0

#### Scenario: Two copies at once

- **WHEN** two handlers receive the same delivery id at the same moment
- **THEN** exactly one acts on it

#### Scenario: A delivery that failed before acting

- **WHEN** the handler fails before posting anything or starting a session,
  and GitHub redelivers
- **THEN** the redelivery is handled

#### Scenario: A handler killed before acting

- **WHEN** the handler is killed after recording the id and before any flow
  posted or started a session, and GitHub redelivers
- **THEN** the redelivery is handled

#### Scenario: A marker left half-written

- **WHEN** the recorded marker holds neither a pid nor the acted state, and
  GitHub redelivers
- **THEN** the redelivery is handled

#### Scenario: Two handlers recover one dead marker

- **WHEN** two handlers receive the same delivery id at the same moment, and
  its marker holds a pid that is no longer running
- **THEN** exactly one replaces the marker and acts, and the other treats the
  delivery as a duplicate

#### Scenario: A redelivery while the first copy waits

- **WHEN** the handler that recorded the id is still running, waiting on the
  repository's lock
- **THEN** the redelivery is a duplicate

### Requirement: A failed CI run starts an agent only for a pull request the loop opened

The CI flow SHALL act on a `workflow_run` event only when its action is
`completed`, its conclusion is `failure`, its head repository is the
repository itself, and that repository has a clone on the host. A run on a
`feat/` or `spec/` branch SHALL start an agent only for an open pull request
the App opened, whose head is still the run's `head_sha`, and whose branch the
PR → session table holds; the agent SHALL resume that session in the clone
the table names. A run whose latest attempt is newer than the event's and has
not succeeded SHALL start nothing, since that attempt's own event follows.

#### Scenario: A failed run on a step's pull request

- **WHEN** a run on the branch of an open pull request fails, the table holds
  that branch, and the pull request's head is the run's `head_sha`
- **THEN** the flow resumes the session the table names in its clone, with
  the failed jobs' logs of the attempt the event names in a file it names

#### Scenario: A run that did not fail

- **WHEN** the conclusion is `success`, `cancelled`, `skipped` or
  `timed_out`, or the action is not `completed`
- **THEN** the flow starts nothing and exits 0

#### Scenario: A fork, an unknown repository, another branch

- **WHEN** the head repository is a fork, no clone on the host names the
  repository, or the branch starts with neither `feat/` nor `spec/` and the run
  was not scheduled
- **THEN** the flow starts nothing and prints which filter it was

#### Scenario: A pull request with no session

- **WHEN** the table holds no record of the run's branch, or the branch has no
  open pull request
- **THEN** the flow starts nothing, posts nothing, and prints the pull
  request's number or the branch

#### Scenario: A stale run

- **WHEN** the pull request's head has moved past the run's `head_sha` by the
  time the flow reads it
- **THEN** the flow starts nothing, since the newer commit's run is its own
  event

#### Scenario: A newer attempt of the run

- **WHEN** the run's latest attempt is newer than the event's and is still
  running or has failed
- **THEN** the flow starts nothing and posts no attempt

#### Scenario: A pull request on the loop's branch that the App did not open

- **WHEN** the table holds the run's branch, but the open pull request on it
  was opened by anyone but the App
- **THEN** the flow starts nothing, posts nothing, and prints the pull
  request's number

#### Scenario: A pass holds the repository

- **WHEN** a board-loop pass or another flow holds the repository's lock
- **THEN** the flow waits for it, up to its bound, before reading the pull
  request, and on reaching the bound starts nothing and exits non-zero

### Requirement: A pull request gets at most three fix attempts

Before a session starts on a failed run, the CI flow SHALL post, as the App, a
pull request comment opening with the attempt mark and naming the run, its
`head_sha` and the attempt's number. Attempts SHALL be the App's comments
opening with that mark, at most one per `head_sha`, checked before the count.
The flow SHALL check the comments and post its own under the repository's
lock it took before reading the pull request, and hold that lock until the
push and the clone's cleanup after the session have ended, so no two
deliveries for one repository check at once and no pass writes to the clone
while the flow does.
A failure on a new `head_sha` after three attempts SHALL start no fix: the
flow posts a comment opening with the limit mark, and the session puts a
question on its card and ends `BLOCKED —`.

#### Scenario: The first three failures

- **WHEN** a pull request's run fails and the App has posted fewer than three
  attempt comments on it
- **THEN** the flow posts the next one, numbered, and then starts the session

#### Scenario: The fourth failure

- **WHEN** a run fails on a pull request that holds three attempt comments by
  the App, none of them naming the run's `head_sha`
- **THEN** the flow posts the limit comment, and the session it resumes changes
  nothing, puts one question on the card naming the pull request and the three
  runs, and ends `BLOCKED —`

#### Scenario: After the limit

- **WHEN** a run fails on a pull request that holds the App's limit comment
- **THEN** the flow starts nothing and posts nothing

#### Scenario: Two workflows fail on one commit

- **WHEN** a second workflow fails on a `head_sha` that already has an attempt
  comment
- **THEN** the flow starts no second attempt for it

#### Scenario: Two workflows fail on one commit at once

- **WHEN** two deliveries for two failed runs on one `head_sha` arrive at the
  same moment
- **THEN** exactly one attempt comment is posted and one session starts

#### Scenario: A mark someone else wrote

- **WHEN** a comment opening with the attempt mark or the limit mark was
  posted by anyone but the App
- **THEN** it counts for nothing

### Requirement: A fix reaches the pull request only as new commits the runner pushes

The session SHALL push nothing. It SHALL end with a structured
answer naming its outcome, `fixed`, `blocked` or `flaky`, and a summary. The
runner SHALL push the pull request's branch, never by force, only for `fixed`,
and only when `HEAD` is on that branch and holds the run's `head_sha` and at
least one commit after it, and only when the tree holds no tracked change and
no untracked file. A tree that does SHALL be left as it is, on its branch,
with the runner exiting non-zero naming the clone, whatever the outcome.
Neither the runner nor the session SHALL re-run, cancel or delete a CI run.

#### Scenario: A fix

- **WHEN** the session answers `fixed`, and `HEAD` is on the pull request's
  branch with a new commit after the run's `head_sha`
- **THEN** the runner pushes that branch as the App without force, and the
  push starts CI again

#### Scenario: A rewritten branch

- **WHEN** the session answers `fixed`, but `HEAD` no longer holds the run's
  `head_sha`, holds no new commit, or is on another branch
- **THEN** the runner pushes nothing and exits non-zero naming which

#### Scenario: A session that left changes uncommitted

- **WHEN** the session answers `fixed` or `blocked`, and the tree holds a
  tracked change or an untracked file
- **THEN** the runner pushes nothing, leaves the clone on that branch and
  tree, and exits non-zero naming the clone

#### Scenario: Blocked, or no answer

- **WHEN** the session answers `blocked` or `flaky`, runs past its limit, or
  ends without an answer that matches the schema
- **THEN** the runner pushes nothing; for no answer, it exits non-zero

#### Scenario: No token in the session

- **WHEN** the session runs
- **THEN** its environment holds no GitHub token, App setting or webhook
  secret, and it reads the logs from the file the runner wrote

### Requirement: The CI flow holds the pull request draft while it works on it

On the pull request route, the runner SHALL mark the pull request draft
before it brings the clone to the branch and resumes the session. Once that
work ends it SHALL mark the pull request ready, right after the push when it
pushes and otherwise as soon as it knows no push will come, unless the
session answered `blocked`, whose question on the card keeps the pull request
draft. A ready that GitHub refuses SHALL make the runner exit non-zero naming
the pull request. The flaky and scheduled routes SHALL leave the draft state
as they found it.

#### Scenario: The CI flow works on a draft

- **WHEN** the CI flow resumes the session on a pull request
- **THEN** the pull request is draft while the session runs; it is marked
  ready right after the push of a fix, and with no push for any outcome but
  `blocked`, which leaves it draft

#### Scenario: A ready GitHub refuses

- **WHEN** the runner pushed a fix and GitHub refuses to mark the pull
  request ready
- **THEN** the push stays, and the runner exits non-zero naming the pull
  request

### Requirement: A failed scheduled run files an idea card

When a run the `schedule` event started fails on the repository's default
branch, the CI flow SHALL start a fresh session in that repository's clone,
with the failed jobs' logs in a file it names. The session SHALL file an
`idea` card naming the workflow and the run on the board the repository names,
unless a card that is not `done` already names that workflow's failure, and
SHALL change no file.

#### Scenario: A nightly audit fails

- **WHEN** a scheduled run fails and no open card names its workflow
- **THEN** the session files one `idea` card naming the workflow and the run,
  and the clone's tree is unchanged

#### Scenario: It fails again the next night

- **WHEN** a scheduled run of the same workflow fails while that card is not
  `done`
- **THEN** no second card is filed

### Requirement: A run that passed on a later attempt is a flaky finding

When the run the flow reads has a later attempt on the same `head_sha` that
succeeded, the CI flow SHALL start no fix and count no attempt. A session SHALL
report the failed attempt as a `flaky` finding, filing a card that names the
tests that failed in it.

#### Scenario: A failure the user re-ran green

- **WHEN** a failed run's latest attempt, read when the flow takes the
  repository's lock, has the conclusion `success`
- **THEN** no attempt comment is posted, nothing is pushed, and a card names
  the failed attempt's tests as flaky

#### Scenario: A failure that failed again

- **WHEN** a run failed on attempt 2 after failing on attempt 1
- **THEN** it is handled as any failed run

### Requirement: The runner runs harness code only from its own checkout

The runner SHALL run the board loop, the goal check and every other harness
script from a checkout it alone writes, at the harness commit the
repository's `main` pins. It SHALL never run a harness file from a session's
clone, its `node_modules` included.

#### Scenario: A session edits the harness copy in its clone

- **WHEN** a session's clone holds an edited
  `node_modules/harness/bun/board-loop.ts` or `goal-check.ts`
- **THEN** the pass runs the runner's own copy, and the edited file is never
  executed

#### Scenario: The pin moves on main

- **WHEN** the repository's `main` pins a harness commit other than the one
  the runner's checkout holds
- **THEN** the runner fetches that commit into its checkout and the pass runs
  it, read from `main`, never from the session's branch

#### Scenario: The pin names no full commit

- **WHEN** the part of `main`'s harness pin after `#` is not a full commit, or
  the fetch from the harness's remote does not bring it
- **THEN** no pass starts, and the stop file names the value

#### Scenario: The session's clone names another repository

- **WHEN** the engine's job names no repository, or the session's clone's
  `origin` names one other than the repository the job names, or a host
  other than `github.com`
- **THEN** no pass starts, and no push clone or harness checkout is made or
  read

#### Scenario: Config left in a runner clone

- **WHEN** the push clone's or the harness checkout's `.git/config` sets a
  command, or its `.git/hooks` holds a hook
- **THEN** the pass rewrites that config and empties those hooks before its
  first git command there, and a clone it cannot reset stops the pass,
  named

### Requirement: The runner runs nothing in a session's clone as itself

Every git, bun or `claude` command the runner runs in a session's clone SHALL
run as the session user through one launcher, with the environment the
session allowlist names and no secret but the Claude Code token `claude`
needs. The runner SHALL read nothing from that
clone that a command of its own then executes.

#### Scenario: A hook or a config command in the session's clone

- **WHEN** the session's clone sets `core.fsmonitor`, `core.hooksPath` or a
  filter driver to a command
- **THEN** any run of that command during the pass is as the session user,
  never as the runner

#### Scenario: Every command in the clone goes through the launcher

- **WHEN** a pass runs against a clone
- **THEN** each command whose working directory is that clone was started
  through the launcher

### Requirement: The runner pushes from its own push clone, a commit whose tests passed

The runner SHALL make every push, the board loop's and the CI flow's fix push
alike, from a push clone it alone writes, into which it takes
the session's commits from a bundle the session user writes. It SHALL push a
commit only when a passing pre-PR run record (`pre-pr-runner`, *The runner
records each run for the commit it read*) the session's clone made of that
commit's SHA is found with that commit checked out there: by the goal check
on its step branch for the board loop's push, and by the same record read for
the CI flow's. That push SHALL run no hook, and the runner's bun SHALL load no
configuration from the pushed tree.

#### Scenario: A commit with a passing pre-PR record

- **WHEN** the bundle's step branch tip has a passing pre-PR record
- **THEN** the runner pushes exactly that SHA, and no hook runs

#### Scenario: A commit with no pre-PR record

- **WHEN** the bundle's tip has no passing pre-PR record
- **THEN** the runner pushes nothing and the pass ends `open`, naming the
  missing record

#### Scenario: The CI flow's fix push

- **WHEN** a CI fix session answers `fixed` and its bundle's tip is a new
  commit on top of the run's `head_sha` with a passing pre-PR record
- **THEN** the runner pushes that tip from its push clone, with no hook and
  no force, and the runner's token never enters the session's clone; a token
  the session's own `gh` mints is the session's (*The session's gh mints a
  token for each call*)

#### Scenario: A CI fix with no pre-PR record

- **WHEN** a CI fix session answers `fixed` and its tip has no passing pre-PR
  record
- **THEN** the runner pushes nothing and the flow exits 1, naming the missing
  record

#### Scenario: A preload in the pushed tree

- **WHEN** the pushed tree holds a `bunfig.toml` with a `preload`
- **THEN** no bun process the runner starts loads it

### Requirement: The pass reaches GitHub as the App alone

The host SHALL hold no GitHub token of the user's, and the wrapper SHALL read
none (the user's decision of 2026-10-23). The wrapper SHALL start a pass only
with the App's id and the key holder's mint command set. The pass's
environment SHALL hold no GitHub token: the push, the pull request it opens
and the check that reads that pull request SHALL use a token minted after the
stage session, and `readPullRequests()` SHALL read with a token minted for
that read alone. The pass's `gh` SHALL read its configuration from an empty
directory the pass owns, never from a login stored in the runner's home.

#### Scenario: No App configured

- **WHEN** the wrapper starts with the App's id or the mint command unset or
  empty
- **THEN** it starts no pass, writes the stop file naming the setting, and
  exits non-zero

#### Scenario: A private repository's pull requests

- **WHEN** a pass reads a branch's pull requests with the mint command set
- **THEN** the read's `gh` holds a `pull_requests` read token for that one
  repository, and a mint that fails fails the read

#### Scenario: A login stored in the runner's home

- **WHEN** `runner`'s home holds a `gh` login and a pass runs a `gh` call
  other than the push, the pull request and its check
- **THEN** that call finds no stored login and runs unauthenticated

#### Scenario: The pass's environment

- **WHEN** a pass is running, before its push, on a host that also holds a
  token file of the user's
- **THEN** the pass's environment holds no `GH_TOKEN` and no value of that
  file

### Requirement: Only the key holder reads the App's private key

The App's private key SHALL be readable by the key-holder user alone among
the host's unprivileged users; no automated `runner` or session user SHALL
read it. Root reads every file, and the user's emergency root session MAY
read the key while it runs (`design.md` *Remote Control is the user's root
session*). The
runner and the session user SHALL obtain an installation token only by
asking the key holder for one repository; the token SHALL last at most an
hour and carry permissions from a fixed set, and it SHALL never appear in a
process's arguments.

#### Scenario: The runner reads the key

- **WHEN** the runner or the session user opens the App's key file
- **THEN** the open fails for lack of permission

#### Scenario: The runner asks the key holder

- **WHEN** the runner or the session user needs the App's slug or a token
- **THEN** it runs the mint command for one repository, with `--slug` or the
  permissions, and reads the answer from that command's stdout alone

#### Scenario: A repository outside the installation

- **WHEN** the runner asks for a token for a repository the key holder's list
  does not name
- **THEN** the key holder mints nothing and exits non-zero, naming the
  repository

#### Scenario: A permission outside the fixed set

- **WHEN** the runner asks for a permission, or a level, the fixed set does
  not hold
- **THEN** the key holder mints nothing and exits non-zero, naming it

### Requirement: The session user reads no secret file

The session user SHALL be unable to read any secret file on the host outside
its own home: the runner's Notion bot token, the App's key, the claude.ai
login in root's home, every file the runner container mounts as a secret,
and the SSH and tunnel keys. Its own claude.ai login and its Notion settings
(roadmap decisions 16 and 42) SHALL live in its home, readable by it alone.

#### Scenario: Each secret file, as the session user

- **WHEN** the session user tries to read each secret file the host README
  provisions
- **THEN** every read fails for lack of permission, and the test names any
  file that it could read

#### Scenario: The session's own login

- **WHEN** the session user's claude.ai login or Notion settings file is in
  its home
- **THEN** its mode is 0600 and its owner the session user, and no other
  unprivileged user can read it

### Requirement: A pause posts one notice to the user

When the wrapper writes a stop file, it SHALL run the notice command the host
names, once, with the stop file and, when the pass started, its log. That
command SHALL post one page-level comment from the runner's Notion integration,
opening with `harness-pause`, mentioning the user, and holding the clone, the
stop file's line, the log's path and the command that removes the stop file.
The comment SHALL go on the card of the step the stop file's line names, found
on the board the runner's settings name by its `Pointer`, and SHALL then set
that card's `Assign` to the user. A pause whose line names no step, or whose
step matches not exactly one card, SHALL instead file a new card on that board,
with no `Pointer`, `Status` `approved`, `Assign` the user and a body saying why
the loop stopped, and post the comment there. A tick refused by an existing
stop file, and a pass stopped by hand, SHALL post nothing. The notice SHALL
change neither the stop file nor the wrapper's exit status, and a notice that
fails SHALL print why.

#### Scenario: A step's pass exits 1

- **WHEN** the pass exits 1 on `apply <slug> step <n>`, the runner's settings
  name a board, and one card there has the `Pointer` of `<slug>`
- **THEN** the stop file is written, one comment naming the clone, the stop
  line and the log's path is posted on that card from the integration, the
  card's `Assign` holds the user, and the wrapper exits 1

#### Scenario: The ticks that follow

- **WHEN** the timer fires again while the stop file exists
- **THEN** the wrapper exits 3 and the notice command does not run

#### Scenario: A host that cannot start the pass

- **WHEN** the wrapper pauses before the pass starts, as for a missing token
- **THEN** a new card at `approved`, assigned to the user, is filed on the
  board with the stop line as its reason, and the notice posted on it names no
  log

#### Scenario: No card names the step

- **WHEN** the stop line names a step whose slug no card's `Pointer`, or more
  than one, names
- **THEN** a new card is filed, saying so, and the notice is posted there

#### Scenario: No board is configured

- **WHEN** the runner's settings are missing or name no board
- **THEN** nothing is posted or filed, the command prints why, and the stop
  file and the exit status are those of a pause with no notice

#### Scenario: Notion refuses a call

- **WHEN** the query, the new card's creation, the comment's post or the
  `Assign` write fails
- **THEN** the command prints which step failed, makes no call after it, the
  stop file stands, and the wrapper exits with the pass's status

#### Scenario: A pass stopped by hand

- **WHEN** the user runs the stop command for a clone whose pass is running
- **THEN** no notice is posted

### Requirement: The runner keeps one persistent session running as the session user

The container's start SHALL start, before sshd, a detached tmux session
`main` as the session user running the start script. The script SHALL loop:
in the session's clone, `git pull --ff-only` and then
`bun install --frozen-lockfile`, each failure printing a line that names it;
then `claude` with Remote Control under a fixed name, continuing the
directory's last conversation, or a new one where the directory has none;
and, once `claude` exits, a 5-second pause before the next round.

#### Scenario: Claude Code exits

- **WHEN** `claude` in `main` exits, by a crash or `/exit`
- **THEN** after 5 seconds the script pulls and installs where the clone
  exists, and starts `claude` again with `--continue` where the directory it
  starts in holds a conversation, so in the same conversation unless the
  clone appeared between the two starts (user, 03.11, reversing answer 1 a)

#### Scenario: Nothing to continue

- **WHEN** Claude Code keeps no conversation for the directory `claude`
  starts in, the first start in the session user's home or the first after
  the clone
- **THEN** the script starts `claude` without `--continue`, as a new
  conversation, and a conversation that exists is never replaced by a new
  one because `claude` exited non-zero

#### Scenario: The pull fails

- **WHEN** `git pull --ff-only` fails, on a diverged branch or a failed
  token
- **THEN** the pane shows a line naming the pull, and `claude` starts on the
  tree the clone already holds

#### Scenario: The install fails

- **WHEN** `bun install --frozen-lockfile` fails
- **THEN** the pane shows a line naming the install, and `claude` starts all
  the same

#### Scenario: No clone yet

- **WHEN** the session's clone does not exist
- **THEN** the script runs neither the pull nor the install and starts
  `claude` in the session user's home

#### Scenario: The container restarts

- **WHEN** the runner container restarts or is recreated
- **THEN** `main` exists again as the session user, and its `claude` runs
  with Remote Control in the conversation it ran before, or in a new one
  where the clone appeared since and holds none

### Requirement: The session's gh mints a token for each call

`gh` on the image's `PATH` SHALL be a wrapper. Called by the session user
with `GH_TOKEN` unset or empty, it SHALL ask the key holder for a token for
`laidrivm/harness` with `contents` and `pull_requests` write, `checks`,
`actions` and `statuses` read and `workflows` write (decision 39 б), and run
the real `gh` with that token in that process's environment alone. git's
credential helper SHALL be this wrapper. No token SHALL be written to disk.

#### Scenario: A call with no token

- **WHEN** the session user runs `gh` with no `GH_TOKEN`
- **THEN** the real `gh` runs with a token minted for that call in its
  environment, and no process's arguments hold the token

#### Scenario: A token already set

- **WHEN** `gh` runs with `GH_TOKEN` set, as `readPullRequests()` sets a
  read-only token
- **THEN** the real `gh` runs with that token, and nothing is minted

#### Scenario: Another user

- **WHEN** a user other than the session user, `runner` among them, runs
  `gh` with no `GH_TOKEN`
- **THEN** the real `gh` runs as it is, and nothing is minted

#### Scenario: The mint fails

- **WHEN** the key holder's mint exits non-zero
- **THEN** the wrapper exits with the mint's status and the real `gh` does
  not run

#### Scenario: The mint answers with no token

- **WHEN** the key holder's mint exits 0 and prints no token
- **THEN** the wrapper exits 1, naming it, and the real `gh` does not run

#### Scenario: git reaches GitHub

- **WHEN** the session user's git fetches from or pushes to
  `laidrivm/harness` on `github.com` over HTTPS, the only transport the
  wrapper is the credential helper for
- **THEN** git takes its credential from the wrapper, so a push an hour or
  more after the session started succeeds; another repository gets a token
  that does not reach it

#### Scenario: A permission the mint does not hold

- **WHEN** the wrapper asks for a permission or level outside the key
  holder's fixed set
- **THEN** the suite fails, naming it

### Requirement: The image carries the tools the pre-push gates run

The runner image SHALL carry a Node release of 22 or later as `node`, never
a link to bun, and the `actionlint` and `gitleaks` binaries from the images
and digests `.github/workflows/lint.yml` pins. It SHALL pin Claude Code by
version and checksum with its auto-updater off.

#### Scenario: A linter pin that drifts from CI's

- **WHEN** the Dockerfile's `actionlint` or `gitleaks` image differs from the
  one `lint.yml` names, tag or digest
- **THEN** the suite fails, naming both

#### Scenario: Node is bun

- **WHEN** the image links `node` to bun or installs no Node
- **THEN** the suite fails

#### Scenario: A tool that does not run

- **WHEN** the image is built and `node`, `actionlint`, `gitleaks` or
  `claude` cannot print its version
- **THEN** the build fails

### Requirement: The session commits as the App's bot, named only on the host

The commit identity SHALL reach the session from the `runner` service's
environment, interpolated from an untracked `orchestrator/.env`, or from the
host shell's variable of the same name, which compose prefers to the file;
compose SHALL refuse to start while neither names a variable. No tracked file
SHALL hold the App's slug, its bot's numeric id or its bot's email.

#### Scenario: No identity on the host

- **WHEN** neither `orchestrator/.env` nor the host shell names a variable
  the identity needs
- **THEN** `docker compose up` refuses, naming the variable

#### Scenario: A bot email in a tracked file

- **WHEN** a tracked file under `orchestrator/` holds a GitHub bot's noreply
  address
- **THEN** the suite fails, naming the file

### Requirement: Every claude the runner starts as the session user reads ponytail's level as ultra

On every container start, before it starts the persistent session, the
runner's entrypoint SHALL write the session user's ponytail config file with
`defaultMode` `ultra`, as the session user. A failed write SHALL NOT stop the
entrypoint. The launcher a pass's session
runs under SHALL give `claude` the session user's home and no
`XDG_CONFIG_HOME`, so the pass reads the same file. Nothing the harness ships
to a laptop or a consumer SHALL set ponytail's level. This requirement sets
the level, not the plugin's presence: only the persistent session installs
ponytail (the next requirement), and a pass whose clone does not load that
install runs without ponytail (ship-ponytail design, D5).

#### Scenario: The level is written before the session starts

- **WHEN** the entrypoint is read
- **THEN** the line writing `$HOME/.config/ponytail/config.json` runs before
  the line starting tmux session `main`, and after the `authorized_keys`
  lines

#### Scenario: The written file names ultra

- **WHEN** that line's command runs with a temporary `HOME` holding no
  `.config`
- **THEN** `$HOME/.config/ponytail/config.json` parses to an object whose
  `defaultMode` is `ultra`, and a second run leaves the same file

#### Scenario: The write runs as the session user

- **WHEN** the entrypoint is read
- **THEN** the line writing the config file starts with `runuser -u agent --`,
  so a symlink planted in the session user's volume cannot turn it into a
  root write

#### Scenario: A failed write leaves the runner starting

- **WHEN** the config file cannot be written, because the session user's
  volume holds a file where its directory belongs or a directory it cannot
  write
- **THEN** the entrypoint prints a line naming ponytail's level and goes on
  to start the session and sshd

#### Scenario: A pass's session reads the same file

- **WHEN** the launcher runs a command with `HOME` and `XDG_CONFIG_HOME` set
  to the runner's values
- **THEN** the command sees `HOME=/home/agent` and no `XDG_CONFIG_HOME`

#### Scenario: The laptop's level is untouched

- **WHEN** the harness's tracked settings file and the files sync writes are
  read
- **THEN** none sets `PONYTAIL_DEFAULT_MODE` or names ponytail's config file

### Requirement: The persistent session installs ponytail before each start

In each round that finds the session's clone, the start script SHALL run
`claude plugin marketplace add` with the source and tag the project's
settings declare for ponytail, then `claude plugin install ponytail@ponytail`,
both with `--scope local`, in the clone, after `bun install
--frozen-lockfile` and before `claude`, with Claude Code's auto-updater off
and each call under a time limit. The script SHALL append a timestamp line
and both calls' output to `~/.cache/session-start.log`. A failed or
timed-out call SHALL print a line naming ponytail's install and SHALL NOT
stop `claude` from starting. Where the clone does not exist, the script
SHALL NOT run either call.

#### Scenario: Ponytail is installed before each start

- **WHEN** the start script runs a round in the session's clone, under `sh`
  or `dash`
- **THEN** it runs `claude plugin marketplace add <repo>#<ref> --scope
  local`, with the repository and tag of `extraKnownMarketplaces.ponytail`
  in the clone's `.claude/settings.json`, and then `claude plugin install
  ponytail@ponytail --scope local`, in the clone, each under `timeout`, with
  `DISABLE_AUTOUPDATER=1`, after the dependency install and before `claude`
  starts

#### Scenario: The install's output is kept in a log

- **WHEN** the start script runs a round in the session's clone
- **THEN** `~/.cache/session-start.log` gains a UTC timestamp line naming
  ponytail's install and both calls' output, and the pane shows none of it

#### Scenario: A failed plugin install leaves the session starting

- **WHEN** the clone's settings name no ponytail marketplace, the start log
  cannot be opened, or `claude plugin marketplace add` or `claude plugin
  install` exits non-zero, offline or before the clone is trusted, or
  outruns its time limit
- **THEN** the pane shows a line naming ponytail's install, a failed add
  skips the install, and `claude` starts all the same

#### Scenario: No plugin install without the clone

- **WHEN** the session's clone does not exist
- **THEN** the script runs neither `claude plugin marketplace add` nor
  `claude plugin install`

### Requirement: The host deploys main's green head and nothing else

A root timer SHALL start the host's deploy five minutes after boot and five
minutes after each run ends, one run at a time. Each run SHALL compare `origin/main`'s head with the commit it last
deployed and with the commit it last rolled back. When the head is neither and
its latest `test` check run from `github-actions` has concluded `success`, the
run SHALL fast-forward the host's checkout to that head and rebuild the
images, and SHALL record the head as deployed only once the session is up on
them. It SHALL move the host's checkout and images to no other commit; the
session's clone, which the runner's start script pulls when the session
restarts, MAY be at a newer head of `origin/main` than the one deployed.
While the Windmill deploy token's file
does not exist, the run SHALL skip the Windmill push and say so.

#### Scenario: Main has not moved

- **WHEN** a run finds `origin/main`'s head equal to the commit last
  deployed
- **THEN** the checkout, the images and the engine are unchanged

#### Scenario: The head's test check has not passed

- **WHEN** the head's `test` check is pending, failed or absent
- **THEN** the checkout is not moved, and the next tick reads the check again

#### Scenario: A rerun after a green run

- **WHEN** the head's `test` run succeeded and a later rerun of it is pending
  or failed, read before the fast-forward or again right before `up`
- **THEN** the stack is not brought up, the head is not recorded and no
  failure is written

#### Scenario: A green head

- **WHEN** the head differs from the commits last deployed and last rolled
  back, its `test` check concluded `success`, and the session is fresh
- **THEN** the checkout is at the head, the runner runs the image built from
  it, the session has started again, and the head is recorded as deployed

#### Scenario: The checkout cannot fast-forward

- **WHEN** the checkout has a tracked change, an untracked file that is not
  ignored, or a commit `origin/main` does not hold, whether or not the
  fast-forward itself succeeds
- **THEN** nothing is rebuilt, the head is not recorded, and the deploy fails

#### Scenario: The deploy token is absent

- **WHEN** a green head is deployed and `secrets/windmill_deploy_token` does
  not exist
- **THEN** no push and no engine wait run, the journal says the push was
  skipped, and the head is recorded

#### Scenario: The deploy's units

- **WHEN** the units under `orchestrator/host/` are read
- **THEN** the service is `Type=oneshot` with `StateDirectory=harness-deploy`
  and runs `deploy.sh` from `/root/harness/orchestrator`, and the timer starts
  it five minutes after boot and five minutes after each run, wanted by
  `timers.target`

### Requirement: The deploy restarts the session only while it is fresh

The runner image SHALL carry managed settings whose `SessionStart` hook, on
startup and on clear, marks the session fresh in agent's home, leaving the
mark as it was on a start that continues a conversation, and whose
`UserPromptSubmit` hook removes the mark. After its build the deploy SHALL
bring the stack up only when its last look for the mark, right before `up`,
finds it; otherwise it SHALL exit 0 without recording the head, so the next
tick tries again. A prompt submitted after that look MAY be cut short by the
restart. When `up` leaves
the runner container as it was, the deploy SHALL restart the runner, so the
session starts again on the updated clone.

#### Scenario: A session at work

- **WHEN** a green head is built and the fresh-session mark does not exist
- **THEN** no container is recreated or restarted, the head is not recorded,
  the run exits 0, and the next tick tries again

#### Scenario: A fresh session

- **WHEN** a green head is built and the fresh-session mark exists
- **THEN** the deploy brings the stack up and waits for the session

#### Scenario: An unchanged image

- **WHEN** the deploy brings the stack up and the runner container's id is
  the same afterwards
- **THEN** the deploy restarts the runner

#### Scenario: The container's managed settings

- **WHEN** `orchestrator/runner/managed-settings.json` and the Dockerfile are
  read
- **THEN** the image copies the settings to Claude Code's managed-settings
  path, its `SessionStart` hook matches `startup` and `clear` and creates the
  mark, and its `UserPromptSubmit` hook removes it

#### Scenario: The user's first message

- **WHEN** the managed hooks run for a `startup` or `clear` session start and
  then for a submitted prompt
- **THEN** the mark exists after the first and not after the second

#### Scenario: A continued start

- **WHEN** the managed hooks run for a start that continues the last
  conversation
- **THEN** the mark exists exactly when it existed before, and a failure file
  is reported as on any other start

### Requirement: A session that does not come back is rolled back

Before the build the deploy SHALL tag the image the running runner container
runs as the previous image. After bringing the stack up it SHALL wait at most
two minutes for the tmux session `main` in the runner. When `main` is not up
by then, it SHALL write the failure file, record the head as rolled back,
bring the runner up on the previous image once, and SHALL NOT deploy that
head again while the record holds it; a record that cannot be written SHALL
be told by the journal. A rollback that fails SHALL be told by the failure file and the
journal and left for the user; retrying or verifying it is stage 9's.

#### Scenario: The session comes back

- **WHEN** `main` is up within two minutes of `up`, and the engine wait and
  the push succeed or are skipped for want of the token
- **THEN** the head is recorded as deployed and the failure file is removed

#### Scenario: The session does not come back

- **WHEN** `main` is not up two minutes after `up`
- **THEN** the head is recorded as rolled back, the failure file names the
  head, the run fails, and, when the rollback's tag and `up` succeed, the
  runner runs the previous image

#### Scenario: A rolled-back head

- **WHEN** a run finds `origin/main`'s head equal to the commit last rolled
  back
- **THEN** the checkout, the images and the runner are unchanged

#### Scenario: The rollback fails

- **WHEN** the tag back or the runner's `up` fails during a rollback
- **THEN** the failure file names the failed step, the head stays recorded as
  rolled back, the run fails, and no later run retries the rollback

### Requirement: A deploy never ends a running pass

Until stage 7 removes the pass loop, the deploy SHALL recreate containers only
while it holds, from a process no container recreation ends, the pass gate and
every pass lock, waiting for a running pass to release its lock. A pass SHALL
take its repository lock only while it holds the gate, so no pass's lock file
appears during the hold. A tick that starts during the hold SHALL find its
repository busy.

#### Scenario: A pass is running when main moves

- **WHEN** a green head arrives while a pass holds its repository's lock
- **THEN** the deploy brings the stack up only after that pass has ended, and
  the pass's log ends as the pass ended it

#### Scenario: A tick during the deploy

- **WHEN** the pass schedule fires while the deploy holds the locks
- **THEN** the wrapper prints `busy` and exits 0, and writes no stop file

#### Scenario: A repository's first pass during the deploy

- **WHEN** a pass for a repository with no lock file yet starts while the
  deploy holds the gate
- **THEN** it creates no lock file, prints `busy` and exits 0

#### Scenario: The runner is recreated under the locks

- **WHEN** `docker compose up -d` recreates the runner during the hold
- **THEN** the locks stay held until `up` has finished

### Requirement: A failed deploy is told to the session

When a step after the fast-forward fails, the deploy SHALL write the failure
file in agent's home, naming the failed step and the commit and replacing an
older one, SHALL write each clone's stop file that does not exist yet, until
stage 7 removes them, and SHALL NOT record the commit as deployed. A fetch or
check read that fails SHALL write neither, nor SHALL a run that the service's
start timeout kills before the failure file is written, which leaves the
timeout on the journal. The managed `SessionStart` hook
SHALL print the failure file, when it exists, on startup, on clear and on a
continued start, with a line asking the session to report it to the user in
chat, and SHALL then move it aside, so the next start does not report it
again.

#### Scenario: The build fails

- **WHEN** the image build fails for a green head
- **THEN** the failure file and every clone's stop file name the deploy, the
  build and the head, the head is not recorded, and the next tick retries the
  deploy

#### Scenario: GitHub cannot be reached

- **WHEN** the fetch or the check read fails
- **THEN** no failure file and no stop file is written and the next tick
  tries again

#### Scenario: A stop file already exists

- **WHEN** a clone's stop file exists as the deploy fails
- **THEN** that file is left as it was

#### Scenario: The session starts after a failed deploy

- **WHEN** the managed `SessionStart` hook runs while the failure file exists
- **THEN** its output asks the session to report the failure to the user and
  carries the file's line, and the next start's output does not
