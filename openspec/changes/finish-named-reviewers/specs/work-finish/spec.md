# work-finish — delta

## ADDED Requirements

### Requirement: Finish waits only for the reviewers the project names

`finish` SHALL read, before the push, the list under `harness.reviewers` in
the `package.json` at the checkout's top: the check-run names of the
reviewers it waits for. With no such key, no such file, or an empty list, it
SHALL say no reviewer is named, read no check run, wait for none and ask for
no review. A file that does not parse, a value that is not a list of
strings, or a name other than `CodeRabbit` SHALL be refused before the push,
naming the value.

#### Scenario: A project naming no reviewer

- **WHEN** the checkout's `package.json` has no `harness.reviewers`, or has
  `[]`, and the checkout tracks `.coderabbit.yaml`
- **THEN** `finish` prints that no reviewer is named, reads no check run,
  waits for none, asks for no review, and ends on `finish: ready #7`

#### Scenario: A package file that is not JSON

- **WHEN** the checkout's `package.json` is not JSON
- **THEN** `finish` refuses before the push, naming the file

#### Scenario: A reviewer finish does not know

- **WHEN** `harness.reviewers` is `["CodeRabbit", "Copilot"]`
- **THEN** `finish` names `Copilot`, exits 1, and pushes, opens and marks
  nothing

#### Scenario: A value that is not a list

- **WHEN** `harness.reviewers` is `"CodeRabbit"`
- **THEN** `finish` refuses before the push, naming `harness.reviewers`

## MODIFIED Requirements

### Requirement: Finish lets CodeRabbit see the push before the ready switch

Where `harness.reviewers` names `CodeRabbit`, `finish` SHALL, after the push
or its skip and the draft's opening, read the card's question and, when none
waits, read CodeRabbit's state of `HEAD` until a read finds a completed run,
at most 12 reads an interval apart (11 intervals, 55 s at the default 5 s),
three failed reads in a row ending them early, then read the question again
before the ready switch. A wait that ends without one SHALL say so and go on
to the question read and the ready switch. Where it does not, `finish` SHALL
read no check run and wait for none.

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

- **WHEN** the checkout tracks no `.coderabbit.yaml` and its `package.json`
  has `"reviewers": ["CodeRabbit"]` under `"harness"`
- **THEN** `finish` waits for CodeRabbit's run before the ready switch and
  reads its state of `HEAD` after it, as it would with the file

#### Scenario: Run from a subdirectory

- **WHEN** `finish` runs from a subdirectory of a checkout whose top's
  `package.json` names `CodeRabbit` under `harness.reviewers`
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

Where `harness.reviewers` names `CodeRabbit`, `finish` SHALL, after the
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

#### Scenario: Still no run when the reads end

- **WHEN** `HEAD` holds no CodeRabbit run for all 18 reads
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

When the reads end on `skipped` or no run and one more read right before the
post gives either too, `finish` SHALL post exactly `@coderabbitai review` as
the identity `gh` holds, unless the pull request holds a comment whose
trimmed body is that line or `@coderabbitai full review`, posted at or
after the start of `HEAD`'s first CodeRabbit run or, with none, at or after
`HEAD`'s committer date; at most one per call. A failed comment read, or a
failed read right before the post, SHALL post nothing; the last line SHALL
say which of these happened.

#### Scenario: A first request

- **WHEN** `HEAD`'s state stays `skipped` and the pull request holds no
  `@coderabbitai review` comment from the start of `HEAD`'s first
  CodeRabbit run on
- **THEN** `finish` posts one comment whose body is exactly
  `@coderabbitai review`, and its last line says it asked

#### Scenario: A first request for a head with no run

- **WHEN** `HEAD` holds no CodeRabbit run through the reads and the read
  before the post, and the pull request holds no `@coderabbitai review`
  comment from `HEAD`'s committer date on
- **THEN** `finish` posts one comment whose body is exactly
  `@coderabbitai review`, and its last line says no CodeRabbit run came on
  `HEAD` after 18 reads and that it asked

#### Scenario: Already asked for this head

- **WHEN** `HEAD`'s state stays `skipped` and such a comment, or
  `@coderabbitai full review`, was posted when `HEAD`'s first CodeRabbit
  run started, or later
- **THEN** `finish` posts nothing and its last line says a review was
  already asked for

#### Scenario: Already asked for a head with no run

- **WHEN** `HEAD` holds no CodeRabbit run and such a comment was posted at
  or after `HEAD`'s committer date — by an earlier `finish` on this head, or
  for an earlier head while `HEAD` waited unpushed
- **THEN** `finish` posts nothing and its last line says a review was
  already asked for

#### Scenario: An older request

- **WHEN** the pull request's only `@coderabbitai review` comment was posted
  before `HEAD`'s first CodeRabbit run started, or, with none, before
  `HEAD`'s committer date
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
