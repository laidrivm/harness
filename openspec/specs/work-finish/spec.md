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

### Requirement: CodeRabbit's state of a commit is read from its check runs

`finish` SHALL name CodeRabbit's state of a commit from every check run named
`CodeRabbit` that CodeRabbit's app posted on it, never from a comment's text:
`reviewing` while one is not completed, else `reviewed` when one succeeded
with a title not opening `Review skipped`, else `rate limited` when one is
neutral titled `Review rate limited`, else the conclusion and title of any
other, else `skipped` when one was skipped or so titled, else no run. A read
that fails SHALL name the state unread.

#### Scenario: A skipped run and a review in progress

- **WHEN** a commit holds CodeRabbit's skipped run and a later one in
  progress
- **THEN** its state is `reviewing`

#### Scenario: A skip and a rate limit

- **WHEN** a commit holds CodeRabbit's skipped run and a neutral one titled
  `Review rate limited`
- **THEN** its state is `rate limited`

#### Scenario: Only a skip

- **WHEN** a commit's only CodeRabbit run is skipped
- **THEN** its state is `skipped`

#### Scenario: A skip reported as a success

- **WHEN** a commit's only CodeRabbit run succeeded with the title
  `Review skipped`
- **THEN** its state is `skipped`

#### Scenario: A run another app posted

- **WHEN** a commit holds a check run named `CodeRabbit` that another app
  posted, and none of CodeRabbit's own
- **THEN** its state is no run

### Requirement: Finish lets CodeRabbit see the push before the ready switch

Where the checkout tracks `.coderabbit.yaml`, `finish` SHALL, after the push
or its skip and the draft's opening, read the card's question and, when none
waits, read CodeRabbit's state of `HEAD` until a read finds a completed run,
at most 12 reads an interval apart (11 intervals, 55 s at the default 5 s),
three failed reads in a row ending them early, then read the question again
before the ready switch. A wait that ends without one SHALL say so and go on
to the question read and the ready switch. Without that file, tracked at the
checkout's top, `finish` SHALL read no check run and wait for none.

#### Scenario: The draft's skip arrives

- **WHEN** `finish` pushes `HEAD` into draft #7 and CodeRabbit's skipped run
  appears on `HEAD` on the third read
- **THEN** `finish` reads the card's question and marks #7 ready only after
  that read

#### Scenario: No run within the wait

- **WHEN** no completed CodeRabbit run appears on `HEAD` in 12 reads
- **THEN** `finish` says that no run came, and still reads the question and
  marks the pull request ready

#### Scenario: Three failed reads before the switch

- **WHEN** the first three reads of `HEAD`'s check runs fail
- **THEN** `finish` reads no more, says that no run came with the last
  read's reason, and still reads the question and marks the pull request
  ready

#### Scenario: A repository without CodeRabbit's config

- **WHEN** the checkout does not track `.coderabbit.yaml`
- **THEN** `finish` reads no check run, waits for none, and ends on
  `finish: ready #7` as before

#### Scenario: Run from a subdirectory

- **WHEN** `finish` runs from a subdirectory of a checkout that tracks
  `.coderabbit.yaml` at its top
- **THEN** it reads the check runs and waits as it would from the top

#### Scenario: A branch pushed before its draft

- **WHEN** `origin` already holds `HEAD` and `finish` opens the draft, so
  no CodeRabbit run is on `HEAD` yet
- **THEN** `finish` reads, at most 12 times, until a completed CodeRabbit
  run appears, and with none says so; either way it goes on to the
  question read and the ready switch

#### Scenario: A question already waits

- **WHEN** the card's last question has no answer when the push and the
  draft's opening are done
- **THEN** the pull request stays a draft and `finish` reads no check run

### Requirement: Finish ends on CodeRabbit's state of the head

Where the checkout tracks `.coderabbit.yaml`, `finish` SHALL, after the
ready switch, read CodeRabbit's state of `HEAD` until it is neither
`skipped`, no run nor unread, at most 18 reads an interval apart (17
intervals, 85 s at the default), three failed reads in a row ending them
early, and end on one line naming the pull request ready, the state
the last read that answered gave, unread only when none answered, and
`HEAD`'s short hash. Every state SHALL exit 0, since the ready switch went
through; the line is the signal.

#### Scenario: The review starts

- **WHEN** after the ready switch `HEAD`'s state turns `reviewing`
- **THEN** `finish` stops reading and its last line names #7 ready and
  CodeRabbit reviewing `HEAD`, and it exits 0

#### Scenario: A rate limit

- **WHEN** after the ready switch `HEAD`'s state turns `rate limited`
- **THEN** `finish` asks for no review, its last line names the rate limit,
  and it exits 0

#### Scenario: Still skipped when the reads end

- **WHEN** `HEAD`'s state is `skipped` for all 18 reads
- **THEN** `finish` goes on to the review request

#### Scenario: A last read that fails after skips

- **WHEN** 17 reads give `skipped` and the 18th fails
- **THEN** the state is `skipped` and `finish` goes on to the review request

#### Scenario: Unread

- **WHEN** every read of `HEAD`'s check runs after the switch fails
- **THEN** `finish` stops after three reads, the last line says
  CodeRabbit's state is unread, no review is asked for, and `finish` exits 0

#### Scenario: One failed read among others

- **WHEN** the second read after the ready switch fails and the third reads
  `reviewing`
- **THEN** `finish` reads on past the failure and ends on reviewing

### Requirement: Finish asks once for the review of a skipped head

When the reads end on `skipped` and one more read right before the post
gives `skipped` too, `finish` SHALL post exactly `@coderabbitai review` as
the identity `gh` holds, unless the pull request holds a comment whose
trimmed body is that line or `@coderabbitai full review`, posted at or
after the start of `HEAD`'s first CodeRabbit run; at most one per call. A
failed comment read, or a failed read right before the post, SHALL post
nothing; the last line SHALL say which of these happened.

#### Scenario: A first request

- **WHEN** `HEAD`'s state stays `skipped` and the pull request holds no
  `@coderabbitai review` comment from the start of `HEAD`'s first
  CodeRabbit run on
- **THEN** `finish` posts one comment whose body is exactly
  `@coderabbitai review`, and its last line says it asked

#### Scenario: Already asked for this head

- **WHEN** `HEAD`'s state stays `skipped` and such a comment, or
  `@coderabbitai full review`, was posted when `HEAD`'s first CodeRabbit
  run started, or later
- **THEN** `finish` posts nothing and its last line says a review was
  already asked for

#### Scenario: An older request

- **WHEN** the pull request's only `@coderabbitai review` comment was posted
  before `HEAD`'s first CodeRabbit run started
- **THEN** `finish` posts one

#### Scenario: A rate limit by the read before the post

- **WHEN** the reads end on `skipped` and the read right before the post
  gives `rate limited`
- **THEN** `finish` posts nothing and its last line names the rate limit

#### Scenario: The read before the post fails

- **WHEN** the reads end on `skipped` and the read right before the post
  fails
- **THEN** `finish` posts nothing and its last line says the runs are
  unread

#### Scenario: The comments cannot be read

- **WHEN** the read of the pull request's comments fails
- **THEN** `finish` posts nothing and its last line says why

#### Scenario: The post fails

- **WHEN** `gh` refuses the comment
- **THEN** `finish` does not post again, its last line names `gh`'s exit,
  and it exits 0

### Requirement: Finish releases `Assign` after its comments read

With `--card`, after a comments read that succeeded and before the ready
switch, `finish` SHALL run the release that `task-board`'s *The work
commands release `Assign` when nothing waits* fixes, and print its line.
When the release put the user back, a question having arrived meanwhile,
`finish` SHALL leave the draft as it does when a question waits. When the
release's second comments read failed, `finish` SHALL leave the draft and
exit 1, as it does when its own comments read fails. With no `--card` it
SHALL release nothing.

#### Scenario: A push after the answer

- **WHEN** `finish --card` pushes, the card's `Assign` holds the user, and
  no question or pause notice waits on the card
- **THEN** it prints `assign: removed the user from <card>` beside its
  other lines, which are what they would have been without it

#### Scenario: A question arrives during the release

- **WHEN** the release's second read finds a question and puts the user back
- **THEN** `finish` leaves the pull request a draft
