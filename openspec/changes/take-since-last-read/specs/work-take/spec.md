## MODIFIED Requirements

### Requirement: Take reads its arguments strictly

`bun bun/work.ts take` SHALL take `--card <id>`, required and a Notion page
id, 32 hex digits alone or in a UUID's form, and `--after <comment id>`,
optional and a Notion id in the same forms. Any other option, a positional
argument, a missing value or a malformed id SHALL print the usage and exit 2
before any Notion, git or `openspec` call.

#### Scenario: No card

- **WHEN** `take` runs without `--card`
- **THEN** it prints the usage, exits 2, and calls nothing

#### Scenario: A malformed card id

- **WHEN** `take` runs with `--card` set to 31 hex digits
- **THEN** it prints the usage and exits 2

#### Scenario: An option it does not know

- **WHEN** `take` runs with `--card <id> --write`
- **THEN** it prints the usage and exits 2

#### Scenario: A malformed comment id

- **WHEN** `take` runs with `--card <id> --after` set to a UUID with one
  digit too many, or with `--after` and no value
- **THEN** it prints the usage, exits 2, and calls nothing

### Requirement: Take prints the change the card points at

When the card's `Pointer` is exactly `openspec/changes/<slug>/`, the slug
lower-case and not `archive`, `take` SHALL print, for each of that change's
`proposal.md`, `design.md` and `tasks.md` the checkout holds, skipping one it
lacks, and for every delta spec, one line holding the file's path from the
checkout's root and its number of lines, never its contents, and the names
of the capabilities the deltas touch, never their live specs. Any other
`Pointer` SHALL print one line saying why no change is printed.

#### Scenario: A change in the checkout

- **WHEN** `Pointer` is `openspec/changes/demo/` and the checkout holds that
  directory with a `design.md` of 204 lines and a delta under
  `specs/task-board/`
- **THEN** `take` prints `openspec/changes/demo/design.md` with 204 lines, a
  line for the delta's path, no line of either file's text, and names
  `task-board`

#### Scenario: A last line with no newline

- **WHEN** the change's `tasks.md` holds three lines and the third ends
  without a newline
- **THEN** `take` prints `tasks.md`'s path with 3 lines

#### Scenario: A change the checkout lacks

- **WHEN** `Pointer` is `openspec/changes/demo/` and the checkout holds no
  such directory
- **THEN** `take` prints one line saying `demo` is not in this checkout at
  its `HEAD`, and goes on

#### Scenario: A pointer to another repository

- **WHEN** `Pointer` is `mellon: openspec/changes/demo/`
- **THEN** `take` prints one line saying the pointer names no change of this
  checkout, and reads no file

#### Scenario: No pointer

- **WHEN** `Pointer` is empty
- **THEN** `take` prints one line saying the card points at no change

### Requirement: Take prints the open changes

After the card's change, `take` SHALL print the output of `openspec list` in
the checkout, unchanged.

#### Scenario: Open changes

- **WHEN** the checkout holds two open changes
- **THEN** `take` prints `openspec list`'s listing of both after the card's
  change, followed only by the line naming the last comment

## ADDED Requirements

### Requirement: Take ends with the card's last comment

`take` SHALL end its output, after a run that read the comments and failed in
no later read, with one line `last comment: <id>`, the id of the newest of
the card's page-level comments as Notion returns it, or `last comment: none`
when the card has none. With `--after`, the newest comment is the card's, not
the newest printed.

#### Scenario: Comments on the card

- **WHEN** `take` runs on a card with three comments
- **THEN** its last line is `last comment: ` followed by the third comment's
  id

#### Scenario: Two comments in one minute

- **WHEN** the card's last two comments carry the same `created_time`
- **THEN** the line names the one Notion returned last

#### Scenario: No comments

- **WHEN** the card has no comment
- **THEN** its last line is `last comment: none`

### Requirement: A re-read prints only what came after a comment

With `--after <comment id>`, `take` SHALL print, in place of everything
else it prints, the card's `Status` and `Assign`, the comments that follow
that one, oldest first and printed as the other comments are, whether a
question waits over all the card's comments, the release of `Assign`, and
the last comment line. It SHALL read no body, run neither git nor
`openspec`, and report no edit to the body or to an older comment.

#### Scenario: An answer since the last read

- **WHEN** `take --after` names the card's question and the user's answer
  follows it
- **THEN** `take` prints `Status`, `Assign`, the answer alone,
  `question waiting: no`, and the answer's id as the last comment

#### Scenario: Nothing new

- **WHEN** `take --after` names the card's last comment
- **THEN** `take` prints a line saying no comment follows it, the question
  line, and the same id as the last comment

#### Scenario: A comment no longer on the card

- **WHEN** `take --after` names an id that none of the card's comments
  carries
- **THEN** `take` prints a line saying that comment is not on the card,
  every comment of the card, and exits 0

#### Scenario: The id in the other form

- **WHEN** the card's comment id is a UUID and `--after` gives the same id
  as 32 hex digits
- **THEN** `take` prints the comments after that comment

#### Scenario: Comments over more than one page

- **WHEN** the comment `--after` names is on Notion's first page and the
  answer on its second
- **THEN** `take` prints the answer

#### Scenario: Only the reads it needs

- **WHEN** `take --after` runs to its end on a card whose `Assign` does not
  hold the user
- **THEN** every call it made to Notion is a `GET` of the page or its
  comments, no markdown read among them, neither git nor `openspec` is run,
  and the ledger and the checkout are as they were
