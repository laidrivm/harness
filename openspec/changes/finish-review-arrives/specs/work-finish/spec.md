# work-finish — delta

## ADDED Requirements

### Requirement: CodeRabbit's state of a commit is read from its check runs

`finish` SHALL name CodeRabbit's state of a commit from every check run named
`CodeRabbit` that CodeRabbit's app posted on it, never from a comment's text:
`reviewing` while one is not completed, else `reviewed` when one succeeded,
else `rate limited` when one is neutral titled `Review rate limited`, else
the conclusion and title of any other, else `skipped` when one was skipped,
else no run. A read that fails SHALL name the state unread.

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

#### Scenario: A run another app posted

- **WHEN** a commit holds a check run named `CodeRabbit` that another app
  posted, and none of CodeRabbit's own
- **THEN** its state is no run

### Requirement: Finish lets CodeRabbit see the push before the ready switch

Where the checkout tracks `.coderabbit.yaml`, `finish` SHALL, after the push
or its skip and the draft's opening, and before it reads the card's
question, read CodeRabbit's state of `HEAD` until it is neither no run nor
unread, starting no read after 60 s. A wait that ends so SHALL say no run
came and go on to the question read and the ready switch. Without that file,
tracked at the checkout's top, `finish` SHALL read no check run and wait for
none.

#### Scenario: The draft's skip arrives

- **WHEN** `finish` pushes `HEAD` into draft #7 and CodeRabbit's skipped run
  appears on `HEAD` on the third read
- **THEN** `finish` reads the card's question and marks #7 ready only after
  that read

#### Scenario: No run within the wait

- **WHEN** no CodeRabbit run appears on `HEAD` within 60 s
- **THEN** `finish` says that no run came, and still reads the question and
  marks the pull request ready

#### Scenario: A repository without CodeRabbit's config

- **WHEN** the checkout does not track `.coderabbit.yaml`
- **THEN** `finish` reads no check run, waits for none, and ends on
  `finish: ready #7` as before

#### Scenario: Run from a subdirectory

- **WHEN** `finish` runs from a subdirectory of a checkout that tracks
  `.coderabbit.yaml` at its top
- **THEN** it reads the check runs and waits as it would from the top

#### Scenario: A question waits

- **WHEN** the wait ends and the card's last question has no answer
- **THEN** the pull request stays a draft and nothing is read after the
  question

### Requirement: Finish ends on CodeRabbit's state of the head

Where the checkout tracks `.coderabbit.yaml`, `finish` SHALL, after the
ready switch, read CodeRabbit's state of `HEAD` until it is neither
`skipped`, no run nor unread, starting no read after 90 s, and end on one
line naming the pull request ready, the last read's state and `HEAD`'s short
hash. Every state SHALL exit 0, since the ready switch went through; the
line is the signal.

#### Scenario: The review starts

- **WHEN** after the ready switch `HEAD`'s state turns `reviewing`
- **THEN** `finish` stops reading and its last line names #7 ready and
  CodeRabbit reviewing `HEAD`, and it exits 0

#### Scenario: A rate limit

- **WHEN** after the ready switch `HEAD`'s state turns `rate limited`
- **THEN** `finish` asks for no review, its last line names the rate limit,
  and it exits 0

#### Scenario: Still skipped when the reads end

- **WHEN** `HEAD`'s state is `skipped` for the whole 90 s
- **THEN** `finish` goes on to the review request

#### Scenario: Unread

- **WHEN** the last read of `HEAD`'s check runs fails
- **THEN** the last line says CodeRabbit's state is unread, no review is
  asked for, and `finish` exits 0

#### Scenario: One failed read among others

- **WHEN** the second read after the ready switch fails and the third reads
  `reviewing`
- **THEN** `finish` reads on past the failure and ends on reviewing

### Requirement: Finish asks once for the review of a skipped head

When `HEAD`'s state is still `skipped` as the reads end, `finish` SHALL post
the comment `@coderabbitai review`, and nothing else, on the pull request
under the identity `gh` runs with, unless the pull request already holds a
comment of exactly that text posted after `HEAD`'s first CodeRabbit run,
and SHALL post at most one per call. A comment read that fails SHALL post
nothing. The last line SHALL say whether it asked, had already asked, could
not read the comments, or failed to post.

#### Scenario: A first request

- **WHEN** `HEAD`'s state stays `skipped` and the pull request holds no
  `@coderabbitai review` comment newer than `HEAD`'s first CodeRabbit run
- **THEN** `finish` posts one comment whose body is exactly
  `@coderabbitai review`, and its last line says it asked

#### Scenario: Already asked for this head

- **WHEN** `HEAD`'s state stays `skipped` and such a comment was posted after
  `HEAD`'s first CodeRabbit run
- **THEN** `finish` posts nothing and its last line says a review was
  already asked for

#### Scenario: An older request

- **WHEN** the pull request's only `@coderabbitai review` comment is older
  than `HEAD`'s first CodeRabbit run
- **THEN** `finish` posts one

#### Scenario: The comments cannot be read

- **WHEN** the read of the pull request's comments fails
- **THEN** `finish` posts nothing and its last line says why

#### Scenario: The post fails

- **WHEN** `gh` refuses the comment
- **THEN** `finish` does not post again, its last line names `gh`'s exit,
  and it exits 0
