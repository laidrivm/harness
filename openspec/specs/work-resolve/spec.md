# work-resolve Specification

## Purpose
The command that resolves the threads of the review bot's findings a session
fixed, so the bot's approval, which waits on every one of its threads being
resolved, does not wait on the user for a fix already on the pull request.

## Requirements

### Requirement: Resolve reads its arguments strictly

`bun bun/work.ts resolve` SHALL take `--pr <n>`, a positive integer,
`--head <sha>`, a full 40-hex commit id, and one or more `--comment <id>`,
each a positive integer. Any other option, a positional argument, a missing
value, a malformed value, a missing or repeated `--pr` or `--head`, or no
`--comment` at all SHALL print the usage and exit 2 before any git or `gh`
call; an id named twice counts once. Scenarios after this requirement's own
that leave `--head` out stand for a call whose `--head` names the pull
request's head.

#### Scenario: A short or missing head

- **WHEN** `resolve` runs with `--pr 7 --head 1a2b3c4 --comment 1`, or with
  `--pr 7 --comment 1`
- **THEN** it prints the usage and exits 2

#### Scenario: No comment named

- **WHEN** `resolve` runs with `--pr 7` alone
- **THEN** it prints the usage, exits 2, and makes no `gh` call

#### Scenario: A comment id with a tail

- **WHEN** `resolve` runs with `--pr 7 --comment 123x`
- **THEN** it prints the usage and exits 2

#### Scenario: Two pull requests named

- **WHEN** `resolve` runs with `--pr 7 --pr 8 --comment 1`
- **THEN** it prints the usage and exits 2, acting on neither

#### Scenario: Several comments

- **WHEN** `resolve` runs with `--pr 7 --comment 1 --comment 2`
- **THEN** both ids pass to the command

### Requirement: Resolve acts only on the current branch's open pull request

`resolve` SHALL refuse and exit 1, resolving nothing, when
`HARNESS_GITHUB_APP_MINT` is set, which would read as the App and resolve as
`gh`'s identity, when `HEAD` names no branch, when the branch's pull requests
on `origin` cannot be read, or when the pull request it names is not one of
the branch's open ones.

#### Scenario: Another branch's pull request

- **WHEN** `resolve --pr 8 --comment 1` runs on a branch whose open pull
  request is #7
- **THEN** it refuses naming #7, exits 1, and resolves nothing

#### Scenario: A branch open into two bases

- **WHEN** a branch has open pull requests #7 into `main` and #9 into
  `release`, and `resolve --pr 9 --comment 1` runs
- **THEN** it reads #9's threads, as for a branch with one

#### Scenario: A detached head

- **WHEN** `resolve` runs with `HEAD` detached
- **THEN** it refuses and exits 1 before reading any thread

### Requirement: Resolve acts only over the head it was given

Before reading any thread, `resolve` SHALL compare `--head` with the pull
request's head as GitHub reports it. When they differ it SHALL read the pull
request once more, a couple of seconds later, since GitHub's API can lag a
push; when they still differ, or that read fails, it SHALL refuse naming
both commits, exit 1 and resolve nothing.

#### Scenario: The head matches

- **WHEN** `resolve --pr 7 --head A --comment 1` runs and #7's head is `A`
- **THEN** it reads the pull request once and goes on to the threads

#### Scenario: The API catches up

- **WHEN** the first read of #7 reports head `B`, and the read a couple of
  seconds later reports `A`, the `--head` given
- **THEN** it goes on to the threads after those two reads

#### Scenario: Another head

- **WHEN** both reads of #7 report head `B` and `--head` names `A`
- **THEN** it refuses naming `A` and `B`, exits 1, and reads no thread

### Requirement: Resolve resolves only the bot's threads and refuses the whole call over one it cannot place

`resolve` SHALL read every review thread of the pull request and place each
named id as the first comment of one thread. When any id is the first comment
of no thread, or of a thread whose first comment's author login is not
exactly `coderabbitai`, it SHALL refuse, naming each such id, exit 1, and
resolve nothing.

#### Scenario: A thread the user opened

- **WHEN** one of two named ids opens a thread the user started
- **THEN** it refuses naming that id, exits 1, and neither thread is resolved

#### Scenario: A login that only starts like the bot's

- **WHEN** a named id opens a thread whose author login is `coderabbitai-x`
- **THEN** it refuses naming that id and resolves nothing

#### Scenario: A thread whose author is gone

- **WHEN** a named id opens a thread whose author GitHub reads as `null`, a
  deleted account
- **THEN** it refuses naming that id, as for any author but the bot

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
`resolveReviewThread`, printing one line per id it skips or attempts and none for an id after a failure. It SHALL exit 0 when every
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
