# work-take Specification

## Purpose

The command a session takes a card with: it prints the card, its comments and
the change it points at into the session's context, from Notion and the tree,
and changes nothing anywhere.

## Requirements

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

### Requirement: Take prints the card as Notion holds it

Without `--after`, `take` SHALL print, in this order, the checkout's `HEAD`
commit, then the card's `Name`, `Status`, `Pointer`, `Labels` and `Assign`,
then the card's body as the markdown Notion renders for the page, unchanged,
Notion's own `<unknown>` tags for blocks it does not render included. When
Notion's answer marks that markdown truncated, or lists the ids of blocks it
left out, `take` SHALL say so after it.

#### Scenario: A card

- **WHEN** `take` runs on a card in `proposing` whose body holds a heading
  and a list
- **THEN** it prints the commit, the five properties with `Status` reading
  `proposing`, and the body's markdown as Notion returned it

#### Scenario: A truncated body

- **WHEN** Notion marks the page's markdown as truncated
- **THEN** `take` prints the markdown it was given and a line saying the body
  is truncated

#### Scenario: Blocks Notion left out

- **WHEN** Notion's answer lists the ids of two blocks it left out and does
  not mark the markdown truncated
- **THEN** `take` prints the markdown and a line saying two blocks are
  missing from it

### Requirement: Take prints every comment and whether a question waits

Without `--after`, `take` SHALL print every page-level comment of the card,
oldest first, each with its time, its author — the user, or the author's id —
and its text, and then one line saying whether a question waits on the user,
decided as `task-board`'s *An open question waits on its card, assigned to
the user* reads it with no integration id. It SHALL read every page of the
comments.

#### Scenario: A question with no answer

- **WHEN** no comment by the user follows the card's last comment opening
  with the question mark, though another author's may
- **THEN** `take` prints the comments and `question waiting: yes`

#### Scenario: An answered question

- **WHEN** the user's comment follows the card's last question
- **THEN** `take` prints the comments, the answer marked as the user's, and
  `question waiting: no`

#### Scenario: Comments over more than one page

- **WHEN** Notion returns the card's comments on two pages
- **THEN** `take` prints the comments of both

### Requirement: Take prints the change the card points at

When the card's `Pointer` is exactly `openspec/changes/<slug>/`, the slug
lower-case and not `archive`, `take` without `--after` SHALL print, for each of that change's
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

After the card's change, `take` without `--after` SHALL print the output of
`openspec list` in the checkout, unchanged.

#### Scenario: Open changes

- **WHEN** the checkout holds two open changes
- **THEN** `take` prints `openspec list`'s listing of both after the card's
  change, followed only by the line naming the last comment

### Requirement: Take writes nothing and fails closed

`take` SHALL write nothing — no Notion call but a read, no git ref, no ledger
record, no file — but the release of `Assign` that `task-board`'s *The work
commands release `Assign` when nothing waits* fixes. It SHALL read Notion
through the ask integration's settings. No settings, or a read of its own
that fails — Notion, git or `openspec`, the release's reads apart — SHALL
exit 1 with a line naming the step, and no
line `take` composes itself SHALL hold the token; the body and the comments
print as Notion holds them.

#### Scenario: No ask settings

- **WHEN** the machine has no ask settings
- **THEN** `take` prints that no ask integration is configured, exits 1, and
  calls nothing

#### Scenario: A page the integration cannot read

- **WHEN** Notion answers the card's read with 403
- **THEN** `take` prints the step and the status, exits 1, and prints no
  token

#### Scenario: Only reads

- **WHEN** `take` runs to its end on a card whose `Assign` does not hold the
  user, or whose question or pause notice waits
- **THEN** every call it made to Notion is a `GET`, and the ledger and the
  checkout are as they were

### Requirement: Take ends with the card's last comment

`take` SHALL end its output, after a run that read the comments and failed in
no later read, with one line `last comment: <id>`, the id of the newest of
the card's page-level comments whose id `--after` accepts, as Notion returns
it, or `last comment: none` when no comment of the card carries such an id.
With `--after`, the newest comment is the card's, not the newest printed.

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
- **THEN** `take` prints a line saying that comment is not on the card and
  every comment of the card, and the missing comment alone does not fail
  the run: it exits 0 unless the release's restore fails, which still exits 1

#### Scenario: The id in the other form

- **WHEN** the card's comment id is a UUID and `--after` gives the same id
  as 32 hex digits
- **THEN** `take` prints the comments after that comment

#### Scenario: The comment and the answer on different pages

- **WHEN** the comment `--after` names is on Notion's first page and the
  answer on its second
- **THEN** `take` prints the answer

#### Scenario: Only the reads it needs

- **WHEN** `take --after` runs to its end on a card whose `Assign` does not
  hold the user
- **THEN** every call it made to Notion is a `GET` of the page or its
  comments, no markdown read among them, neither git nor `openspec` is run,
  and the ledger and the checkout are as they were
