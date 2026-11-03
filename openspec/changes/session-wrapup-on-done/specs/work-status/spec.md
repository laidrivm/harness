## ADDED Requirements

### Requirement: A written done names the wrap-up next

When `status --to done` writes a card that read another status and the
read-back is `done`, it SHALL print last, after the release's line and
whatever exit code that leaves, `next: run /session-wrapup unless it is
already running, then tell the user «можно /clear»; a subagent passes this
line to its caller instead`. Any other `--to`, a refusal, a failed write, a
read-back other than `done`, or a card already at `done` SHALL print no such
line.

#### Scenario: A card moved to done

- **WHEN** `origin/main` proves `done` for a card at `archiving`, `status
  --to done` writes it, and the release removes the user from `Assign`
- **THEN** `status` prints the move, then the release's line, then the
  `next:` line, and exits 0

#### Scenario: A move to another status

- **WHEN** `status --to applied` is written
- **THEN** no `next:` line is printed

#### Scenario: A refused done

- **WHEN** `status --to done` is refused for want of evidence
- **THEN** it prints the refusal alone, with no `next:` line

#### Scenario: Notion answers another status

- **WHEN** `status --to done` is written and Notion's answer reads `archiving`
- **THEN** no `next:` line is printed, and `status` exits 1

#### Scenario: A card already done

- **WHEN** the card reads `done` and `status --to done` writes it again
- **THEN** no `next:` line is printed, so a finished wrap-up is not started a
  second time

#### Scenario: A failed restore after done

- **WHEN** `status --to done` is written and the release's restore fails
- **THEN** the `next:` line is still printed last, and `status` exits 1

### Requirement: The harness allows the wrap-up the line names

The harness's `.claude/settings.json` SHALL allow `Skill(session-wrapup)`, and
the skill the `next:` line names SHALL be one Claude Code finds under
`.claude/skills/`, so the session starts it without a permission prompt.

#### Scenario: The skill the line names

- **WHEN** the `next:` line names `/session-wrapup`
- **THEN** `.claude/skills/session-wrapup/SKILL.md` exists with that `name:`,
  and the harness's settings allow `Skill(session-wrapup)`
