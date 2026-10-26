# local-review-loop delta

## MODIFIED Requirements

### Requirement: The gate runs after triage and before the push

The agent SHALL invoke `/coderabbit-local` against the branch after `/triage`
and before pushing, only while no pull request is open on the branch. A push
into an open pull request, draft or ready, SHALL get no local review, since
CodeRabbit reviews that head on the pull request, a draft's once it is marked
ready. The agent SHALL read the
pull request's state before the sequence starts, never infer it from what the
push carries, and SHALL treat a state it could not read as none open. A branch of documentation, rules or config SHALL get one review
pass rather than the full loop.

#### Scenario: A code branch reaches the end of the sequence

- **WHEN** `/triage` has been run over the final diff of a code branch with
  no open pull request
- **THEN** the agent invokes `/coderabbit-local` before pushing

#### Scenario: A push into an open pull request

- **WHEN** a pull request is open on the branch, draft or ready, and the
  agent runs the pre-PR sequence before pushing to it
- **THEN** the agent runs every step up to `/triage` and does not invoke
  `/coderabbit-local`
- **AND** its report says that CodeRabbit reviews the head on the pull
  request, where `/coderabbit` disposes of the findings

#### Scenario: A branch whose pull request was closed unmerged

- **WHEN** the branch's only pull request was closed without merging, and
  the agent pushes to the branch again
- **THEN** the agent invokes `/coderabbit-local` before pushing, since no
  open pull request will review that head

#### Scenario: The pull request's state cannot be read

- **WHEN** the read of the branch's pull requests fails
- **THEN** the agent invokes `/coderabbit-local` before pushing and says
  the state was unread, since a skipped review is the costlier mistake

#### Scenario: The CLI is unavailable

- **WHEN** `coderabbit doctor` exits non-zero, or `coderabbit` is not on PATH
- **THEN** the agent reports which check failed and what fixes it
- **AND** pushes without the gate rather than blocking the branch
- **AND** its pull request carries no `Review measurement` section, since
  there was no first pass to measure beside

#### Scenario: A documentation branch

- **WHEN** the branch changes only documentation, rules or config
- **THEN** the agent runs one review pass, not three

## ADDED Requirements

### Requirement: Claude's review is measured beside the CLI before it may replace it

Each branch that invokes `/coderabbit-local` SHALL also run `/code-review
high` in a fresh subagent at the commit of the first CLI pass, and its pull
request's body SHALL list each defect either flagged, naming which. That run
SHALL be no gate; one returning no review leaves the pull request unmeasured.
Once CodeRabbit has reviewed the fifth measured pull request, a card with the
tally SHALL go to the user; the tenth SHALL end the measurement.

#### Scenario: A branch measured beside the CLI

- **WHEN** a branch with no open pull request, code or documentation, is
  due its `/coderabbit-local` and fewer than ten measured pull requests exist
- **THEN** the agent runs `/coderabbit-local` as before and `/code-review
  high` in a fresh subagent at the commit of the CLI's first pass, giving
  the subagent that target explicitly rather than relying on its working
  directory
- **AND** applies the verified findings of both under this capability's
  policy
- **AND** the pull request opens with a `Review measurement` section — a
  body line reading exactly `## Review measurement` — listing each verified
  defect with its file and line, what it was and which local reviewer
  flagged it, or the single line `none` when
  neither flagged one

#### Scenario: A pull request that only names the section

- **WHEN** a pull request's body mentions `Review measurement` but holds no
  line reading exactly `## Review measurement`
- **THEN** it is not counted as measured, though a body search for the
  phrase lists it, and closed and merged pull requests are searched alike

#### Scenario: A finding of Claude's review the agent would skip

- **WHEN** `/code-review` flags a finding the agent judges wrong or not worth
  fixing
- **THEN** the agent skips it with its reason in the report, and the gate
  line stays as `/coderabbit-local` set it

#### Scenario: Claude's review does not return

- **WHEN** the `/code-review` run fails or returns no review — a usage
  limit, an error, a subagent that ends without one, a review naming files
  the branch did not change
- **THEN** the branch goes on with `/coderabbit-local` alone, its pull
  request carries no `Review measurement` section, and the report names why
- **AND** that pull request is not counted as measured

#### Scenario: The fifth measured pull request

- **WHEN** a session has disposed of CodeRabbit's first review on the fifth
  pull request that carries a `Review measurement` section
- **THEN** it files an `idea` card on the Harness board naming the measured
  pull requests and, for each, the defects only the CLI flagged, only
  `/code-review` flagged, both flagged, and the CodeRabbit review on the pull
  request then raised and the agent applied

#### Scenario: The measurement ends

- **WHEN** ten pull requests carry a `Review measurement` section
- **THEN** a branch due its `/coderabbit-local` runs it alone, and its
  pull request carries no `Review measurement` section
