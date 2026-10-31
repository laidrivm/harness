# notion-create-status-gate — design

## Context

See proposal.md, *Why*. Today `bun/status-guard.ts` reads
`tool_input.properties` and refuses through `blocker("status-guard",
event)("mcp-status", …)` when it is an object with its own key `Status`; an
event it cannot read passes. It is a `PreToolUse` group of its own in the
harness's `.claude/settings.json` under `^mcp__.+__notion-update-page$` —
`NOTION_MATCHER` of `bun/bootstrap.ts`, which the consumer-wide
`bun/notion-guard.ts` registration also uses — unmarked and in no `HOOKS`
entry, and `bun/self-pin.test.ts` pins that group whole as `STATUS_GUARD`.

`notion-create-pages`' input, from the connector's schema as the card's
explore read it on 2026-10-31: `{ parent, pages: [ { properties, content,
template_id, icon, cover, … } ] }`. `parent` is one of `{ data_source_id }`,
`{ database_id }`, `{ page_id }`, `{ teamspace_id }` or `"memory"`, shared by
every page, and omitted means a private page; `pages` holds up to 100.
`properties` maps names to SQLite values, so `Status` is a plain string
(`"Status": "approved"`), not the REST API's `{ select: { name } }`. Outside a
database the only property allowed is `title`, so a `Status` key takes effect
only under a database parent.

## The user's decisions

Answered on the card on 2026-10-31:

1. Any parent: the guard reads every page's `Status` whatever the `parent`,
   with no list of boards (а).
2. A card an agent creates on the user's word still starts at `idea`;
   `approved` is the user's (а).
3. A small OpenSpec change that lifts `notion-status-gate`'s non-goal and
   extends `work-status`'s requirement to `notion-create-pages` (а).
4. The card text validator was discarded, so there is no shared `pages[]`
   module to plan for (the question fell away).

## Goals / Non-Goals

**Goals:** the requirement's two refusals, `notion-update-page`'s unchanged.
**Non-Goals:** the proposal's list — `notion-duplicate-page`,
`notion-move-pages`, `template_id`, a lower-case `status`; a list of boards
(decision 1); an exception for `approved` (decision 2).

## Decisions

### A matcher of the group's own

The status guard's group takes `^mcp__.+__notion-(update-page|create-pages)$`
as a literal in `.claude/settings.json`. `NOTION_MATCHER` stays as it is: it
is the consumer guard's, and widening it would send `notion-create-pages`
through `bun/notion-guard.ts` in every consumer. Rejected: a second group for
`notion-create-pages` running the same command — one guard, two
registrations to keep in step. `bun/self-pin.test.ts`'s `STATUS_GUARD` pins
the new matcher as a literal with the rest of the group, whose every field
decides whether it runs or blocks (`core/rules.md`, *Pin a hook's
registration on every field …*), and a case runs that matcher as a
`RegExp` over tool names: both calls under two server names match;
`notion-create-comment`, `notion-update-page-x`, `notion-create-pages-x`
and a name with no `mcp__` prefix do not.

### The script branches on the tool

`tool_name` ending in `__notion-create-pages` reads `tool_input.pages`; every
other event keeps today's check of `tool_input.properties` unchanged, so an
update event with no `tool_name` is guarded as before. Branching on the tool
rather than on which key is present reads the structure the tool parses
(`core/rules.md`, *Read a value a tool consumes …*): a stray top-level
`properties` on a create call is nothing the connector writes.

On a create call the guard reads `pages`, and each entry's `properties`,
through `JSON.parse` first when it is a string — a client may send a nested
parameter as a JSON string and a server may coerce it, and a string the guard
passed unread would be the bypass this change closes. When `pages` is then an
array, the guard walks it and refuses on the first entry that is an object
whose `properties` is an object with its own key `Status` holding anything
but the string `"idea"` or `null` — so `"approved"`, `"Idea"`, `" idea"`,
`""` and `{ select: … }` all refuse. A string that does not parse, a `pages`
that is no array, an entry that is no object and a `properties` that is no
object pass: the guard fails open on what it cannot read, as today's does.
Update calls keep today's reading, a string `properties` passing (*Risks*
below).
`null` passes on create, where today's update refuses it, since a page
created with no status is what `idea`'s alternative means here, while an
update to `null` is still a status move.

The reason, on stderr: ``status-guard: pages[<i>] is created at Status
<value as JSON>; create a card at `idea` — only the user moves it to
`approved`, and later moves go through `bun bun/work.ts status --card <id>
--to <status>`.`` — the index counted from 0, as `pages` is written in the
call. It names `idea` alone, not "or with no Status": `bun/work-status.ts`
refuses to move a card whose `Status` reads no status, so a card created
without one waits for the user.

### A session's own card

`core/rules.md`'s *find or create its card on the board … and move it to
that stage's status* now reads as two steps for a card a session creates for
its own task: create it at `idea`, then `bun bun/work.ts status --card <id>
--to <stage>` in the same turn, which the command allows from `idea` within
the WIP limit (`notion-status-gate`, *The WIP count*). This widens nothing:
before this change such a session created the card straight at the stage.
`core/feature-workflow.md`'s *an unattended session takes no work from
`idea`* is about choosing a card someone else filed, not about the one the
session files for the work it was given; 1.3 says so where that sentence
stands.

### The same ledger rule

The record is `status-guard` / `block` / `mcp-status`, as today's. It is one
prohibition — a session sets `Status` through the connector — and
`gate-ledger`'s scenario *A status move refused* already says so; a new rule
id would need that spec changed for a split the refusal counter does not
ask for. The record keeps no tool name (`bun/gate-ledger.ts` writes the
gate, rule, project, session and commit), so the ledger does not tell an
update refusal from a create one; the stderr reason does, and no reader asks
the ledger for the split.

## Risks / Trade-offs

- [`template_id`: a database template could set `Status` with no `Status` key
  in the call] → unverified whether the `Harness` board has such a template;
  the data source read on 2026-10-31 lists none, and the fetch may not show
  templates. Left open by clarification 11 until a card shows it.
- [A lower-case `status` key] → the guard matches `Status` exactly, as
  today's does on update; whether the connector maps `status` to the
  `Status` property is unverified. 2.1's live probe tries it once and
  records the answer; a match there is a card, not this change.
- [`notion-duplicate-page` copies a card with its status;
  `notion-move-pages` can bring a page into a board] → open until a failure
  shows them (clarification 11).
- [A card created with no `Status`] → passes, by decision 1, and cannot be
  moved by `bun/work.ts status` until the user sets one; the reason names
  `idea` alone so a session does not choose it.
- [A string `properties` on `notion-update-page`] → passes as today; whether
  the connector parses a string parameter is unverified, and 2.1 probes it
  on a create with `idea`, which is harmless either way.
- [A non-board database with a `Status` property is gated in harness
  sessions too] → none is used there today (decision 1 accepts it).
- [A batch flow that filed a card straight at `approved` from the user's
  answer] → refused from now on; the card is filed at `idea` and the user
  moves it (decision 2).
- [The hook runs from the pin] → it holds a session only once the pin passes
  this change's merge; the live probe (group 2) follows that bump, as
  `notion-status-gate`'s did.

## Conflict check

`openspec/changes/` on `origin/main` b7191e1, 2026-10-31: `fix-card-done-by-pr`
modifies three other `work-status` requirements (*Merged statuses are proven
on origin/main*, *Each merged status has its own evidence*, *The card's
Pointer names the change proven*) and adds one, and names this card as the
status guard's reach to `notion-create-pages`, outside its scope;
`finish-review-arrives` modifies `work-finish`; `host-deploy` `orchestrator`.
Open pull requests #358 and #359 touch `agent-autonomy`, `local-review-loop`,
`work-resolve`, `core/review-toolkit.md` and `bun/review-docs.test.ts`. None
modifies *The connector's Status write is refused in the harness* or the
files group 1 edits; no order is needed. Before archiving, diff the copied
requirement against the live spec (`core/feature-workflow.md`, *Copy a
`MODIFIED` requirement whole*).

## Migration Plan

One pull request for group 1; the hook holds once the pin passes its merge,
and group 2's probe is ticked in the pull request that bumps the pin or the
first after it. Rollback: revert the matcher and the script's create branch;
`notion-update-page` is guarded as before throughout.
