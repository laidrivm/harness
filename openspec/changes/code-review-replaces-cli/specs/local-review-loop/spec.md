## RENAMED Requirements

- FROM: `### Requirement: The local review passes the guidelines the PR bot reads`
- TO: `### Requirement: The CLI review passes the guidelines the PR bot reads`

## MODIFIED Requirements

### Requirement: The CLI review passes the guidelines the PR bot reads

The prescribed invocation of `/coderabbit-local` SHALL pass `--config` with
`.coderabbit.yaml`, `CLAUDE.md` and every tracked file that a pattern under
the config's `knowledge_base.code_guidelines.filePatterns` matches. It SHALL
pass each file once and leave out any the repository lacks, so the CLI review
reads the guidelines the PR bot reads. A pattern SHALL match as the bot
matches it: a `*` never crosses a `/`.

#### Scenario: The config names guideline files

- **WHEN** the review runs in a repository whose `.coderabbit.yaml` names
  `core/*.md`
- **THEN** the invocation passes `.coderabbit.yaml`, `CLAUDE.md` and each
  tracked markdown file directly under `core/`
- **AND** it passes no file under `core/skills/`

#### Scenario: A repository with no config

- **WHEN** the repository has no `.coderabbit.yaml`
- **THEN** the invocation passes `CLAUDE.md` and no guideline file, adding
  `AGENTS.md` or `.cursorrules` once each where the repository has them

#### Scenario: A file two sources name

- **WHEN** a configured pattern matches `CLAUDE.md`, which the invocation
  already names
- **THEN** `CLAUDE.md` is passed once

## ADDED Requirements

### Requirement: The local review runs after triage and before the push

The agent SHALL invoke `/code-review high` against the branch after `/triage`
and before pushing, only while no pull request is open on the branch. A push
into an open pull request, draft or ready, SHALL get no local review, since
CodeRabbit reviews that head on the pull request, a draft's once it is marked
ready. The agent SHALL read the
pull request's state before the sequence starts, never infer it from what the
push carries, and SHALL treat a state it could not read as none open. A
documentation branch, as `pre-pr-runner` (*The runner names the steps the
branch requires from its diff*) classifies one, SHALL get one review pass
rather than the full loop. The review SHALL read the branch's diff against
the base the runner measured from, in the tree the branch is checked out in;
a review naming a file that diff does not change read another diff, and
SHALL count as a review that does not return. Since `/code-review` names no
severity, the agent SHALL grade each of its findings 🔵 Trivial, 🟡 Minor,
🟠 Major or 🔴 Critical while verifying it, dispose of it on that grade, and
name the grade beside the finding in its report.

#### Scenario: A code branch reaches the end of the sequence

- **WHEN** `/triage` has been run over the final diff of a code branch with
  no open pull request
- **THEN** the agent invokes `/code-review high` before pushing, over the
  diff against the base the runner measured from

#### Scenario: A push into an open pull request

- **WHEN** a pull request is open on the branch, draft or ready, and the
  agent runs the pre-PR sequence before pushing to it
- **THEN** the agent runs every step up to `/triage` and does not invoke
  `/code-review`
- **AND** its report says that CodeRabbit reviews the head on the pull
  request, where `/coderabbit` disposes of the findings

#### Scenario: A branch whose pull request was closed unmerged

- **WHEN** the branch's only pull request was closed without merging, and
  the agent pushes to the branch again
- **THEN** the agent invokes `/code-review high` before pushing, since no
  open pull request will review that head

#### Scenario: The pull request's state cannot be read

- **WHEN** the read of the branch's pull requests fails
- **THEN** the agent invokes `/code-review high` before pushing and says
  the state was unread, since a skipped review is the costlier mistake

#### Scenario: The review does not return

- **WHEN** `/code-review` ends without a review — a usage limit, an error,
  a refused call — or its review names a file the branch's diff does not
  change
- **THEN** the agent reports why
- **AND** pushes without the gate rather than blocking the branch

#### Scenario: A finding the review gives no severity

- **WHEN** `/code-review` reports a finding as a file, a line, a summary and
  a failure scenario, with no severity
- **THEN** the agent grades it on CodeRabbit's ladder while verifying it,
  and a dismissal it grades 🟠 Major or above goes to the user while one
  it grades 🟡 Minor or 🔵 Trivial is skipped with its reason
- **AND** the report names the grade beside the finding

#### Scenario: A documentation branch

- **WHEN** the runner classifies the branch as a documentation branch, and no
  pull request is open on it
- **THEN** the agent runs one review pass, not three

## REMOVED Requirements

### Requirement: The gate runs after triage and before the push

**Reason**: It names `/coderabbit-local` as the local review, and its
scenario *The CLI is unavailable* describes a reviewer the sequence no longer
runs. A `MODIFIED` block cannot drop a scenario, so *The local review runs
after triage and before the push* replaces it whole, its other scenarios kept
by name.

**Migration**: None for a session: the same conditions now hold for
`/code-review high`. A citation of the old name points at the new one.

### Requirement: Claude's review is measured beside the CLI before it may replace it

**Reason**: The measurement did its job. Over five pull requests
`/code-review` alone flagged 18 verified defects and the CLI alone 1, and the
user replaced the CLI with `/code-review` on 2026-10-27 (card *Decide the
reviewer rotation's step 2 from the first five measured PRs*, answer 1 а
without the SHA record).

**Migration**: A branch runs `/code-review high` as its local review under
*The local review runs after triage and before the push* and opens its pull request
with no `## Review measurement` section. The five bodies that carry one stay
as the record of the decision.
