# agent-autonomy — delta spec

## ADDED Requirements

### Requirement: A skill only the user may start is a `user` step

`core/autonomy.md` SHALL class a skill whose frontmatter carries
`disable-model-invocation: true` as `user` for an unattended session. When
its work needs such a skill, the session SHALL stop that work and report
`BLOCKED`, naming the skill. It SHALL NOT carry out the skill's steps by
other means.

#### Scenario: The work needs a merge through `/ship`

- **WHEN** an unattended session's work would need `/ship`, whose frontmatter
  carries the flag
- **THEN** it neither runs `/ship` nor merges by hand, and reports `BLOCKED`
  naming `/ship`

### Requirement: The bot's review is worked once it has landed, never waited for

`/coderabbit` SHALL read the pull request's reviews once per run. When no
review from the bot is there, it SHALL end with a `CODERABBIT gate: OPEN` line
saying that no review has landed, and SHALL NOT sleep, poll, or read the pull
request again within that run. A run that finds reviews SHALL dispose of
their findings on the terms `local-review-loop` sets for the local review.
Each of its steps that waits on the user SHALL carry an `(unattended: card`
marker.

#### Scenario: No review has landed

- **WHEN** an unattended session runs `/coderabbit` on a pull request the bot
  has not reviewed
- **THEN** the run ends on `CODERABBIT gate: OPEN` saying no review has
  landed, after one read, with no sleep and no second read

#### Scenario: A landed review with a dismissal

- **WHEN** an unattended session runs `/coderabbit` over a landed review, and
  verifying the findings leaves one fix and one 🟠 Major it would dismiss
- **THEN** it applies the fix without asking, hands the dismissal on through
  the card-questions procedure with what the bot missed, and the gate line
  reads `OPEN`
