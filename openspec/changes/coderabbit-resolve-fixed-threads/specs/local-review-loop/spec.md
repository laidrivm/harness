# local-review-loop — delta

## ADDED Requirements

### Requirement: The thread of a fixed finding is resolved once the fix is on the pull request

The `coderabbit` skill SHALL write nothing to GitHub. A run that applied fixes
SHALL name, as one `bun bun/work.ts resolve` command, the id of each inline
comment whose every finding it fixed or found already fixed. The session
SHALL run it only after its own `finish` has pushed the fix. No agent SHALL resolve the thread of a skipped or
rejected finding, nor post `@coderabbitai resolve` or `@coderabbitai approve`.

#### Scenario: Two fixes and a skip

- **WHEN** `/coderabbit` fixes the findings of inline comments 11 and 12 and
  skips the one of comment 13
- **THEN** its report names `bun bun/work.ts resolve --pr <n> --comment 11
  --comment 12`, and the session runs it after `finish` pushed the fix,
  leaving 13's thread open for the user

#### Scenario: One comment, two findings, one fixed

- **WHEN** an inline comment carries two findings and the run fixes one and
  skips the other
- **THEN** the comment's id is not named, and its thread stays open

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
