# orchestrator delta

## ADDED Requirements

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
