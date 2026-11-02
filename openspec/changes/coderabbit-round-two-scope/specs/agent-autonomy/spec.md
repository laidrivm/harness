## ADDED Requirements

### Requirement: From the second round, CodeRabbit's Minors outside living docs go to a tail card

`core/review-toolkit.md` SHALL have `/coderabbit` defer to the pull
request's tail card, unapplied, each 🟡 Minor outside the living docs that a
review in the pull request's second round or a later one first posted. That
review's round is the position of the commit it names among the distinct
commits *A pull request gets CodeRabbit's fixes for at most three rounds*
counts, ordered by each commit's first CodeRabbit review. Every other finding
SHALL be disposed of as before, and that cap SHALL still decide whether the
run applies anything.

#### Scenario: A Minor in a change's artefact in the first round

- **WHEN** CodeRabbit's reviews name two distinct commits, and the first
  commit's review carries a 🟡 Minor in `openspec/changes/<name>/tasks.md`
  that the run judges correct and cheap
- **THEN** the run fixes it, as in the first round, although the second
  commit has been reviewed by the time the run starts

#### Scenario: A Minor in a change's artefact or in code from the second round

- **WHEN** the review of the second distinct commit, or a later one, carries
  a 🟡 Minor in a file outside the living docs, such as
  `openspec/changes/<name>/design.md` or `bun/x.ts`
- **THEN** the run applies nothing for it, writes it on the tail card with
  its path, line, severity and what it asks, and lists it under Skipped as `deferred
  to <card>`, counted in the run's arithmetic

#### Scenario: A Minor in the living docs from the second round

- **WHEN** a review in the second round or a later one carries a 🟡 Minor
  under `openspec/specs/**`, in a change's delta spec under
  `openspec/changes/<name>/specs/**`, in `CLAUDE.md`, or under `core/**`
- **THEN** the run reads it and fixes it or skips it with its reason, as in
  the first round

#### Scenario: A Major in a change's artefact from the second round

- **WHEN** a review in the second round carries a 🟠 Major under
  `openspec/changes/**`
- **THEN** the run verifies it and applies it, or puts its dismissal to the
  user, as in the first round, since the deferral covers Minors alone

#### Scenario: A later round defers again

- **WHEN** a session with no memory of the earlier rounds defers a Minor in
  the third round, and the board already holds the pull request's tail card
- **THEN** it adds the finding to that card, found by its name, `CodeRabbit
  Minors deferred from #<N>`, and files no second card

#### Scenario: A Minor deferred in an earlier round

- **WHEN** a later run reads the open thread of a Minor that the tail card
  already holds
- **THEN** it lists the finding under Skipped as `deferred to <card>` and
  does not write it on the card again

#### Scenario: The thread of a deferred Minor

- **WHEN** a run defers a Minor whose thread is otherwise settled
- **THEN** the `resolve` command it names leaves that thread out, and the
  report names the thread for the user to resolve by hand, attended or
  not, without waiting on it

#### Scenario: A first-round Minor posted again later

- **WHEN** a later full review posts again, on the same path and asking the
  same, a Minor a first-round review posted
- **THEN** both copies keep the first round, and the run disposes of them as
  one finding of that round

### Requirement: The coderabbit skill honours a project's deferral

`core/skills/coderabbit/SKILL.md` step 5 SHALL let any project's review
policy defer a finding to a card by its severity, path and round. The skill
SHALL list a deferred finding under Skipped as `deferred to <card>` and count
it in the arithmetic. Step 3 and the rule *Severity budgets attention, not
belief* SHALL read such a deferral as the project's reason, never as a skip
by label.

#### Scenario: A policy defers a Minor

- **WHEN** a project's review policy defers a 🟡 Minor by its path and round
- **THEN** the report lists it under Skipped as `deferred to <card>`, the
  arithmetic counts it, and the gate line reads `PASS` once every other
  finding is dispositioned

#### Scenario: No policy defers

- **WHEN** a project's review policy defers nothing
- **THEN** each 🟡 Minor is read and fixed or skipped with a reason of its
  own, and `below severity threshold` is still no reason

#### Scenario: A policy defers a Major

- **WHEN** a project's review policy would defer a 🟠 Major or above
- **THEN** the deferral is a dismissal and goes to the user, as step 5 puts
  every Major-or-above dismissal

## MODIFIED Requirements

### Requirement: A pull request gets CodeRabbit's fixes for at most three rounds

`core/review-toolkit.md` SHALL cap `/coderabbit` on a pull request at three
rounds that apply fixes. A round is CodeRabbit's review of one commit — a
review whose author's login starts with `coderabbitai`, never one by the
App's `laidrivm-harness-agent[bot]` — and the run SHALL count the rounds from
the pull request's reviews. A run working the fourth round or
a later one, whose review carries a finding the run would apply, SHALL apply
none. It SHALL report each finding left, name the cap in the report's line
before its gate line, and end on the skill's own `CODERABBIT gate: BLOCKED —
N findings, M undispositioned.` line, unchanged, since the `coderabbit`
skill fixes that line's form and the cap is no part of it.

#### Scenario: The third round still gets its fixes

- **WHEN** CodeRabbit's reviews on a pull request name three distinct commits,
  and the head commit's review carries a verified finding
- **THEN** the run applies it on the finding-disposal terms
  `local-review-loop` sets in *A verified finding is fixed without asking*
  and *Dismissing a Major or above is the user's call*, as in any earlier
  round, and not on the local review's base, changed-file check or grading,
  since CodeRabbit grades its own findings
- **AND** a 🟡 Minor that *From the second round, CodeRabbit's Minors outside
  living docs go to a tail card* defers is deferred, not applied, whatever
  those terms say of a correct Minor

#### Scenario: A fourth round with a finding to apply, attended

- **WHEN** an attended session runs `/coderabbit` on a pull request whose
  CodeRabbit reviews name four distinct commits, and the head commit's review
  carries a verified finding the run would apply
- **THEN** it applies nothing, reports each finding left with its severity,
  file and line, names the cap in the line before its gate line, and ends on
  `CODERABBIT gate: BLOCKED — N findings, M undispositioned.`

#### Scenario: A fourth round with a finding to apply, unattended

- **WHEN** an unattended session reaches the same state
- **THEN** it applies nothing, hands the findings left on as one question on
  the card, posts nothing in the pull request, names the cap in the line
  before its gate line, and ends on `CODERABBIT gate: BLOCKED — N findings,
  M undispositioned.`

#### Scenario: A fourth round with nothing to apply

- **WHEN** the fourth round's review carries only findings the run skips
  with a reason, as Trivial and Minor may be skipped
- **THEN** the cap does not bite, and the gate line reads as it would in any
  earlier round

#### Scenario: The rounds are counted from the pull request

- **WHEN** a session the orchestrator started runs `/coderabbit` with no
  memory of the earlier rounds
- **THEN** it counts the distinct commits that CodeRabbit's reviews on the pull
  request name, and reaches the same count as a session that ran every round
