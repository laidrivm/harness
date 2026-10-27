# work-take — design

## Context

See proposal.md, *Why*. The parts exist in `bun/notion-bot.ts`: `client()`
(REST, `Notion-Version` fixed at `2025-09-03`, a failure thrown naming the
step and the status, never the token), `ID`, `plain()`, `hex()`, the private
`discussion()` (every page of a card's page-level comments) and `waits()`
(whether the last question has no answer). The ask command,
`bun/notion-ask.ts`, reads the ask settings, `notion-ask.json` under the
user's config home. `bun/notion-bot.fixture.ts`'s `standIn()` is a Notion
stand-in reached through `HARNESS_NOTION_API_URL`. `bun/notion-bot.ts` stands
at 276 lines of the 300 cap. No code reads a page's body today.

Two facts are not yet verified and become tasks (*Migration Plan*):

- Notion serves a page's body as rendered markdown at `GET
  /v1/pages/{id}/markdown`, under API version `2026-03-11`, answering an
  object with `markdown`, `truncated` and `unknown_block_ids`, the blocks it
  left out for size or permissions (the card's exploration, from
  Notion's documentation).
- The ask integration reads pages now that the user granted it *Read content*
  (card comment, 2026-10-26).

## Goals / Non-Goals

**Goals:** one call puts a card's whole context in front of the session in a
fixed order, from Notion and the checkout, with no parsing of our own
between Notion and the output.

**Non-Goals:** beyond the proposal's list, rendering Notion blocks ourselves,
printing the live specs a change touches (`agent-permissions` alone is over
2000 lines; the session reads what it needs), following a pointer into
another repository, and choosing which card to take.

## Decisions

### The dispatcher is work-finish's

`bun/work.ts` is the thin dispatcher `work-finish` fixes: `util.parseArgs` in
strict mode, one module per subcommand, the usage and exit 2 on any argument
it refuses. `take` lives in `bun/work-take.ts` as `take(card, timeout)`,
returning its lines and exit code; `work.ts` prints them. Whichever change
is applied first writes `work.ts` with its own subcommand alone and the allow
entry `Bash(bun bun/work.ts *)` with its case in `bun/self-pin.test.ts`; the
second adds its subcommand and finds the entry there. Rejected: a script of
its own, `bun/take.ts`, which would need a second allow entry and a second
usage for one family of commands.

### The ask settings, read the way finish reads them

`take` reads Notion through the ask settings alone, by the export
`work-finish` lifts out of `ask()` in `bun/notion-ask.ts` (its task 2.1),
which answers the settings and a client or the reason there are none. If
this change is applied first, it lifts that export itself, with
`work-finish`'s cases. Rejected: the card's decision 6, `notion-bot.json`
then `notion-ask.json` as `bun/board-loop.ts` chooses — `finish`, merged
first as a proposal, reads the ask settings alone, and two commands of one
dispatcher reading different integrations would answer a question's state
differently on one machine. The VPS's identity is stage 5's (roadmap
question 20).

### The order, and what each part reads

1. `git rev-parse --show-toplevel HEAD`: the checkout and its commit, printed
   first, since a main session on a stale `main` reads stale change files.
2. `GET /v1/pages/{id}`: `Name`, `Status`, `Pointer`, `Labels`, `Assign`,
   each read by its type — title and rich text through `plain()`, select and
   status by name, multi-select as names, people as ids.
3. `GET /v1/pages/{id}/markdown`: `markdown` printed as it comes;
   `truncated` true adds a line, and a non-empty `unknown_block_ids` a line
   with their count — the fields, never a search of the markdown for
   Notion's `<unknown>` tag. A block type Notion does not render, a
   bookmark or an embed, stands in the markdown as that tag with its `url`
   and `alt`, which `take` prints unchanged, so the session sees it where
   it stands. Rejected (CodeRabbit on #313): a line for a tag found in the
   text, which is our own scan of Notion's output, and which a card quoting
   the tag in a code block would trip. A `markdown` that is not a string
   fails the read, as a status would.
4. `discussion()` and `waits()`, both exported from `bun/notion-bot.ts`: each
   comment as `<created_time> <author>: <plain text>`, the author `user` when
   its id is the settings' `user`, its hex id otherwise; then `question
   waiting: yes` or `no`. `waits()` gets no `self`: the ask settings carry
   none, as in `finish`.
5. The `Pointer`, matched whole against `^openspec/changes/([a-z0-9-]+)/$`,
   `archive` excepted, since that directory holds archived changes, not one.
   A match whose directory the checkout holds prints `proposal.md`,
   `design.md`, `tasks.md` and each `specs/<capability>/spec.md`, each under
   a line naming its path, then the capabilities' names; a file the change
   lacks is skipped. A match the checkout lacks, an empty pointer and any
   other value print one line each.
6. `openspec list`, its standard output as is.

The Notion reads come first, so a card that cannot be read prints no change
files that might belong to another card. Each part opens with a `## ` line
naming it, so the session can tell the card's markdown from the change's.

### Failures

Every failed read ends the command: exit 1 with `take: <step> failed —
<reason>` after what was already printed. The reason is `client()`'s, which
holds the step and the status or the error's name, never the token. A
transient failure is no different here: `take` is run by a session that can
run it again. Rejected: printing what could be read and exiting 0, which
leaves a session reading a card with no comments as a card where no question
waits.

### The API version for one call

`client(token, timeout, version = VERSION)` gains the version as a last
parameter, and `take` builds a second client with `2026-03-11` for the
markdown read alone. Rejected: raising `VERSION`, which moves every call the
board loop, the pause notice and the ask command make onto a version none
of their cases ran against.

### The ask command's wording

The README's ask paragraph and `bun/notion-ask.ts`'s header say the ask
integration has comment capabilities alone. After the user's grant that is
false; both say instead that it reads pages and comments and writes no
property, so the session still sets `Assign` itself. The command itself
still reads no page, so its requirement in `task-board` keeps its words.

### Settled while applying

- The lifted export is `integration(timeout, env)` in `bun/notion-ask.ts`,
  answering `{ settings, call }` or the reason as a string; `env` names the
  config home as `where()` reads it, while the client still reads
  `HARNESS_NOTION_API_URL` from the process, as every `client()` does.
  `finish` calls it as is.
- Comments print in the order `waits()` reads them, through one exported
  `oldest()` in `bun/notion-bot.ts`, so the printed last comment and the
  `question waiting:` line cannot drift apart.
- `work.ts` keeps one `if` per subcommand over a shared strict `values()`,
  and one usage line each, printed to standard error with exit 2; `finish`
  adds its branch and its line.
- The lines: `## Checkout: <top> at <sha>`, then `## Card`, `## Body`,
  `## Comments`, `## Change` (each file under `### <path>`, then
  `capabilities: <names>` or `none`) and `## Open changes`; the body's notes
  read `the body is truncated: Notion left part of it out` and `Notion left
  <n> blocks out of the body`. Status reads a `select` as it reads a
  `status`, since a board may hold either.
- The live probe of 2026-10-27 confirmed the read under the ask
  integration's grant: the markdown read answered under `2026-03-11`, the
  page and comments reads under `2025-09-03`.

## Seams

- `work-finish` (proposal merged): shares `bun/work.ts`, the allow entry and
  the lifted ask export; *The dispatcher is work-finish's* says who writes
  them. `finish` calls `waiting()`; `take` does not, since it prints the
  comments too: it reads them once with `discussion()` and passes them to
  `waits()`, which `waiting()` wraps, so the two answer alike.
- `judgement-step-record`, `pre-pr-project-checks`, `pre-pr-diff-paths`,
  `local-review-before-pr`: no seam — `take` neither reads nor writes the
  ledger.
- Card `40539875c31b8147818fcdcc791611f2` (sub-agent worktrees): no seam —
  `take` reads the checkout it runs in, and the main session runs it in its
  own.
- Stage 2's *Потом* 5 (`SessionStart`): `take` records nothing, so the hook
  cannot learn the current card from it; that is the hook's to settle. The
  hook may call `take()` for the card it settles on.

## Conflict check

`openspec show <change> --json --deltas-only` for this change and every open
one on `origin/main` (`work-finish`, `pre-pr-diff-paths`,
`pre-pr-project-checks`, `local-review-before-pr`, `judgement-step-record`,
`host-deploy`); no pull request was open. This change's only delta is the new
capability `work-take`, which no other change touches: no contradiction. The
code seams above share files, not capabilities.

## Risks / Trade-offs

- [The markdown endpoint's shape or version differs from the exploration's
  reading] → the live probe runs before the cases are trusted; `take` reads
  only `markdown`, `truncated` and `unknown_block_ids`, so a renamed field
  fails one case.
- [The grant reaches only the pages the integration is connected to] → a
  card outside the boards answers 403 or 404, which `take` reports and exits
  1 on.
- [A comment anchored on a block is not printed] → questions are page-level
  by the question gate; an inline answer is missed, as the card accepts
  (its item 8).
- [A long `design.md` fills the main session's context] → accepted: one card
  at a time, in a 1M window (roadmap question 17).

## Migration Plan

Nothing to migrate: `take` adds a command and changes no one's behaviour.
Before its pull request goes ready, a live probe on this change's own card
from the tree:
`bun bun/work.ts take --card 40439875c31b810d8562f984ab8bc84a`, recording in
the pull request's body that the markdown read answered under `2026-03-11`
through `client()`, the body printed as the card shows it, and the comments
and `question waiting:` line matched the card. Rollback: revert the commit;
nothing else reads what `take` prints.
