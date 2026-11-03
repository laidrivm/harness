## ADDED Requirements

### Requirement: A written done names the wrap-up next

After a `Status` write whose read-back is `done`, `status` SHALL print, as its
last line and after the release's line, `next: run /session-wrapup unless it
is already running, then tell the user «можно /clear»`, whatever exit code
the release leaves. A refusal, a failed write, a read-back other than `done`,
and a write of any other status SHALL print no such line. The harness's
`.claude/settings.json` SHALL allow `Skill(session-wrapup)`, so the session
starts it without a prompt.

#### Scenario: A card moved to done

- **WHEN** `origin/main` proves `done` for the card and `status --to done`
  writes it, and the release removes the user from `Assign`
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

#### Scenario: A failed restore after done

- **WHEN** `status --to done` is written and the release's restore fails
- **THEN** the `next:` line is still printed last, and `status` exits 1

#### Scenario: The skill the line names

- **WHEN** the line names `/session-wrapup`
- **THEN** a skill of that name exists in `core/skills/`, and the harness's
  settings allow `Skill(session-wrapup)`
