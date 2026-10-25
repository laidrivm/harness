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

When the pass exits non-zero, the wrapper SHALL write a stop file naming the
time, the exit status and the pass's last line, and SHALL exit with the pass's
status. While the stop file exists, the wrapper SHALL start no pass and SHALL
exit non-zero, naming the file. Nothing but the user SHALL remove it.

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

### Requirement: No tracked file starts Remote Control

No file under `orchestrator/` SHALL start Claude Code with Remote Control,
save `orchestrator/README.md`, which documents the session. Remote Control on
the host is a session the user starts by hand and ends.

#### Scenario: A tracked file that starts Remote Control

- **WHEN** a tracked file under `orchestrator/` other than its README runs
  `claude remote-control` or passes `--remote-control`
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
commit only when a passing pre-PR record the session's clone made of that
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
  no force, and the App's token never enters the session's clone

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
runner SHALL obtain an installation token only by asking the key holder for
one repository; the token SHALL last at most an hour and carry permissions
from a fixed set, and it SHALL never appear in a process's arguments.

#### Scenario: The runner reads the key

- **WHEN** the runner or the session user opens the App's key file
- **THEN** the open fails for lack of permission

#### Scenario: The runner asks the key holder

- **WHEN** the runner needs the App's slug or a token
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

The session user SHALL be unable to read any secret file on the host: the
Notion bot's token, the App's key, the claude.ai login in
root's home, and the SSH and tunnel keys.

#### Scenario: Each secret file, as the session user

- **WHEN** the session user tries to read each secret file the host README
  provisions
- **THEN** every read fails for lack of permission, and the test names any
  file that it could read
