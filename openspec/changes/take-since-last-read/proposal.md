# take-since-last-read

## Why

`bun bun/work.ts take --card <id>` prints the whole card every time: the
body, every comment, the files of the change it points at and `openspec
list`. Measured on 2026-11-02, the first `take` of the `pre-push-commit-gates`
card is 54 284 bytes over 902 lines, and 43 359 bytes of that (80 %) are the
change's `proposal.md`, `design.md`, `tasks.md` and deltas, which a session
applying the change reads as files anyway and an explore or answer check does
not read at all. A session that posted a question and comes back for the
answer runs `take` again and reads all of it once more, though the only news
is one comment. Sessions already cut the output by hand — of about 20 `take`
calls in one session's transcripts, nearly every re-read piped it through
`grep -A4 "^2026-11-01T1[2-9].*user:"`, `head` or `tail` — and a time pattern
guessed that way misses an answer written in another hour.

Two ways out were ruled out in the card's explore. A `--since <time>`
cursor loses an answer: Notion rounds a comment's `created_time` down to the
minute, so an answer written in the minute of the last `take` reads as old. A
cursor `take` keeps per session would write a file, which the `work-take`
spec forbids, and a fresh subagent carries its parent's session id, so it
would be told there is nothing new on a card it never read.

## What Changes

- The first `take` prints each file of the card's change as its path and its
  number of lines, not its contents (user, 02.11, answer 1 a). The session
  reads what it needs from the checkout whose path `take` prints first. The
  `pre-push-commit-gates` card's first `take` drops from about 54 KB to
  about 11 KB.
- `take` ends with one line naming the id of the card's last comment, or
  saying it has none (user, 02.11, answer 2 a). With none, there is no id
  to pass: the re-read is a full `take` without `--after`.
- `take --card <id> --after <comment id>` prints the card's `Status` and
  `Assign`, the comments after that one, whether a question waits, and the
  line releasing `Assign` where `take` releases it today, then the last
  comment's id again. It reads no body, no change and no `openspec list`, and
  writes nothing `take` does not write today. When that comment is not among
  the card's — deleted, or another card's — it prints every comment and a line
  saying so (user, 02.11, answer 2 a).
- A re-read sees new comments only: an edit to the card's body or to an
  older comment is not reported, since answers to questions come as comments
  (user, 02.11, answer 3 a).
- `core/feature-workflow.md`, which tells a session resuming work to read
  the card's comments with `take`, says a re-read passes `--after` the id
  the last `take` printed. `README.md`'s row for `take` and `bun/work.ts`'s
  usage name the option.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-take`: *Take reads its arguments strictly* accepts `--after`; *Take
  prints the card as Notion holds it* and *Take prints every comment and
  whether a question waits* hold for a run without `--after`; *Take prints
  the change the card points at* prints paths and line counts, and it and
  *Take prints the open changes* hold without `--after`, the open changes no
  longer ending the output. Adds *Take ends with
  the card's last comment* and *A re-read prints only what came after a
  comment*.

## Impact

- Changed: `bun/work-take.ts`, `bun/work.ts` (the option and its usage),
  `bun/work-take.test.ts`, `bun/work-take-fail.test.ts`,
  `bun/work-take.fixture.ts` (comment ids), `core/feature-workflow.md`,
  `README.md`.
- Superseded: the goal of the archived
  `openspec/changes/archive/2026-10-27-work-take/design.md`, *one call puts a
  card's whole context in front of the session*. One call now puts the card
  and the places its change lies in front of the session; the archive is not
  edited.
- A session that relied on reading the change's text in `take`'s output
  reads the files instead. No code calls `take`; only sessions do.
- No new Notion call: `--after` makes the two reads `take` already makes,
  the page and its comments, and the release's own.
