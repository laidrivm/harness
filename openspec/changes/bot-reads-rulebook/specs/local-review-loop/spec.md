# local-review-loop — delta spec

## ADDED Requirements

### Requirement: The review bot reads the rulebook and the docs it indexes

The harness's `.coderabbit.yaml` SHALL name patterns under
`knowledge_base.code_guidelines.filePatterns` that match `core/rules.md` and
every doc `CLAUDE.md` links. Each pattern SHALL match at least one tracked
file. A test SHALL pin both, reading the patterns from the config the bot
parses. If it cannot read that list, the test SHALL fail, never pass.

#### Scenario: A doc the rulebook indexes falls out of reach

- **WHEN** a doc that `CLAUDE.md` links, or `core/rules.md` itself, sits at a
  path no configured pattern matches
- **THEN** the test fails, naming that doc

#### Scenario: A pattern that matches nothing

- **WHEN** a configured pattern matches no tracked file
- **THEN** the test fails, naming that pattern, since a pattern the bot
  resolves to nothing reads exactly like a bot with nothing to read

#### Scenario: A config the test cannot read

- **IF** `.coderabbit.yaml` is absent or does not parse, or carries no
  non-empty `filePatterns` list of non-blank strings
- **THEN** the test fails, saying which, rather than passing over an empty
  list

### Requirement: The local review passes the guidelines the PR bot reads

The prescribed invocation SHALL pass `--config` with `.coderabbit.yaml`,
`CLAUDE.md` and every tracked file that a pattern under the config's
`knowledge_base.code_guidelines.filePatterns` matches. It SHALL pass each file
once and leave out any the repository lacks, so the local review reads the
guidelines the PR bot reads. A pattern SHALL match as the bot matches it: a
`*` never crosses a `/`.

#### Scenario: The config names guideline files

- **WHEN** the review runs in a repository whose `.coderabbit.yaml` names
  `core/*.md`
- **THEN** the invocation passes `.coderabbit.yaml`, `CLAUDE.md` and each
  tracked markdown file directly under `core/`
- **AND** it passes no file under `core/skills/`

#### Scenario: A repository with no config

- **WHEN** the repository has no `.coderabbit.yaml`
- **THEN** the invocation passes `--config CLAUDE.md` alone

#### Scenario: A file two sources name

- **WHEN** a configured pattern matches `CLAUDE.md`, which the invocation
  already names
- **THEN** `CLAUDE.md` is passed once

## REMOVED Requirements

### Requirement: The local reviewer is aligned with the PR bot

**Reason**: It decides the invocation by reading `coderabbit review
--show-prompts`, which in CLI 0.7.0 replays the fix prompts of the last
review's findings, not the instructions the review was given. Its first and
third scenarios can therefore never be observed. The invocation it settled on
passes `CLAUDE.md` and never the files the config's `code_guidelines` name,
so the rules imported into `CLAUDE.md` go unread locally.

**Migration**: *The local review passes the guidelines the PR bot reads*
prescribes the invocation without that check, adding the files the config's
patterns match.

## MODIFIED Requirements

### Requirement: A justification survives only when it is a convention

Where a skipped Minor reflects a settled convention of this project, the
agent SHALL capture it as a rule in the rulebook's "Rules" list or in a doc
the rulebook indexes. `core/rules.md` §*The loop* decides which of the two,
because the repository's `.coderabbit.yaml` names both under
`knowledge_base.code_guidelines.filePatterns`, so the next review reads
either. A one-off SHALL NOT become a rule.

#### Scenario: A convention the bot does not know

- **WHEN** a Minor finding is skipped because the project has a settled
  convention the bot keeps re-raising
- **THEN** the convention is captured as a one-line rule meeting the
  rulebook's rule quality bar

#### Scenario: A one-off skip

- **WHEN** a Minor finding is skipped for a reason specific to this branch
- **THEN** the reason stays in the report and no rule is added
