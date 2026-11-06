# work-draft

## Purpose

The command a session marks an open pull request draft with when it hands
follow-up on it over, so a ready pull request is never under rework, until
`work.ts finish` pushes the new head and readies it again.

## ADDED Requirements

### Requirement: Draft reads its arguments strictly

`bun bun/work.ts draft` SHALL take exactly one `--pr <n>`, a positive integer
with no leading zero. Any other option, a positional argument, a missing
value, a malformed value, or a missing or repeated `--pr` SHALL print the
usage and exit 2 before any `gh` call.

#### Scenario: No pull request named

- **WHEN** `draft` runs with no argument
- **THEN** it prints the usage, exits 2, and makes no `gh` call

#### Scenario: A malformed number

- **WHEN** `draft` runs with `--pr 07`, `--pr 7x` or `--pr 0`
- **THEN** it prints the usage, exits 2, and makes no `gh` call

#### Scenario: Two pull requests named

- **WHEN** `draft` runs with `--pr 7 --pr 8`
- **THEN** it prints the usage, exits 2, and drafts neither

### Requirement: Draft marks an open ready pull request draft

`draft --pr <n>` SHALL read pull request `<n>` of the repository `origin`
names. When it is open and not a draft, it SHALL mark it draft with `gh pr
ready <n> --undo -R <owner>/<repo>` and print `draft: #<n> marked draft, head
<sha>`; when it is open and already a draft, it SHALL make no `gh pr ready`
call and print `draft: #<n> already a draft, head <sha>`. `<sha>` is the
pull request's head commit, all 40 hex digits. Both exit 0.

#### Scenario: A ready pull request

- **WHEN** `draft --pr 7` runs and #7 is open and ready with head `<sha>`
- **THEN** it calls `gh pr ready 7 --undo -R <owner>/<repo>`, prints
  `draft: #7 marked draft, head <sha>`, and exits 0

#### Scenario: Already a draft

- **WHEN** `draft --pr 7` runs and #7 is an open draft
- **THEN** it makes no `gh pr ready` call, prints `draft: #7 already a
  draft, head <sha>`, and exits 0

### Requirement: Draft refuses what it cannot draft

`draft` SHALL exit 1 on one line opening `draft: refused —`, changing
nothing, when `origin` names no GitHub repository, when the pull request
cannot be read, or when it is merged or closed. When `gh pr ready --undo`
fails it SHALL exit 1 on a line saying #`<n>` is still ready.

#### Scenario: A merged pull request

- **WHEN** `draft --pr 7` runs and #7 is merged
- **THEN** it prints a refusal naming #7 as merged, makes no `gh pr ready`
  call, and exits 1

#### Scenario: An unread pull request

- **WHEN** `draft --pr 7` runs and the read of #7 fails
- **THEN** it prints a refusal naming the failed read, makes no `gh pr
  ready` call, and exits 1

#### Scenario: The undo fails

- **WHEN** `draft --pr 7` runs, #7 is open and ready, and `gh pr ready 7
  --undo` exits non-zero
- **THEN** it prints that #7 is still ready and exits 1

### Requirement: The session that hands follow-up over drafts first

`core/rules.md` SHALL state, in its Process sublist, that a session runs
`work.ts draft --pr <n>` before it hands follow-up on an open pull request
to a subagent, and `core/git-and-prs.md`'s draft rule SHALL name that
command in place of a hand-run `gh pr ready <n> --undo`.

#### Scenario: The rulebook names the command

- **WHEN** a session starts in a project whose `CLAUDE.md` imports
  `core/rules.md`
- **THEN** its Process sublist names `work.ts draft --pr` for follow-up
  handed over on an open pull request
