# work-resolve — delta

## Purpose

The command that resolves the threads of the review bot's findings a session
fixed, so the bot's approval, which waits on every one of its threads being
resolved, does not wait on the user for a fix already on the pull request.

## ADDED Requirements

### Requirement: Resolve reads its arguments strictly

`bun bun/work.ts resolve` SHALL take `--pr <n>`, a positive integer, and one or
more `--comment <id>`, each a positive integer. Any other option, a positional
argument, a missing value, a value that is not wholly digits or no `--comment`
at all SHALL print the usage and exit 2 before any git or `gh` call.

#### Scenario: No comment named

- **WHEN** `resolve` runs with `--pr 7` alone
- **THEN** it prints the usage, exits 2, and makes no `gh` call

#### Scenario: A comment id with a tail

- **WHEN** `resolve` runs with `--pr 7 --comment 123x`
- **THEN** it prints the usage and exits 2

#### Scenario: Several comments

- **WHEN** `resolve` runs with `--pr 7 --comment 1 --comment 2`
- **THEN** both ids pass to the command

### Requirement: Resolve acts only on the current branch's open pull request

`resolve` SHALL refuse and exit 1, resolving nothing, when `HEAD` names no
branch, when the branch's pull requests on `origin` cannot be read, or when
the pull request it names is not the branch's open one.

#### Scenario: Another branch's pull request

- **WHEN** `resolve --pr 8 --comment 1` runs on a branch whose open pull
  request is #7
- **THEN** it refuses naming #7, exits 1, and resolves nothing

#### Scenario: A detached head

- **WHEN** `resolve` runs with `HEAD` detached
- **THEN** it refuses and exits 1 before reading any thread

### Requirement: Resolve resolves only the bot's threads and refuses the whole call over one it cannot place

`resolve` SHALL read every review thread of the pull request and place each
named id as the first comment of one thread. When any id is the first comment
of no thread, or of a thread whose first comment's author login does not
start with `coderabbitai`, it SHALL refuse, naming each such id, exit 1, and
resolve nothing.

#### Scenario: A thread the user opened

- **WHEN** one of two named ids opens a thread the user started
- **THEN** it refuses naming that id, exits 1, and neither thread is resolved

#### Scenario: A reply's id

- **WHEN** a named id is a reply inside one of the bot's threads, not its
  first comment
- **THEN** it refuses naming that id and resolves nothing

#### Scenario: Threads past the first page

- **WHEN** the pull request holds more than 100 review threads and a named id
  opens the 101st
- **THEN** the id is placed, as on the first page

### Requirement: Resolve skips a resolved thread and resolves the rest

Once every id is placed, `resolve` SHALL leave a thread already resolved
untouched, saying so, and resolve each other one through GraphQL's
`resolveReviewThread`, printing one line per id. It SHALL exit 0 when every
named thread ends resolved, and 1 naming the id when a resolve fails, the
threads resolved before it staying resolved, so a second run skips them.

#### Scenario: One resolved, one open

- **WHEN** `resolve --pr 7 --comment 1 --comment 2` runs and the bot's thread
  opened by 1 is resolved and the one opened by 2 is not
- **THEN** it makes one `resolveReviewThread` call, for 2's thread, prints a
  skip line for 1 and a resolved line for 2, and exits 0

#### Scenario: A resolve that fails

- **WHEN** the `resolveReviewThread` call for the second of three threads
  fails
- **THEN** the first stays resolved, the output names the second as failed,
  the third is not attempted, and the call exits 1

#### Scenario: An outdated thread

- **WHEN** the bot's thread a named id opens is outdated and unresolved
- **THEN** it is resolved like any other
