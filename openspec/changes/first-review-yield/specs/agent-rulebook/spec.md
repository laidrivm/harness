## ADDED Requirements

### Requirement: The yield ledger counts first reviews without a Major-or-above finding

The session wrap-up SHALL append one `first review` line to the
pipeline-yield entry it writes: of the pull requests whose first CodeRabbit
review completed since the previous entry, how many raised no Critical or
Major finding, naming each. The first review is the earliest commit of the
pull request that the bot marked `Review completed`; its findings are the
bot's reviews of that commit, by the bot's own severity label.

#### Scenario: A Major on the first reviewed commit

- **WHEN** the bot's review of a pull request's first reviewed commit
  carries one Major finding, and its review of a later commit carries none
- **THEN** the line counts that pull request as one with a Major or above,
  because only the first review is counted

#### Scenario: A first review with no findings

- **WHEN** a pull request's first reviewed commit reads `Review completed`
  and the bot submitted no review of it
- **THEN** the line counts that pull request as one without a Major or above

#### Scenario: A pull request the bot did not review

- **WHEN** no commit of a pull request reads `Review completed`, because the
  bot skipped it, hit its rate limit or never ran
- **THEN** the line names that pull request as unmeasured and leaves it out
  of both counts

#### Scenario: A Major later dismissed

- **WHEN** the first review's only Major finding is dismissed by the user
- **THEN** the line still counts that pull request as one with a Major or
  above, because the line measures what the review raised, not what was kept

#### Scenario: Nothing reviewed since the previous entry

- **WHEN** no pull request's first review completed since the previous entry,
  or the project has no CodeRabbit
- **THEN** the entry still gains the line, reading `none reviewed`
