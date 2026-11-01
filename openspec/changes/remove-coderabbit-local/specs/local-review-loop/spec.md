# local-review-loop — delta

## MODIFIED Requirements

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
a review with findings none of which names a file that diff changes did not
review that diff, and SHALL count, on any pass, as a review that does not
return. A finding
that names an unchanged file beside findings on changed ones — a caller the
change breaks — SHALL be kept and verified like any other. Since `/code-review` names no
severity, the agent SHALL grade each of its findings 🔵 Trivial, 🟡 Minor,
🟠 Major or 🔴 Critical while verifying it, dispose of it on that grade, and
name the grade beside the finding in its report. Since `/code-review` prints
no gate line either, the agent SHALL end the loop on a `CODE-REVIEW gate:`
line it writes itself, reading `PASS`, `OPEN` or `BLOCKED` as *Dismissing a
Major or above is the user's call* sets, whenever a pass of the loop returned
a review. Where findings in more than one of those states remain, `BLOCKED`
SHALL win over `OPEN` and `OPEN` over `PASS`, and the line SHALL name every
finding behind it. It SHALL write none only when no pass returned one. A pass that does
not return after one that did ends the loop, and the line reads on what the
passes that returned left.

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
  branch's diff changes, on the loop's first pass
- **THEN** the agent reports why and writes no `CODE-REVIEW gate:` line
- **AND** pushes without the gate rather than blocking the branch

#### Scenario: The session writes the gate line

- **WHEN** a pass of the loop returned a review over the branch's diff, and
  the loop ends
- **THEN** the agent ends it on a `CODE-REVIEW gate: PASS`, `OPEN` or
  `BLOCKED` line it writes itself, since the built-in skill prints none

#### Scenario: A later pass does not return

- **WHEN** the first pass proposed dismissing a 🟠 Major, and the second
  pass ends without a review
- **THEN** the loop ends, and the gate line the agent writes reads `OPEN`
  over that dismissal, since a pending dismissal always holds the gate

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

### Requirement: Dismissing a Major or above is the user's call

Rejecting a 🟠 Major or 🔴 Critical finding as wrong, or skipping it as not
worth fixing, SHALL be put to the user with what the review missed, and the
run's gate line SHALL read `OPEN` until they settle it. A pending fix SHALL
NOT hold the gate; a pending dismissal always does. The asymmetry is
deliberate: a fix applied wrongly to an unpushed branch is reverted in one
command, while a finding dismissed wrongly reaches the merge.

🟡 Minor and 🔵 Trivial keep their existing treatment — the agent skips them on
its own reasoning, and the report carries the reason.

A 🟠 Major or above that no fix resolved and no dismissal was proposed for —
one surviving the third review under *The loop terminates* — is in neither
state, because nobody has decided it. The gate line SHALL read `BLOCKED` there,
naming what remains, and SHALL NOT read `OPEN`: `OPEN` means the user has
something to settle, and an undecided finding gives them nothing to settle yet.

#### Scenario: A Major the agent believes is wrong

- **WHEN** verification shows a 🟠 Major does not hold, and the agent has a
  concrete statement of what the review missed
- **THEN** the report names it as a proposed dismissal, and the gate line reads
  `OPEN` with the dismissal counted, not the fixes

#### Scenario: Every finding fixed

- **WHEN** a run fixes every finding it verified and dismisses none above Minor
- **THEN** the gate line reads `PASS`, because no fix ever needed approval

#### Scenario: A skipped Minor

- **WHEN** a 🟡 Minor is skipped because it is taste, or a settled convention
  the reviewer does not know
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
- **THEN** the report gives the reason — taste, a settled convention the
  reviewer does not know, or a fix costing more than the defect is worth

### Requirement: A verified finding is fixed without asking

A finding that survives verification against the current code SHALL be applied
without pausing for approval, **whatever its severity**, overriding the skills'
"No fixes before approval" rule. The override is not scoped by severity,
because the cost it prices is the cost of being wrong about a fix, and that
cost — a `git checkout` on a branch nobody has pulled — does not vary with the
label on the finding. Every applied fix MUST appear in the final report.

Surviving verification is what the override is scoped by, and a 🟡 Minor or
🔵 Trivial the agent reads and judges not worth fixing has not survived it: the
judgement that a finding is taste, a convention the reviewer does not know,
or dearer than the defect is a verification outcome, not an exemption from
one. Such a finding is skipped with its reason under *Minor findings are
reported once, at the end*, and that call is the agent's alone.

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
- **THEN** the agent states concretely what the review missed and puts the
  dismissal to the user rather than closing it

## ADDED Requirements

### Requirement: A skipped convention becomes a rule, a one-off does not

Where a skipped Minor reflects a settled convention of this project, the
agent SHALL capture it as a rule in the rulebook's "Rules" list or in a doc
the rulebook indexes. `core/rules.md` §*The loop* decides which of the two,
because the pattern the repository's `.coderabbit.yaml` names under
`knowledge_base.code_guidelines.filePatterns`, `core/*.md`, matches
`core/rules.md` and every doc beside it, so CodeRabbit's review on the pull
request reads either. `/code-review` reads `CLAUDE.md` and
`core/rules.md`, not the docs the rulebook indexes, so a rule kept in one of
those docs is read back on the pull request rather than by the local review.
A one-off SHALL NOT become a rule.

#### Scenario: A convention the reviewer does not know

- **WHEN** a Minor finding is skipped because the project has a settled
  convention the reviewer keeps re-raising
- **THEN** the convention is captured as a one-line rule meeting the
  rulebook's rule quality bar

#### Scenario: A one-off skip

- **WHEN** a Minor finding is skipped for a reason specific to this branch
- **THEN** the reason stays in the report and no rule is added

## REMOVED Requirements

### Requirement: A justification survives only when it is a convention

**Reason**: It says the next review reads the docs the rulebook indexes,
which `/code-review` does not, and its scenario *A convention the bot does
not know* names the PR bot (card answer 2 а). *A skipped convention becomes a
rule, a one-off does not* replaces it whole, its scenario renamed *A
convention the reviewer does not know*.

**Migration**: None; no test cites the renamed scenario.

### Requirement: The CLI review passes the guidelines the PR bot reads

**Reason**: Its only subject is the invocation of `/coderabbit-local`, which
this change deletes (card *Clean local-review-loop and agent-autonomy of what
the CLI-era text still says about the local review*, answer 1, 2026-10-31).
No session runs the CodeRabbit CLI afterwards, and no test cites its
scenarios.

**Migration**: None. The local review is `/code-review high`, whose reading
of the rulebook *A skipped convention becomes a rule, a one-off does not*
states; CodeRabbit on the pull request reads the guidelines through
`.coderabbit.yaml`, as *The review bot reads the rulebook and the docs it
indexes* pins.
