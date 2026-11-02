## ADDED Requirements

### Requirement: From the second round, CodeRabbit's Minors outside living docs go to a tail card

`core/review-toolkit.md` SHALL have `/coderabbit`, from a pull request's
second round on, apply only 🟠 Major and above and the 🟡 Minors under
`openspec/specs/**` or `core/**`, counting rounds as *A pull request gets
CodeRabbit's fixes for at most three rounds* does. Every other Minor SHALL be
deferred to the pull request's tail card and not applied. The first round
SHALL apply every verified finding, as before.

#### Scenario: A Minor in a change's artefact in the first round

- **WHEN** CodeRabbit's reviews on a pull request name one commit, and its
  review carries a verified 🟡 Minor in `openspec/changes/<name>/tasks.md`
- **THEN** the run applies it, as it applies any verified finding

#### Scenario: A Minor in a change's artefact or in code from the second round

- **WHEN** CodeRabbit's reviews name two or more distinct commits, and the
  head commit's review carries a 🟡 Minor under `openspec/changes/**`, or in
  a file outside both `openspec/specs/**` and `core/**`
- **THEN** the run applies nothing for it, writes it on the tail card with
  its path, line and what it asks, and lists it under Skipped as `deferred
  to <card>`, counted in the run's arithmetic

#### Scenario: A Minor in a living spec or in core from the second round

- **WHEN** the head commit's review in the second round or a later one
  carries a 🟡 Minor under `openspec/specs/**` or `core/**`, `core/skills/**`
  included
- **THEN** the run reads it and fixes it or skips it with its reason, as in
  the first round

#### Scenario: A Major in a change's artefact from the second round

- **WHEN** the head commit's review in the second round carries a 🟠 Major
  under `openspec/changes/**`
- **THEN** the run verifies it and applies it, or puts its dismissal to the
  user, as in the first round, since the deferral covers Minors alone

#### Scenario: A later round defers again

- **WHEN** a session with no memory of the earlier rounds defers a Minor in
  the third round, and the board already holds the pull request's tail card
- **THEN** it adds the finding to that card, found by its name, `CodeRabbit
  Minors deferred from #<N>`, and files no second card

#### Scenario: A fourth round holding only deferred Minors

- **WHEN** the fourth round's review carries only Minors the rule defers
- **THEN** the cap does not bite, since the run applies nothing, and the gate
  line reads as it would in an earlier round

#### Scenario: The thread of a deferred Minor

- **WHEN** a run defers a Minor whose thread is otherwise settled
- **THEN** the `resolve` command it names leaves that thread out, and the
  report says the thread waits on the user, who resolves it by hand

### Requirement: The coderabbit skill honours a project's deferral

`core/skills/coderabbit/SKILL.md` step 5 SHALL let a project's review policy
defer a finding to a card by its severity, path and round. The skill SHALL
list a deferred finding under Skipped as `deferred to <card>` and count it in
the arithmetic. Its rules *Severity budgets attention, not belief* and
*`below severity threshold` is not a reason on its own* SHALL read such a
deferral as the project's reason, never as a skip by label.

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
