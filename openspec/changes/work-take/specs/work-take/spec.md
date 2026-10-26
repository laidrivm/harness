# work-take

## Purpose

The command a session takes a card with: it prints the card, its comments and
the change it points at into the session's context, from Notion and the tree,
and changes nothing anywhere.

## ADDED Requirements

### Requirement: Take reads its arguments strictly

`bun bun/work.ts take` SHALL take `--card <id>` alone, required and a Notion
page id, 32 hex digits alone or in a UUID's form. Any other option, a
positional argument, a missing value or a malformed id SHALL print the usage
and exit 2 before any Notion, git or `openspec` call.

#### Scenario: No card

- **WHEN** `take` runs without `--card`
- **THEN** it prints the usage, exits 2, and calls nothing

#### Scenario: A malformed card id

- **WHEN** `take` runs with `--card` set to 31 hex digits
- **THEN** it prints the usage and exits 2

#### Scenario: An option it does not know

- **WHEN** `take` runs with `--card <id> --write`
- **THEN** it prints the usage and exits 2

### Requirement: Take prints the card as Notion holds it

`take` SHALL print, in this order, the checkout's `HEAD` commit, then the
card's `Name`, `Status`, `Pointer`, `Labels` and `Assign`, then the card's
body as the markdown Notion renders for the page, unchanged, Notion's own
`<unknown>` tags for blocks it does not render included. When Notion's answer
marks that markdown truncated, or lists the ids of blocks it left out, `take`
SHALL say so after it.

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

`take` SHALL print every page-level comment of the card, oldest first, each
with its time, its author — the user, or the author's id — and its text, and
then one line saying whether a question waits on the user, decided as the
ask command decides it. It SHALL read every page of the comments.

#### Scenario: A question with no answer

- **WHEN** the card's last comment opens with the question mark and the user
  wrote nothing after it
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
lower-case and not `archive`, `take` SHALL
print that change's `proposal.md`, `design.md`, `tasks.md` and every delta
spec from the checkout, each under its path, and the names of the
capabilities the deltas touch, never their live specs. Any other `Pointer`
SHALL print one line saying why no change is printed.

#### Scenario: A change in the checkout

- **WHEN** `Pointer` is `openspec/changes/demo/` and the checkout holds that
  directory with a delta under `specs/task-board/`
- **THEN** `take` prints the change's files and names `task-board`

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
- **THEN** `take` ends with `openspec list`'s listing of both

### Requirement: Take writes nothing and fails closed

`take` SHALL write nothing — no Notion call but a read, no git ref, no ledger
record, no file. It SHALL read Notion through the ask integration's settings.
No settings, or a read that fails — Notion, git or `openspec` — SHALL exit 1
with a line naming the step, and no line SHALL hold the token.

#### Scenario: No ask settings

- **WHEN** the machine has no ask settings
- **THEN** `take` prints that no ask integration is configured, exits 1, and
  calls nothing

#### Scenario: A page the integration cannot read

- **WHEN** Notion answers the card's read with 403
- **THEN** `take` prints the step and the status, exits 1, and prints no
  token

#### Scenario: Only reads

- **WHEN** `take` runs to its end
- **THEN** every call it made to Notion is a `GET`, and the ledger and the
  checkout are as they were
