# agent-autonomy — delta spec

## ADDED Requirements

### Requirement: A skill only the user may start is a `user` step

`core/autonomy.md` SHALL class a skill whose frontmatter carries
`disable-model-invocation: true` as `user` for an unattended session. When its
work needs such a skill, the session SHALL stop that work and report
`BLOCKED`, naming the skill, and SHALL NOT carry out the skill's steps by
other means.

#### Scenario: The work needs a merge through `/ship`

- **WHEN** an unattended session's work would need `/ship`, whose frontmatter
  carries the flag
- **THEN** it neither runs `/ship` nor merges by hand, and reports `BLOCKED`
  naming `/ship`

### Requirement: The bot's review is worked once it has landed on the head commit, never waited for

`/coderabbit` SHALL first read the pull request's head commit and its reviews.
When no review from the bot is on the head commit, the run SHALL end with a
`CODERABBIT gate: OPEN` line naming that commit as not yet reviewed, after
that one read, with no sleep and no second read. A run that finds such a
review SHALL dispose of its findings on the terms `local-review-loop` sets for
the local review, and SHALL re-fetch once before its gate line to reconcile
against the bot's count, without sleeping or looping. Each step that waits on
the user SHALL carry an `(unattended: card` marker.

#### Scenario: The head commit has no review yet

- **WHEN** an unattended session runs `/coderabbit` on a pull request whose
  newest bot review is on an earlier commit
- **THEN** the run ends on `CODERABBIT gate: OPEN` naming the head commit's
  short SHA, after one read, with no sleep and no second read

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

### Requirement: An unattended session runs `/session-wrapup` without waiting on the user

`session-wrapup` SHALL be startable by the model. An unattended session
running it SHALL take each of its steps itself, except one: each capture it
proposes in step 2 is handed on as `card`, and applied by nobody until the
user settles it.

#### Scenario: Wrapping up before the session ends

- **WHEN** an unattended session runs `/session-wrapup` after work that left a
  correction to propose and a card behind its floor
- **THEN** it corrects the card and writes the yield entry, hands the proposed
  correction on as a card question, and ends without waiting for an answer
