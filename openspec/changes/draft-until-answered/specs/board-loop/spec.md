## MODIFIED Requirements

### Requirement: The runner pushes the step and opens its pull request

The stage session SHALL push nothing and open no pull request. Once it and
everything it started have ended, the runner SHALL push the step's branch to
`origin`'s repository, never by force, and open its pull request against the default
branch, only when `HEAD` is on that branch, the before-push goal check that
`stage-goal` fixes reads `goal met`, and the session's final message names the
pull request's title and body. Its verdict SHALL then be the full goal check.
The pull request SHALL open as a draft when the session's question reached
the card (*A pull request stays a draft while its question waits*), and
ready for review otherwise.

#### Scenario: A step ready to push

- **WHEN** the session ends on the step's branch, the before-push check reads
  `goal met`, and the final message holds one `PR-TITLE:` line and one
  `PR-BODY:` line with a body below it, and no question that reached the card
- **THEN** the runner pushes that branch without force, opens a pull request
  ready for review with that title and body, and records the full check's
  verdict

#### Scenario: A step ready to push beside a question

- **WHEN** the step is ready to push as above, and the final message's
  question reached the card
- **THEN** the runner opens the pull request as a draft with that title and
  body, and records the full check's verdict

#### Scenario: A step not ready

- **WHEN** the before-push check reads `goal open`, the session ran past the
  limit, or `HEAD` is on any branch but the step's
- **THEN** the runner pushes nothing, opens nothing, and the branch keeps its
  commits for the pass that continues it

#### Scenario: No title or body

- **WHEN** the final message holds no `PR-TITLE:` line, two of them, no
  `PR-BODY:` line, or an empty title or body
- **THEN** the runner opens no pull request, and the pass records `open`
  naming what the message lacked

#### Scenario: The push is refused

- **WHEN** `origin` refuses the push, because its branch moved or the step
  touches a file the pushing identity may not write
- **THEN** the runner neither forces nor retries, opens nothing, and the pass
  records `open` with the push's failure

#### Scenario: The pull request already exists

- **WHEN** opening fails because a pull request whose head is `HEAD` already
  exists on the branch
- **THEN** the verdict is the full check's, which reads `goal met`

## ADDED Requirements

### Requirement: A pull request stays a draft while its question waits

A stage session's question SHALL count as reaching the card when its final
message holds one well-formed `QUESTION:` line and the runner's line for it
says it was posted, answered by the triage, or already waiting there; or,
where no integration is configured, when that line is well formed, since the
session posted the question itself. In those launch forms the session SHALL
repeat its posted question under a `QUESTION:` line. A malformed line, or a
post that failed, SHALL count as no question.

#### Scenario: A question posted from the integration

- **WHEN** the runner prints that it posted the session's question on the
  card, with `Assign` set or answered from a source
- **THEN** the step's pull request opens as a draft

#### Scenario: A question already waiting

- **WHEN** the runner prints that a question already waits on the card
- **THEN** the step's pull request opens as a draft

#### Scenario: A question the session posted itself

- **WHEN** no integration is configured, the session posted its question
  through the ask command or the connector, and its final message repeats it
  under a well-formed `QUESTION:` line
- **THEN** the step's pull request opens as a draft

#### Scenario: A question that never reached the card

- **WHEN** the `QUESTION:` line is malformed, the question fails the question
  gate's checks, the card is not the carried change's, or the post fails
- **THEN** the step's pull request opens ready for review, as with no
  question

### Requirement: An answer beside a draft pull request is carried on its branch

A change whose step's branch has an open draft pull request SHALL be an answer
candidate for that step on that branch, not passed over. Its session SHALL
continue the branch, write the card's answer into the step's work, and end
as a step does. When that pass's question did not reach the card, the runner
SHALL mark the pull request ready for review once its push went through and,
with the integration, then remove the user alone from the card's `Assign`.

#### Scenario: A draft waiting on its answer

- **WHEN** step 2 of a change has an open draft pull request on
  `feat/<slug>-2`
- **THEN** the change is an answer candidate for step 2 on `feat/<slug>-2`,
  and the pick takes it only once the card's question has its answer

#### Scenario: The answer carried with no new question

- **WHEN** the pass carrying that answer pushes the branch and its final
  message holds no question that reached the card
- **THEN** the runner marks the pull request ready for review, removes the
  user from the card's `Assign` and leaves anyone else on it, prints both,
  and records the full check's verdict

#### Scenario: The answer raises another question

- **WHEN** the pass carrying that answer ends with a question that reached
  the card
- **THEN** the pull request stays a draft and `Assign` stays on the user

#### Scenario: The answer asks for a change of its own

- **WHEN** the answer chooses a separate change
- **THEN** the session files an `idea` card for it, adds nothing to the
  branch, and names the pull request's title and body, so the runner marks
  the pull request ready

#### Scenario: Marking ready fails

- **WHEN** `gh pr ready` fails
- **THEN** the runner prints the failure, leaves `Assign` as it is, and the
  pass's outcome stays the full check's

#### Scenario: A ready pull request

- **WHEN** a step's branch has an open pull request that is not a draft
- **THEN** the change is passed over, the reason naming that pull request, as
  *A pass takes only a takeable change* fixes
