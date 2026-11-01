# agent-rulebook — delta

## MODIFIED Requirements

### Requirement: The yield ledger counts first reviews without a Major-or-above finding

The session wrap-up SHALL append one `first review` line to the
pipeline-yield entry it writes: of the pull requests whose first CodeRabbit
review completed since the previous entry, how many raised no Critical or
Major finding, naming each. The first review is the earliest commit the bot
reviewed for that pull request: one with a `CodeRabbit` check run of the
bot's that `work-finish` (*CodeRabbit's state of a commit is read from its
check runs*) counts as a review — concluded `success` with a title not
opening `Review skipped`, never read from the run's summary text — or with a
`CodeRabbit` status reading `success` with the description
`Review completed`. Its findings are the bot's
reviews of that commit, by the bot's own severity label, or, for a finding
that carries none, by the kind its heading implies, the pull request then
marked as inferred.

#### Scenario: A Major on the first reviewed commit

- **WHEN** the bot's review of a pull request's first reviewed commit
  carries one Major finding, and its review of a later commit carries none
- **THEN** the line counts that pull request as one with a Major or above,
  because only the first review is counted

#### Scenario: A first review with no findings

- **WHEN** a pull request's first reviewed commit has a `CodeRabbit` check
  run concluded `success` and titled `Finished`, and the bot submitted no
  review of it
- **THEN** the line counts that pull request as one without a Major or above

#### Scenario: A pull request the bot did not review

- **WHEN** no commit of a pull request was reviewed, because the bot skipped
  it, hit its rate limit or never ran
- **THEN** the line names that pull request as unmeasured and leaves it out
  of both counts, and a later wrap-up that finds it reviewed counts it

#### Scenario: A commit the bot reviewed for another pull request

- **WHEN** a stacked pull request's earliest commit was reviewed for the pull
  request below it, and its own first review lands on a later commit
- **THEN** the line counts the later commit's review, not the earlier
  commit's absence of one

#### Scenario: A Major later dismissed

- **WHEN** the first review's only Major finding is dismissed by the user
- **THEN** the line still counts that pull request as one with a Major or
  above, because the line measures what the review raised, not what was kept

#### Scenario: Nothing reviewed since the previous entry

- **WHEN** no pull request's first review completed since the previous entry,
  or the project has no CodeRabbit
- **THEN** the entry still gains the line, reading `none reviewed`
