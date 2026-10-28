# local-review-loop Specification

## Purpose

How the agent runs `/code-review high` over a branch before pushing, while no
pull request is open on it — how many passes it gets, what it fixes without
asking, what it may not dismiss without asking, when it stops, where a skipped
finding's justification goes, and which guidelines CodeRabbit's CLI reads when
a session runs `/coderabbit-local` by hand. It exists because the bot's PR
review arrives after the branch is shared, so every defect it would catch lands
as review churn on an open PR instead of being fixed while the branch is still
local and free to be wrong.

## Requirements

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
a review with findings none of which names a file that diff changes read
another diff, and SHALL count as a review that does not return. A finding
that names an unchanged file beside findings on changed ones — a caller the
change breaks — SHALL be kept and verified like any other. Since `/code-review` names no
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
  a refused call — or it reports findings and none names a file the
  branch's diff changes
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

### Requirement: A verified finding is fixed without asking

A finding that survives verification against the current code SHALL be applied
without pausing for approval, **whatever its severity**, overriding the skills'
"No fixes before approval" rule. The override is not scoped by severity,
because the cost it prices is the cost of being wrong about a fix, and that
cost — a `git checkout` on a branch nobody has pulled — does not vary with the
label on the finding. Every applied fix MUST appear in the final report.

Surviving verification is what the override is scoped by, and a 🟡 Minor or
🔵 Trivial the agent reads and judges not worth fixing has not survived it: the
judgement that a finding is taste, a convention the bot does not know, or
dearer than the defect is a verification outcome, not an exemption from one.
Such a finding is skipped with its reason under *Minor findings are reported
once, at the end*, and that call is the agent's alone.

#### Scenario: A verified Major finding

- **WHEN** a 🟠 Major finding is confirmed by reading the file at the cited
  path and line
- **THEN** the agent applies the smallest correct fix without asking
- **AND** the fix is listed in the final report

#### Scenario: A correct Minor finding

- **WHEN** a 🟡 Minor finding is read and judged correct, and its fix is small
  and self-contained
- **THEN** the agent applies it without asking, exactly as it would a Major

#### Scenario: A Major finding the bot got wrong

- **WHEN** verification shows the finding does not hold against the current
  code
- **THEN** the agent states concretely what the bot missed and puts the
  dismissal to the user rather than closing it

### Requirement: Dismissing a Major or above is the user's call

Rejecting a 🟠 Major or 🔴 Critical finding as wrong, or skipping it as not
worth fixing, SHALL be put to the user with what the bot missed, and the run's
gate line SHALL read `OPEN` until they settle it. A pending fix SHALL NOT hold
the gate; a pending dismissal always does. The asymmetry is deliberate: a fix
applied wrongly to an unpushed branch is reverted in one command, while a
finding dismissed wrongly reaches the merge.

🟡 Minor and 🔵 Trivial keep their existing treatment — the agent skips them on
its own reasoning, and the report carries the reason.

A 🟠 Major or above that no fix resolved and no dismissal was proposed for —
one surviving the third review under *The loop terminates* — is in neither
state, because nobody has decided it. The gate line SHALL read `BLOCKED` there,
naming what remains, and SHALL NOT read `OPEN`: `OPEN` means the user has
something to settle, and an undecided finding gives them nothing to settle yet.

#### Scenario: A Major the agent believes is wrong

- **WHEN** verification shows a 🟠 Major does not hold, and the agent has a
  concrete statement of what the bot missed
- **THEN** the report names it as a proposed dismissal, and the gate line reads
  `OPEN` with the dismissal counted, not the fixes

#### Scenario: Every finding fixed

- **WHEN** a run fixes every finding it verified and dismisses none above Minor
- **THEN** the gate line reads `PASS`, because no fix ever needed approval

#### Scenario: A skipped Minor

- **WHEN** a 🟡 Minor is skipped because it is taste, or a settled convention
  the bot does not know
- **THEN** the reason goes in the report and the user is not asked

#### Scenario: The user accepts a dismissal

- **WHEN** the user agrees with the agent's reasoning on a proposed dismissal
  and no other finding is pending
- **THEN** the dismissal is recorded as settled with its reason, and the gate
  line moves from `OPEN` to `PASS`

#### Scenario: The user disagrees with a dismissal

- **WHEN** the user rejects the agent's reasoning on a proposed dismissal
- **THEN** the finding is fixed, and the gate closes on the fix

#### Scenario: A Major survives the loop undecided

- **WHEN** a 🟠 Major is still reported after the third review, with no fix
  applied and no dismissal proposed for it
- **THEN** the gate line reads `BLOCKED` and names it, and the decision to push
  is the user's

### Requirement: Minor findings are reported once, at the end

🟡 Minor findings SHALL be collected across every pass and reported in a
single list when the loop ends, each marked fixed or skipped with a reason.
`below severity threshold` MUST NOT be given as a reason.

#### Scenario: Minor findings across two passes

- **WHEN** pass 1 raises two Minor findings and pass 2 raises one more
- **THEN** all three appear in one list at the end of the loop, not in three
  separate reports

#### Scenario: A skipped Minor

- **WHEN** a Minor finding is skipped
- **THEN** the report gives the reason — taste, a settled convention the bot
  does not know, or a fix costing more than the defect is worth

### Requirement: The loop terminates

The loop SHALL run at most three reviews with fix rounds between them, and
SHALL stop early when a review returns nothing above Minor. When 🟠 Major or
above survives the third review, the agent SHALL report what remains and stop
rather than start a fourth pass.

#### Scenario: The second review is clean

- **WHEN** the second review returns no finding above Minor
- **THEN** the loop ends without a third review

#### Scenario: Findings survive the third review

- **WHEN** a 🟠 Major finding is still reported after the third review
- **THEN** the agent reports it and stops, leaving the decision to push to
  the user

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

### Requirement: The review bot reads the rulebook and the docs it indexes

The harness's `.coderabbit.yaml` SHALL name patterns under
`knowledge_base.code_guidelines.filePatterns` that match `core/rules.md` and
every markdown file that it or `CLAUDE.md` links. `README.md` is excepted,
because it describes the package and holds no rule. Each pattern SHALL match
at least one tracked file. A test SHALL pin both, reading the patterns from
the config the bot parses. If it cannot read that list, the test SHALL fail,
never pass.

#### Scenario: A doc the rulebook indexes falls out of reach

- **WHEN** a markdown file that `CLAUDE.md` or `core/rules.md` links, other
  than `README.md`, or `core/rules.md` itself, sits at a path no configured
  pattern matches
- **THEN** the test fails, naming that file

#### Scenario: A pattern that matches nothing

- **WHEN** a configured pattern matches no tracked file
- **THEN** the test fails, naming that pattern, since a pattern the bot
  resolves to nothing reads exactly like a bot with nothing to read

#### Scenario: A config the test cannot read

- **IF** `.coderabbit.yaml` is absent or does not parse, or carries no
  non-empty `filePatterns` list of non-blank strings
- **THEN** the test fails, saying which, rather than passing over an empty
  list

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
