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
branch adds, and the pull request linked under `Ссылки`, on every call, so a
rerun after any failure finishes the job.

**Non-Goals:** a fix card's `pr:<N>`; the `proposal.md` link and its move at
archive; any other card text; a board property; consumers' sessions.

## Decisions

1. **One module, one call.** `bun/work-finish-card.ts` exports
   `recorded(call, card, top, pull)`, returning `finish`'s lines or throwing
   naming the step; `finish` calls it once the pull request's number is
   known, before the question read, and turns a throw into
   `finish: draft #N — <step> …`, exit 1, as it does for the comments read.
   Rejected: inlining in `bun/work-finish.ts`, which three changes edit at
   once; adding to `bun/notion-bot.ts`, which has 21 lines of headroom.
2. **Added directories from trees, at the merge base.** `git merge-base
   origin/main HEAD`, then `git ls-tree -d --name-only --full-tree` of
   `openspec/changes/` and `openspec/changes/archive/` at both commits;
   added is in `HEAD` and not at the base, `archive` itself excluded.
   Rejected: `git diff --diff-filter=A`, which counts a file added to a
   change that already exists (a design added by a `-plan` branch) as a new
   directory; the tip of `origin/main`, where a change archived on main
   after the fork reads as one the branch adds. No `origin/main` read gives
   no directories, and the line says so.
3. **When the `Pointer` is written.** Exactly one added directory `d`; the
   page read's `Pointer` is empty, or is `openspec/changes/<slug>/` where `d`
   is `openspec/changes/archive/<date>-<slug>/`. Equal to `d`: nothing,
   said. Any other value is left with a line naming it — the card's
   `Pointer` names a change (`core/feature-workflow.md`: a card whose
   `Pointer` names a change keeps it), and `pr:<N>` is a fix card's. The
   write is the `Status` write's shape, `{ Pointer: { rich_text: [{ text: {
   content: d } }] } }`, and Notion's answer is the read-back.
4. **The link.** The pull request's URL is
   `https://github.com/<owner>/<repo>/pull/<N>` from `originRepository()`.
   The card's top-level blocks are read (`GET /v1/blocks/{card}/children`,
   every page); a block whose rich text carries that `href` means the link
   is there. Else the paragraph whose plain text, trimmed of `:`, is
   `Ссылки` anchors it: the new bulleted item goes `after` the last
   bulleted item following it, or after the paragraph when none does, in
   one `PATCH /v1/blocks/{card}/children`. No such paragraph: a bold
   `Ссылки` paragraph and the item are appended at the end. The cursor loop
   `discussion()` runs is lifted into `bun/notion-bot.ts` as one helper
   both reads call. Rejected: the markdown read work-take uses, which gives
   no block id to anchor on; one paragraph rewritten under *Update content*,
   which drops the list form and still needs *Insert content* on a card
   with no `Ссылки`.
5. **Kind.** `proposal` when any added directory is outside `archive/`,
   else `archive` when one is inside it, else `apply` — the three the card
   names; a fix's pull request reads `apply`.
6. **Order.** Pointer first, then the link: a refused append leaves the
   `Pointer`, which is what `work.ts status` needs past `proposing`.

## Risks / Trade-offs

- [*Insert content* not granted, or `after` not taken under API version
  `2025-09-03`] → task 1 probes both on a test card before any code; a 403
  is named by step, and the draft stays.
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
`finish` did not open or update: consumers' sessions run no `finish` until
roadmap stage 11 ships it, and the user opens pull requests by hand.
Rollback: revert the call; the cards keep what was written.

## Open Questions

None.
