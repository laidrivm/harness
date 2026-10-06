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
