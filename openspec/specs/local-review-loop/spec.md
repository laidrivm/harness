# local-review-loop Specification

## Purpose

How the agent runs CodeRabbit's local CLI over a branch before pushing — how
many passes it gets, what it fixes without asking, what it may not dismiss
without asking, when it stops, and where a skipped finding's justification
goes. It exists because the bot's PR review
arrives after the branch is shared, so every defect it would catch lands as
review churn on an open PR instead of being fixed while the branch is still
local and free to be wrong.

## Requirements
### Requirement: The gate runs after triage and before the push

The agent SHALL invoke `/coderabbit-local` against the branch after `/triage`
and before pushing. A branch of documentation, rules or config SHALL get one
review pass rather than the full loop.

#### Scenario: A code branch reaches the end of the sequence

- **WHEN** `/triage` has been run over the final diff of a code branch
- **THEN** the agent invokes `/coderabbit-local` before pushing

#### Scenario: The CLI is unavailable

- **WHEN** `coderabbit doctor` exits non-zero, or `coderabbit` is not on PATH
- **THEN** the agent reports which check failed and what fixes it
- **AND** pushes without the gate rather than blocking the branch

#### Scenario: A documentation branch

- **WHEN** the branch changes only documentation, rules or config
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

### Requirement: The local reviewer is aligned with the PR bot

Before the gate is written into `CLAUDE.md`, it SHALL be established whether
`coderabbit` reads the repository's `.coderabbit.yaml` unprompted. Where it
does not,
the prescribed invocation MUST pass the config explicitly with
`--config .coderabbit.yaml CLAUDE.md`, so the local review applies the same
`path_instructions` and `code_guidelines` as the PR bot.

#### Scenario: The saved prompts carry this repo's instructions

- **WHEN** `coderabbit review --show-prompts` is run after one local review
- **AND** the output contains the `path_instructions` from `.coderabbit.yaml`
- **AND** it names `**/CLAUDE.md` under `code_guidelines`
- **THEN** the gate prescribes a plain `coderabbit review`

#### Scenario: The saved prompts do not carry them

- **WHEN** that output is missing either source
- **THEN** the gate prescribes `coderabbit review --agent --config .coderabbit.yaml CLAUDE.md`

#### Scenario: The question is unanswered

- **WHEN** neither check has been run
- **THEN** no rule prescribing the gate is written

### Requirement: A justification survives only when it is a convention

Where a skipped Minor reflects a settled convention of this project, the
agent SHALL capture it as a rule in the `CLAUDE.md` "Rules" list, which
`.coderabbit.yaml` already names under
`knowledge_base.code_guidelines.filePatterns` so the next review reads it. A
one-off SHALL NOT become a rule.

#### Scenario: A convention the bot does not know

- **WHEN** a Minor finding is skipped because the project has a settled
  convention the bot keeps re-raising
- **THEN** the convention is captured as a one-line rule meeting the
  `CLAUDE.md` rule quality bar

#### Scenario: A one-off skip

- **WHEN** a Minor finding is skipped for a reason specific to this branch
- **THEN** the reason stays in the report and no rule is added
