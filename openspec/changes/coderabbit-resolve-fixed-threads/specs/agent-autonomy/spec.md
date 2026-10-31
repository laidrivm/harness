# agent-autonomy — delta

## MODIFIED Requirements

### Requirement: The bot's review is worked once it has landed on the head commit, never waited for

`/coderabbit` SHALL first read the pull request's head commit, then the
head's `CodeRabbit` check runs and `CodeRabbit` commit status, and only then
its reviews. The head counts as reviewed when a review from the bot is on it,
when that status reads `success` with the description `Review completed`, or
when CodeRabbit's state of the head, read from its check runs as
`work-finish` (*CodeRabbit's state of a commit is read from its check runs*)
reads it, is `reviewed`, since a review with no findings submits no review
object. When none holds, the run SHALL end with
a `CODERABBIT gate: OPEN` line naming that commit as not yet reviewed, after
that one read, with no sleep and no second read. A run that finds the head
reviewed, by any of the three, SHALL dispose of the findings of every review
on it on the finding-disposal terms `local-review-loop` sets in *A verified
finding is fixed without asking*, *Dismissing a Major or above is the user's
call*, *Minor findings are reported once, at the end* and *A justification
survives only when it is a convention*, SHALL read
the head again before applying a fix and before naming a `resolve` command,
and SHALL re-fetch once before its gate line to reconcile against the bot's
count, without sleeping or looping. A head with no review object on it SHALL
reach `PASS` only while the bot's walkthrough says no actionable comments were
generated and names that head as its commit; otherwise the run SHALL end on
the no-review `OPEN` line. Each
step that waits on the user SHALL carry an `(unattended: card` marker.

#### Scenario: The head commit has no review yet

- **WHEN** an unattended session runs `/coderabbit` on a pull request whose
  newest bot review is on an earlier commit, whose head's `CodeRabbit`
  status is anything but `success` with the description `Review completed`,
  a `success` reading `Review skipped: draft pull request` included, and
  whose head's check runs read as any state but `reviewed`
- **THEN** the run ends on `CODERABBIT gate: OPEN` naming the head commit's
  short SHA, after one read, with no sleep and no second read

#### Scenario: The head counted by its check run alone

- **WHEN** the head has no review object and no `CodeRabbit` commit status,
  and its check runs are CodeRabbit's skip, `skipped` titled `Review
  skipped`, and a later run that succeeded titled `Finished`
- **THEN** the run counts the head as reviewed, reads every review body and
  comment for findings on it, re-fetches once before its gate line, and ends
  on `PASS` when the walkthrough says no actionable comments were generated
  and names the head as its commit

#### Scenario: Counted by its check runs, the walkthrough not yet updated

- **WHEN** the head has no review object, its check runs read `reviewed`,
  and the bot's walkthrough still names an earlier commit
- **THEN** the run ends on the no-review `OPEN` line naming the head, never
  on `PASS`

#### Scenario: A review posted between the reads

- **WHEN** the bot posts its review of the head after the run has read the
  head's check runs as `reviewed`
- **THEN** the run's read of the reviews, which comes after, finds that
  review and dispositions its findings

#### Scenario: The head moves before a fix is applied

- **WHEN** a run that counted the head as reviewed, by a review object or by
  its check runs alone, is about to apply a fix, and the head has moved since
  step 1
- **THEN** it reads the new head's check runs, commit status and reviews
  again, in step 1's order, and verifies each finding against the new head
  before applying it — a read apart from the single re-fetch before the gate
  line — and ends on the no-review `OPEN` line if none of step 1's three
  tests counts the new head as reviewed

#### Scenario: A review lands while the run disposes of the first

- **WHEN** a run finds a review of the head commit, and a second review posts
  while the run is disposing of the first one's findings
- **THEN** the single re-fetch before the gate line finds the second review,
  and its findings are dispositioned before the gate line reads `PASS`

#### Scenario: A landed review with a dismissal

- **WHEN** an unattended session runs `/coderabbit` over a review of the head
  commit, and verifying the findings leaves one fix and one 🟠 Major it would
  dismiss
- **THEN** it applies the fix without asking, hands the dismissal on through
  the card-questions procedure with what the bot missed, and the gate line
  reads `OPEN`
