# agent-rulebook Specification

## Purpose

How `CLAUDE.md`'s rules list is organised, and what happens to a prose rule
once a mechanism enforces it. It exists because a rulebook that only grows is
a rulebook that stops being read: rules need a home that says whether they can
ever be evicted, and a prohibition stated in both prose and a mechanism drifts
until the two disagree.

## Requirements
### Requirement: The rules list is partitioned into three sublists

`CLAUDE.md`'s rules list SHALL be split into **Code**, **Process** and
**Safety** sublists, each under its own heading. A code rule is one that ages
with the code it describes and is evictable once that code changes; process
and safety rules do not age. The ~20-rule maintenance trigger SHALL apply per
sublist, not to the list as a whole, so the count that fires names a sublist
where eviction is actually possible.

#### Scenario: A rule about a Preact effect

- **WHEN** a rule describes how a listener must read state in this
  application's components
- **THEN** it belongs under Code, and becomes evictable when that component
  is rewritten

#### Scenario: A rule about British English

- **WHEN** a rule governs how every repository artefact is written
- **THEN** it belongs under Process and is not a candidate for eviction

#### Scenario: The trigger fires

- **WHEN** one sublist reaches about twenty rules
- **THEN** the maintenance proposal names that sublist, and does not count the
  other two against it

### Requirement: A mechanised prohibition leaves its prose home

WHEN a prohibition becomes a `deny` entry, a hook or a CI check, the prose
stating what that mechanism covers SHALL be deleted from `CLAUDE.md` or from
whichever doc indexed there holds it — from whichever section holds it, not
only from the rules list. A prohibition SHALL NOT be stated in both places,
because the prose then reads as the boundary while the mechanism is the
boundary, and the two can drift apart. Where the section holding the prose
stands in a doc indexed from `CLAUDE.md` rather than in `CLAUDE.md` itself,
this requirement reaches it there. A file under `docs/context/` is not
indexed and is out of reach: a save point records what a session observed,
and is not a home a prohibition can be stated from.

#### Scenario: A rule fully covered by a mechanism

- **WHEN** committing on `main` becomes a hook
- **THEN** the sentence forbidding it is deleted from the Git & PRs section

#### Scenario: The section holding it has been extracted

- **WHEN** the prohibition's prose stands in a doc indexed from `CLAUDE.md`
  rather than in `CLAUDE.md` itself
- **THEN** it is deleted from that doc on the same terms, and its having
  moved is not a reason to leave it standing

#### Scenario: The same sentence in a save point

- **WHEN** a file under `docs/context/` recounts a prohibition that has since
  become a mechanism
- **THEN** nothing is deleted — the file is not indexed, and it records what a
  session saw rather than stating a boundary

#### Scenario: A rule only partly covered

- **WHEN** the secret scanner covers tokens and keys but not machine-local
  paths or internal identifiers
- **THEN** the prose is shortened to what the scanner cannot see, rather than
  deleted whole

#### Scenario: A prohibition that resists mechanisation

- **WHEN** no mechanism can express a prohibition without a far broader block
  than the rule intends
- **THEN** it stays prose, and the proposal that considered it records why

### Requirement: The pre-PR sequence has one home

`docs/review-toolkit.md` SHALL be the only place stating the pre-PR gate
sequence. Other documents MAY reference the sequence by name and link, which
is not a restatement.

#### Scenario: The duplicate is removed

- **WHEN** another document carries a list of the same sequence, as `PLAN.md`
  once did under "Gates (reminder)"
- **THEN** the list is deleted, and at most a reference by name and link
  replaces it

#### Scenario: A reference is kept

- **WHEN** `docs/feature-workflow.md` Stage 3 says to run the sequence the
  Review toolkit sets out
- **THEN** it stays, because it names the owner instead of repeating the list

#### Scenario: The rule that treated the symptom

- **WHEN** the duplication is removed
- **THEN** the grep rule is narrowed to the sites that still restate things —
  the OpenSpec specs and the README ownership map — rather than deleted,
  because those restatements remain

### Requirement: A captured lesson is weighed as a mechanism before it is written as prose

The fix & capture loop SHALL ask whether a mechanism can hold a lesson before
it proposes a rule for it. A mechanism is a test over the code the lesson is
about, or a gate: a `harness:check` check, a hook or a permission entry. A
rule SHALL be proposed only as the stop-gap for a gate filed as a card, or
when no mechanism can express the lesson without blocking far more than the
rule intends — and then the proposal SHALL say why.

#### Scenario: A test the branch can add

- **WHEN** a lesson is about one piece of code, and a test over that code,
  which the branch in hand can add, holds it
- **THEN** the capture adds the test in the same turn and proposes no rule

#### Scenario: A mechanism that changes a gate

- **WHEN** the mechanism that would hold a lesson is a hook, a permission
  entry or a new `harness:check` check — a gate change, which enters the
  OpenSpec cycle
- **THEN** the capture files a card for that mechanism, on the board of the
  repository that would ship it, and proposes the rule as a stop-gap, which
  leaves under *A mechanised prohibition leaves its prose home* once the gate
  lands

#### Scenario: No mechanism fits

- **WHEN** every mechanism that could hold a lesson would block far more than
  the rule intends
- **THEN** the rule is proposed, and the proposal to the user names why no
  mechanism fits

#### Scenario: A one-off

- **WHEN** a lesson is a one-off the loop already declines to capture
- **THEN** no mechanism is weighed either — the question applies only to what
  would otherwise become a rule

### Requirement: The yield ledger counts captures by kind

The session wrap-up SHALL tag every capture it proposes with its kind —
`mechanism`, `card + rule`, `rule`, `skill edit` or `memory` — and SHALL
append one line counting each kind to the pipeline-yield ledger it already
writes, so the share of lessons that became mechanisms accumulates where the
review steps' yield does.

#### Scenario: A session that captured something

- **WHEN** a wrap-up proposes two rules and one card with its stop-gap rule
- **THEN** the ledger gains a `captures:` line counting 2 `rule` and
  1 `card + rule`, beside that session's review-skill lines

#### Scenario: A session with nothing to capture

- **WHEN** a wrap-up's lessons step reports nothing to capture
- **THEN** the ledger still gains a `captures:` line reading zero, because a
  session that produced no lesson is a data point and not a gap

#### Scenario: A capture the user declines

- **WHEN** the user declines a proposed capture
- **THEN** it is still counted under the kind it was proposed as, because
  the line measures what the loop proposed, not what the user kept

### Requirement: The yield ledger counts first reviews without a Major-or-above finding

The session wrap-up SHALL append one `first review` line to the
pipeline-yield entry it writes: of the pull requests whose first CodeRabbit
review completed since the previous entry, how many raised no Critical or
Major finding, naming each. The first review is the earliest commit the bot
marked `Review completed`, with a `success` result, for that pull request;
its findings are the bot's
reviews of that commit, by the bot's own severity label.

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
  of both counts, and a later wrap-up that finds it reviewed counts it

#### Scenario: A commit the bot reviewed for another pull request

- **WHEN** a stacked pull request's earliest commit reads `Review completed`
  for the pull request below it, and its own first review lands on a later
  commit
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
