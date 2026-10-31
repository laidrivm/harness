# local-review-loop — delta

## ADDED Requirements

### Requirement: The thread of a fixed finding is resolved once the fix is on the pull request

The `coderabbit` skill SHALL write nothing to GitHub. A run SHALL name, as one
`bun bun/work.ts resolve` command, the first comment's id of each unresolved
thread of the bot's whose every finding — the first comment's and each
reply's carrying its own severity line — it fixed or found already fixed. The
session SHALL run it once each fix is on the pull request's head: after its
own `finish` pushed the run's fixes, or at once when the run applied none. No
agent SHALL resolve the thread of a skipped or rejected finding, nor post
`@coderabbitai resolve` or `@coderabbitai approve`.

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
