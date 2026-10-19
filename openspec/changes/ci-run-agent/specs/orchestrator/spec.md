# orchestrator delta

## ADDED Requirements

### Requirement: An event is handled only once its signature verifies

The handler SHALL take the request's body as bytes and its event, delivery and
signature headers as one argument, and SHALL refuse a header value of the wrong
shape. It SHALL compute the body's HMAC-SHA256 with the webhook secret, a file
only the runner's user reads, and SHALL act on nothing before that HMAC matches
the signature. It SHALL print one line naming its verdict, exit 0 for an event
it handled or ignored, and exit non-zero for one it refused.

#### Scenario: A valid delivery of an event no flow takes

- **WHEN** a correctly signed delivery names an event no flow handles, `ping`
  included
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
ignore a delivery whose id it has already recorded. When it exits non-zero
before any flow posted to GitHub or started a session, it SHALL forget the id,
so that GitHub's redelivery is handled.

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

### Requirement: A failed CI run starts an agent only for a pull request the loop opened

The CI flow SHALL act on a `workflow_run` event only when its action is
`completed`, its conclusion is `failure`, its head repository is the
repository itself, and that repository has a clone on the host. A run on a
`feat/` or `spec/` branch SHALL start an agent only for an open pull request
whose head is still the run's `head_sha` and which the PR → session table
holds; the agent SHALL resume that session in the clone the table names.

#### Scenario: A failed run on a step's pull request

- **WHEN** a run on the branch of an open pull request the table holds fails,
  and the pull request's head is the run's `head_sha`
- **THEN** the flow resumes that pull request's session in its clone, with the
  failed jobs' logs in a file it names

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

- **WHEN** the table holds no record of the pull request, or the run's branch
  has no open pull request
- **THEN** the flow starts nothing, posts nothing, and prints the pull
  request's number or the branch

#### Scenario: A stale run

- **WHEN** the pull request's head has moved past the run's `head_sha` by the
  time the flow reads it
- **THEN** the flow starts nothing, since the newer commit's run is its own
  event

#### Scenario: A pass holds the repository

- **WHEN** a board-loop pass or another flow holds the repository's lock
- **THEN** the flow waits for it, up to its bound, before reading the pull
  request, and on reaching the bound starts nothing and exits non-zero

### Requirement: A pull request gets at most three fix attempts

Before a session starts on a failed run, the CI flow SHALL post a comment on
the pull request as the App, opening with the attempt mark and naming the
run, its `head_sha` and the attempt's number. It SHALL count attempts as the
App's comments that open with that mark, and SHALL start at most one attempt
per `head_sha`. At the fourth failure it SHALL start no fix, post a comment
opening with the limit mark, and have the session put a question on its card and end `BLOCKED —`.

#### Scenario: The first three failures

- **WHEN** a pull request's run fails and the App has posted fewer than three
  attempt comments on it
- **THEN** the flow posts the next one, numbered, and then starts the session

#### Scenario: The fourth failure

- **WHEN** a run fails on a pull request that holds three attempt comments by
  the App
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

#### Scenario: A mark someone else wrote

- **WHEN** a comment opening with the attempt mark or the limit mark was
  posted by anyone but the App
- **THEN** it counts for nothing

### Requirement: A fix reaches the pull request only as new commits the runner pushes

The session SHALL push nothing. It SHALL end with a structured
answer naming its outcome, `fixed`, `blocked` or `flaky`, and a summary. The
runner SHALL push the pull request's branch, never by force, only for `fixed`,
and only when `HEAD` is on that branch and holds the run's `head_sha` and at
least one commit after it. Neither the runner nor the session SHALL re-run,
cancel or delete a CI run.

#### Scenario: A fix

- **WHEN** the session answers `fixed`, and `HEAD` is on the pull request's
  branch with a new commit after the run's `head_sha`
- **THEN** the runner pushes that branch as the App without force, and the
  push starts CI again

#### Scenario: A rewritten branch

- **WHEN** the session answers `fixed`, but `HEAD` no longer holds the run's
  `head_sha`, holds no new commit, or is on another branch
- **THEN** the runner pushes nothing and exits non-zero naming which

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
