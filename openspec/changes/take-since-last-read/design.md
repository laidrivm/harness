# take-since-last-read — design

## Context

`bun/work-take.ts` builds `take`'s output in one function: the checkout,
the page's properties, the markdown body, the comments through
`discussion()` and `oldest()` from `bun/notion-bot.ts`, the release through
`cleared()`, the change through `change()`, and `openspec list`. `bun/work.ts`
parses `--card` with a strict `parseArgs` and checks it against `ID`. The
explore's measurements and the rejected options are on the card and in the
proposal.

## Goals / Non-Goals

**Goals:** the first `take` puts the card and the places its change lies in
front of the session — replacing the archived *one call puts a card's whole
context in front of the session* (user, 02.11, answer 1 a); a re-read prints
what a session waiting on an answer needs, and nothing it already has.

**Non-Goals:** reporting an edit to the body or to an older comment (user,
02.11, answer 3 a); any state `take` keeps between runs; a flag to print the
change's text after all (option 1 c, not chosen).

## Decisions

### A cursor by comment id, not by time

The cursor is the comment's id, compared through `hex()` so either of
Notion's forms matches. The comments after it are those after its position
in `oldest()`'s order, which is stable, so two comments in one minute keep
the order Notion returned them — the case a time cursor gets wrong. The id
not found (the comment deleted, or a wrong card's) prints every comment and
a line saying so, rather than failing: the session still gets the answer.

### The last line

`last comment: <id>` holds the id as Notion returns it, so the session
copies it as printed, and `none` when the card has no comments, where a
re-read runs `take` without `--after`. It is printed after `openspec list`
on a full read, and after the release on a re-read, so it is always last.
It names the card's newest comment, not the newest printed: with an id not
found, the two are the same, and with nothing new, it repeats the id given.

### What a re-read reads

The page, for `Status` and `Assign`, and the comments; the release makes its
own reads as it does today. No markdown, no `git rev-parse`, no `openspec`:
each is a failure the re-read does not need. The order of the lines matches
the full read's, the body and the change left out.

### Paths with line counts

`change()` keeps its file list and order and prints `<pointer><path>: <n>
lines` for each, the path from the checkout's root as today's `###` heading
gives it. The count is the file's lines with a last line that lacks a newline
counted, so it matches an editor's last line number. `capabilities:` stays.

## Risks / Trade-offs

- A session that read the change's text from `take`'s output now reads two
  to five files instead. The card's explore found that apply sessions read
  those files anyway, and that explore and answer checks do not read them.
- A body edit as an answer is missed on a re-read. Mitigation: answers go in
  comments, which is how `core/feature-workflow.md` already says they come.
