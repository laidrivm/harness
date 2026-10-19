# agent-autonomy delta

## ADDED Requirements

### Requirement: A pull request gets CodeRabbit's fixes for at most three rounds

`core/review-toolkit.md` SHALL cap `/coderabbit` on a pull request at three
rounds that apply fixes. A round is CodeRabbit's review of one commit — a
review whose author's login starts with `coderabbitai`, never one by the
App's `laidrivm-harness-agent[bot]` — and the run SHALL count the rounds from
the pull request's reviews. A run working the fourth round or
a later one, whose review carries a finding the run would apply, SHALL apply
none. It SHALL end on a `CODERABBIT gate: BLOCKED` line that names the cap,
and SHALL report each finding left.

#### Scenario: The third round still gets its fixes

- **WHEN** CodeRabbit's reviews on a pull request name three distinct commits,
  and the head commit's review carries a verified finding
- **THEN** the run applies it on the terms `local-review-loop` sets, as in
  any earlier round

#### Scenario: A fourth round with a finding to apply, attended

- **WHEN** an attended session runs `/coderabbit` on a pull request whose
  CodeRabbit reviews name four distinct commits, and the head commit's review carries a
  verified finding
- **THEN** it applies nothing, reports each finding left with its severity,
  file and line, and ends on `CODERABBIT gate: BLOCKED` naming the cap

#### Scenario: A fourth round with a finding to apply, unattended

- **WHEN** an unattended session reaches the same state
- **THEN** it applies nothing, hands the findings left on as one question on
  the card, posts nothing in the pull request, and ends on
  `CODERABBIT gate: BLOCKED` naming the cap

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
