# work-finish Specification

## Purpose

The command that ends an agent's work on a branch — the evidence check, the
push, the draft pull request and the switch to ready — and the refusals that
keep opening a pull request and marking it ready that command's own, so the
draft rule holds without anyone's attention.

## Requirements

### Requirement: Finish reads its arguments strictly

`bun bun/work.ts finish` SHALL take `--card <id>`, optional and a Notion page
id, and `--title <text>` with `--body-file <path>`, both or neither. Any other
option, a positional argument, a missing value or a malformed card id SHALL
print the usage and exit 2 before any git, `gh` or Notion call.

#### Scenario: A malformed card

- **WHEN** `finish` runs with `--card` set to 31 hex digits
- **THEN** it prints the usage, exits 2, and nothing is pushed or opened

#### Scenario: An option it does not know

- **WHEN** `finish` runs with `--force`
- **THEN** it prints the usage and exits 2

### Requirement: Finish changes nothing without the evidence for HEAD

Before any push, `finish` SHALL refuse and exit 1, changing nothing in git,
GitHub or Notion, when a tracked file differs from `HEAD`, when `HEAD` names
no branch or names `main`, or when the evidence the branch owes for `HEAD` is missing. Until the
required steps are derived from the diff, that evidence SHALL be the pre-PR
runner's passing run record of each of its steps for `HEAD` in this
checkout, as the goal check reads them.

#### Scenario: No run record for HEAD

- **WHEN** `finish` runs at commit `C` and the ledger holds no passing
  diff-budget record of `C` for this checkout
- **THEN** it names the missing record, exits 1, and pushes, opens and marks
  nothing

#### Scenario: An uncommitted edit

- **WHEN** a tracked file differs from `HEAD`
- **THEN** `finish` refuses before the push and exits 1

### Requirement: Finish pushes only while the pull request is a draft

`finish` SHALL push `HEAD` to the branch of the same name on `origin`, never
by force, only when no open pull request of that branch in `origin`'s
repository is ready; one against another repository, a fork's upstream, is
not read. An open
pull request that is not a draft SHALL be refused before the push, naming
`gh pr ready <n> --undo`. When `origin` already holds `HEAD` on that branch,
`finish` SHALL skip the push and go on. A push that fails SHALL exit 1 with
the pull request left as it was.

#### Scenario: A draft with a new commit

- **WHEN** the branch's pull request #7 is a draft and `HEAD` is a commit
  `origin` does not hold
- **THEN** `finish` pushes `HEAD`, then goes on to the ready switch

#### Scenario: Nothing to push

- **WHEN** `origin` already holds `HEAD` on the branch
- **THEN** `finish` runs no push and goes on to the ready switch

#### Scenario: A ready pull request

- **WHEN** the branch's pull request #7 is open and not a draft
- **THEN** `finish` names `gh pr ready 7 --undo`, exits 1, and pushes nothing

### Requirement: Finish opens a missing pull request as a draft

When the branch has no open pull request, `finish` SHALL require `--title`
and `--body-file`, refusing before the push without them, and after the push
SHALL open the pull request against `main`, named rather than left to `gh`,
as a draft, whatever
the card holds. The switch to ready is then the one CodeRabbit reviews.

#### Scenario: A first finish

- **WHEN** the branch has no open pull request and `finish` has a title and a
  body file
- **THEN** it pushes, unless `origin` already holds `HEAD`, opens the pull
  request as a draft with them, and goes on to the ready switch

#### Scenario: A first finish with no title

- **WHEN** the branch has no open pull request and `finish` has no title
- **THEN** it exits 1 before the push, naming `--title` and `--body-file`

### Requirement: Finish marks ready only when no question waits

After the push, or its skip, `finish` given `--card` SHALL read the card's
comments through the ask integration and mark the pull request ready only
when no question to the user waits there. A waiting question SHALL leave the
draft and exit 0, naming the card. No ask settings, a read Notion does not
answer, or a ready GitHub refuses SHALL leave the draft and exit 1. Without
`--card`, `finish` SHALL read no card, say so, and mark the pull request
ready; every refusal before the push still holds.

#### Scenario: No question on the card

- **WHEN** the card holds no question waiting on the user
- **THEN** `finish` marks the pull request ready and exits 0

#### Scenario: A question waits

- **WHEN** the card's last question has no answer from the user
- **THEN** the pull request stays a draft, and `finish` names the card and
  exits 0

#### Scenario: Notion does not answer

- **WHEN** the read of the card's comments fails
- **THEN** the pull request stays a draft and `finish` exits 1

#### Scenario: No ask settings

- **WHEN** `finish` has a card and the machine has no ask settings
- **THEN** the pull request stays a draft and `finish` exits 1

#### Scenario: No card: no question check

- **WHEN** `finish` runs without `--card` on a branch with no open pull
  request, with a title, a body file and the run records of `HEAD`
- **THEN** it pushes, opens the draft and marks it ready, reading nothing
  from Notion and printing that no card's question was read, and without
  the run records it refuses before the push as with a card

### Requirement: Opening and the ready switch are finish's own

In the harness's own sessions a hook SHALL refuse a hand-run `gh pr ready`
that does not carry `--undo`, and a hand-run `gh pr create`, naming
`bun bun/work.ts finish`; `gh pr ready --undo` SHALL pass. A command handed
to a shell or `eval` is not read: the hook holds a forgotten order, not an
intent to get round it (stage 2, question 23). The hook SHALL be
registered in the harness's own `.claude/settings.json` alone and SHALL NOT be
among the hooks the harness gives a consumer, until the roadmap's stage 11
ships the gate to consumers.

#### Scenario: A hand-run ready

- **WHEN** an agent runs `gh pr ready 7` in a harness session
- **THEN** the call is refused, naming `bun bun/work.ts finish`

#### Scenario: A hand-run undo

- **WHEN** an agent runs `gh pr ready 7 --undo`
- **THEN** the hook allows it

#### Scenario: A ready handed to a shell

- **WHEN** an agent runs `sh -c 'gh pr ready 7'`
- **THEN** the hook allows it, as the stated exception

#### Scenario: A hand-run create

- **WHEN** an agent runs `gh pr create --draft --title t --body-file b`
- **THEN** the call is refused, naming `bun bun/work.ts finish`

#### Scenario: A consumer's settings

- **WHEN** `sync` writes a consumer's `.claude/settings.json`
- **THEN** the ready guard is not among the hooks it writes
