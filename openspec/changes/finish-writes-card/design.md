## Context

`bun/work-finish.ts` (104 lines) pushes, opens the draft, reads the card's
comments through the ask integration (`integration()` in
`bun/notion-ask.ts`) and marks the pull request ready. It writes nothing to
the card. `bun/work-status.ts` already reads a card's page and `PATCH`es its
`Status` through the same integration, which holds *Read content*, *Update
content* and the comment capabilities; *Insert content* has never been
asked of it. `bun/notion-bot.ts` is at 279 lines of its 300 cap, and
`bun/work-finish.ts` is also changed by `finish-review-arrives` (#361, about
85 lines) and `notion-ask-sets-assign` (#364).

On the live cards the links section is a paragraph reading **Ссылки** near
the end of the body, followed by bulleted items such as
`[#364](https://github.com/laidrivm/harness/pull/364) — proposal`; text
after it is rare but occurs (an explore section appended later).

## Goals / Non-Goals

**Goals:** `finish --card` leaves the card's `Pointer` naming the change its
branch adds files to, and the pull request linked under `Ссылки`, on every call, so a
rerun after any failure finishes the job.

**Non-Goals:** a fix card's `pr:<N>`; the `proposal.md` link and its move at
archive; any other card text; a board property; consumers' sessions.

## Decisions

1. **One module, one call.** `bun/work-finish-card.ts` exports
   `recorded(call, card, top, pull)`, returning `finish`'s lines or throwing
   naming the step; `finish` calls it once the pull request's number is
   known, before the question read, and turns a throw into one line,
   `finish: the card's record stopped, a rerun writes the rest — <step> …`,
   and goes on to the question read and the ready switch. The record is
   auxiliary: `finish`'s own work — the push, the pull request, the ready
   switch — never waits on it (the user's answer 1 c, 2026-11-01). That
   covers every failure inside the record: the fetch of `origin/main`, the
   merge base, the branch's diff, and the page, board and block reads, the
   `Pointer` write and its read-back, and the link's append. It does not
   cover missing ask settings or the comments read, which gate the ready
   switch as before.
   Rejected: inlining in `bun/work-finish.ts`, which three changes edit at
   once; adding to `bun/notion-bot.ts`, which has 21 lines of headroom.
2. **The changes the branch adds files to, at the merge base.**
   `origin/main` is fetched with `work-status.ts`'s named refspec, so a
   single-branch clone has it; then `git merge-base origin/main HEAD`, and
   `git diff --name-only --diff-filter=A --no-renames <base> HEAD --
   openspec/changes/`; each path gives its change directory,
   `openspec/changes/<slug>/` or `openspec/changes/archive/<dir>/`. A new
   change and a `-plan` branch's design and tasks both name the change, so
   a card whose `Pointer` was left empty by its first half still gets it;
   an archive names only its archived directory, since the old one's files
   are deleted, not added. A fetch, merge base or diff that fails — a
   shallow clone finds no merge base — writes neither the `Pointer` nor the
   link, so nothing is written under a wrong kind, and says in one line that
   the branch's change could not be told; `finish` goes on (the user's
   answer 1 c, 2026-11-01, over *the draft stays*).
   Rejected: directories new at `HEAD` alone (`git ls-tree`), which leave a
   `-plan` branch naming nothing; the tip of `origin/main`, where a change
   archived on main after the fork reads as one the branch adds.
3. **When the `Pointer` is written.** Exactly one such directory `d`. The
   page read's `Pointer`, with this repository's `<package name>: ` prefix
   stripped as `work-status.ts` strips it, is empty, or is
   `openspec/changes/<slug>/` where `d` is
   `openspec/changes/archive/<date>-<slug>/`: `d` is written, under the
   prefix the `Pointer` had. An empty `Pointer` on a card whose board's
   title is not the `harness.board` of `package.json` (one data source read,
   as `carded()` makes) takes the prefix, which *A card for another
   repository's change points across* requires. Equal to `d`: nothing,
   said. Any other value is left with a line naming it — the card's
   `Pointer` names a change (`core/feature-workflow.md`: a card whose
   `Pointer` names a change keeps it), and `pr:<N>` is a fix card's. The
   write is the `Status` write's shape, `{ properties: { Pointer: {
   rich_text: [{ text: { content } }] } } }`, and Notion's answer is the
   read-back.
4. **The link.** The pull request's URL is
   `https://github.com/<owner>/<repo>/pull/<N>` from `originRepository()`:
   `origin` is on GitHub.com, as `finish`'s `gh … -R <owner>/<repo>` calls
   already assume, and another host is out of scope.
   The card's top-level blocks are read (`GET /v1/blocks/{card}/children`,
   every page); a block whose rich text carries that `href`, or a bookmark
   or preview whose own `url` is it — in any case, or a page of it such as
   `/files` — means the link is there. Else the first paragraph or heading
   whose plain text, trimmed of whitespace and a trailing `:`, is `Ссылки`
   anchors it: the new bulleted item goes `after` the last of the bulleted
   items directly following it, blank paragraphs among them skipped, or
   after the anchor when none does, in one `PATCH
   /v1/blocks/{card}/children`; a later section's bullets are not the
   run. No anchor: a bold `Ссылки` paragraph and the item are appended at
   the end. The cursor loop `discussion()` runs is lifted into
   `bun/notion-bot.ts` as one helper both reads call, joining the cursor
   with `?` or `&` as the path needs and naming its caller's step in the
   no-new-cursor error. Rejected: the markdown read work-take uses, which gives
   no block id to anchor on; one paragraph rewritten under *Update content*,
   which drops the list form and still needs *Insert content* on a card
   with no `Ссылки`.
5. **Kind.** From the same added paths: `proposal` when one is a
   `proposal.md`, `design.md` or `tasks.md` of a directory outside
   `archive/` — a new change or a `-plan` branch's design and tasks (#363,
   #374); else `archive` when one is inside `archive/`; else `apply` — the
   three the card names, a fix's pull request reading `apply`. An apply
   branch that adds a delta spec or another file to its change (#377) reads
   `apply` (the user's answer 2 b, 2026-11-01, over *any directory outside
   `archive/`*). The `step 2` of `core/feature-workflow.md` becomes `apply`, so
   prose and code name one convention; a step's number stays in the
   pull request's title.
6. **Order.** Pointer first, then the link: a refused append leaves the
   `Pointer`, which is what `work.ts status` needs past `proposing`.

## Risks / Trade-offs

- [*Insert content* not granted, or `after` not taken under API version
  `2025-09-03`] → task 1 probes both on a test card before any code; a 403
  is named by step in one line, and `finish` goes on.
- [A link nested under a toggle, or the page and block reads one after the
  other] → kept (the user's answers 3 a and 4 a, 2026-11-01): only
  top-level blocks are read, so a nested link gets a visible, harmless
  duplicate; the reads stay serial, so the call order the tests pin is
  deterministic, at one Notion round trip.
- [Blocks after the `Ссылки` list stay after it] → Notion's REST surface
  moves no block, and recreating them would drop their ids, comments and
  children; the item lands in the list, where a reader of the links looks.
- [A rich-text link Notion stores in another form, so the `href` check
  misses it] → the probe reads back the item it wrote; a duplicate link is
  visible and harmless.
- [The integration now writes `Pointer` and card text, past decision 3 of
  `openspec/changes/archive/2026-10-22-notion-bot-questions/design.md`] →
  the user's scope for this card asks for it (on the host nobody writes
  them by hand); the writes are two, named here.

## Migration Plan

The user grants the ask integration *Insert content*; apply probes, then
lands the module and the call. `core/feature-workflow.md`'s hand steps for
the `Pointer` and the pull request's link stay, narrowed to a pull request
no `finish --card` opened or found open: consumers' sessions run no `finish` until
roadmap stage 11 ships it, and the user opens pull requests by hand.
Rollback: revert the call; the cards keep what was written.

## Open Questions

None.
