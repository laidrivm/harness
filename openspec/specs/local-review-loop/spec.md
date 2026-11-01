# local-review-loop Specification

## Purpose

How the agent runs `/code-review high` over a branch before pushing, while no
pull request is open on it — how many passes it gets, what it fixes without
asking, what it may not dismiss without asking, when it stops, and where a
skipped finding's justification goes. It also pins the PR bot's config:
the docs it reads, its approval as the pull request's one approval, its
never pausing, and the instructions it is given for a change's artefacts. It exists because the bot's PR
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
a review with findings none of which names a file that diff changes did not
review that diff, and SHALL count, on any pass, as a review that does not
return, whose findings the agent reports and neither fixes, dismisses nor
counts toward the gate line. A finding
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

### Requirement: The review bot's approval is the pull request's one approval

The harness's `.coderabbit.yaml` SHALL set `reviews.auto_approvals.enabled`
to `true`, so the bot approves a pull request only once it has reviewed the
latest commit with every required thread resolved and no pre-merge check
failing, and that approval is the one the `main` ruleset requires. It SHALL
NOT set `reviews.auto_review.drafts` to `true`. A test SHALL pin both,
reading them from the config the bot parses, and SHALL fail when it cannot.

#### Scenario: The config leaves Automatic Approvals off

- **WHEN** `.coderabbit.yaml` sets `reviews.auto_approvals.enabled` to
  anything but `true`, or does not set it, or does not parse, or also sets
  the schema's legacy alias of that key, `reviews.request_changes_workflow`
- **THEN** the test fails, since no approval would come and every agent
  merge would wait on a bypass it does not have

#### Scenario: The config turns draft reviews on

- **WHEN** `.coderabbit.yaml` sets `reviews.auto_review.drafts` to `true`
- **THEN** the test fails, since a draft is pushed to while its work goes
  on and the bot reviews it once it is marked ready

### Requirement: The review bot does not pause on a long pull request

The harness's `.coderabbit.yaml` SHALL set
`reviews.auto_review.auto_pause_after_reviewed_commits` to `0`, since a
paused bot neither reviews nor approves a new head, and an agent identity
has no bypass to merge without that approval. A test SHALL pin it, reading
it from the config the bot parses.

#### Scenario: A pull request past the default pause

- **WHEN** `.coderabbit.yaml` leaves
  `reviews.auto_review.auto_pause_after_reviewed_commits` unset, whose
  default is five, or sets it to anything but `0`
- **THEN** the test fails

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

### Requirement: The thread of a fixed finding is resolved once the fix is on the pull request

The `coderabbit` skill SHALL write nothing to GitHub. A run SHALL name, as one
`bun bun/work.ts resolve` command (`bun node_modules/harness/bun/work.ts` in a
consumer), the first comment's id of each unresolved
thread of the bot's whose every finding — the first comment's and each
reply's carrying its own severity line — it fixed or found already fixed. The
session SHALL run it once each fix is on the pull request's head: after its
own `finish` pushed the run's fixes, or at once when the run applied none —
with `--head` naming the commit that push made, which the run names as the
placeholder `PUSHED_SHA` and the session fills from `git rev-parse HEAD`, or
the full id of the one the run verified against; when
`resolve` refuses over another head, it SHALL run `/coderabbit` again
instead. A session whose launcher pushes for it runs no `finish` and so no
`resolve`: it SHALL name the command in its final message instead. No
agent SHALL resolve the thread of a skipped or rejected finding, nor post
`@coderabbitai resolve` or `@coderabbitai approve`.

#### Scenario: Two fixes and a skip

- **WHEN** `/coderabbit` fixes the findings of inline comments 11 and 12 and
  skips the one of comment 13
- **THEN** its report names `bun bun/work.ts resolve --pr <n> --head
  PUSHED_SHA --comment 11 --comment 12`, and the session runs it after
  `finish` pushed the fix, the pushed commit filled in,
  leaving 13's thread open for the user

#### Scenario: One comment, two findings, one fixed

- **WHEN** an inline comment carries two findings and the run fixes one and
  skips the other
- **THEN** the comment's id is not named, and its thread stays open

#### Scenario: A fixed finding in a reply

- **WHEN** the bot posts a finding as a reply inside its own thread opened by
  comment 11, and the run fixes it and the first comment's finding
- **THEN** the command names 11, the thread's first comment, never the
  reply's id

#### Scenario: A skipped finding in a reply

- **WHEN** the run fixes the finding of a thread's first comment and skips a
  finding a later reply of the bot's carries in the same thread
- **THEN** the thread's id is not named, and the thread stays open

#### Scenario: Only findings already fixed

- **WHEN** the run applies no fix and verifies an unresolved thread's finding
  as already fixed on the head
- **THEN** the session runs the named `resolve` at once, with no `finish`
  before it

#### Scenario: The head moved before the resolve

- **WHEN** the run found a finding already fixed on commit `A`, and the
  pull request's head is `B` when the session runs `resolve --head A`
- **THEN** `resolve` refuses and resolves nothing, and the session runs
  `/coderabbit` again over `B`

#### Scenario: A fix outside the diff

- **WHEN** the only fixed finding came from a review body's `Outside diff
  range comments` section
- **THEN** no `resolve` command is named, since that finding has no thread

#### Scenario: An outdated thread of a finding already fixed

- **WHEN** a thread of the bot's is outdated and not resolved, and the run
  verifies its finding as already fixed on the head
- **THEN** the run counts it as already fixed, not as already resolved, and
  names its comment id in the `resolve` command

#### Scenario: A session whose launcher pushes

- **WHEN** a session whose launch form says its launcher pushes for it runs
  `/coderabbit` and fixes a finding
- **THEN** it runs no `resolve`, since it never runs `finish`, and names the
  command in its final message

#### Scenario: The fix is not pushed yet

- **WHEN** the run has applied its fixes and `finish` has not yet pushed them
- **THEN** the session does not run `resolve`, so the bot is never left with
  every thread resolved over a head that lacks the fix

### Requirement: The review bot reads a change's artefacts for contradictions

The harness's `.coderabbit.yaml` SHALL carry under `reviews.path_instructions`
an entry whose `path` is `openspec/changes/**`. Its `instructions` SHALL call
the file a working artefact headed for the archive, ask for contradictions
with a spec, the code or another artefact, and tell the bot not to flag
wording, duplication or style. A test SHALL pin the
entry, reading it from the config the bot parses.

#### Scenario: The entry is missing

- **WHEN** `.coderabbit.yaml` carries no `reviews.path_instructions` entry
  whose `path` is `openspec/changes/**`
- **THEN** the test fails, since the bot would review a change's artefacts
  for wording as strictly as code

#### Scenario: The instructions lose their scope

- **WHEN** the entry's `instructions` no longer ask for contradictions with a
  spec, the code or another artefact, or no longer tell the bot not to flag
  wording, duplication or style
- **THEN** the test fails, naming the phrase that is gone
