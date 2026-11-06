# status-discarded

## Why

`bun bun/work.ts status` refuses every move to `discarded` and every move out
of it: `USER_ONLY` in `bun/work-status.ts` holds `idea`, `approved` and
`discarded`, and the connector's own `Status` write is refused by the
`status-guard` hook. On 2026-11-06 merging duplicate cards on the `Harness`
board left about ten cards for the user to move to `discarded` by hand. The
user asked for the move to be the session's as well, in both directions: «не
обязательно узкое исключение. Просто чтоб тебе было закидывать и в
дискардед, и возвращать оттуда». On the card they added that a session
returns a card from `discarded` to `idea` only, never straight to `approved`,
and that the reason for a discard is written on the card, so it shows who
moved it and why.

## What Changes

- `work.ts status --to discarded` writes from any other status, with no WIP
  count and no evidence.
- A card at `discarded` may be moved to `idea`; every other target stays
  refused for it, naming `idea` as the way back.
  `--to idea` from any other status, and `--to approved` from any status,
  stay refused as the user's.
- Both moves take a required `--why <text>`; `status` posts it on the card as
  a page-level comment by the ask integration, opening with the code mark
  `harness-status`, naming the move read (`<from> → <to>`), before it writes
  the status. `--why` on any other target, or a blank one, prints the usage
  and exits 2.
- `openspec/specs/task-board/`, `openspec/specs/work-status/`,
  `core/feature-workflow.md`, `core/skills/session-wrapup/SKILL.md`, the
  `README.md` row for `status` and the comments in `bun/board-state.ts` stop
  calling `discarded` the user's alone; the `README.md` row also names the
  *Insert comments* capability the note needs.
- `status-guard`'s refusal of a connector `Status` write names `--why` for
  `discarded` beside the command it points to.

Out of scope: restoring the status a card left `discarded` from. A card
returned to `idea` is lifted to its change's floor by the next
reconciliation (`proposing`, `proposed` or `done`), and a hand-moved status
is one more `status` move, under its usual checks. `idea` and `approved` stay
the user's: nothing here asks for a session to set them otherwise.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-status`: `discarded` becomes a session's target, a discarded card's
  way out is `idea`, and both moves carry a `--why` posted on the card. The
  connector guard's requirement is unchanged; only its refusal's wording
  gains `--why`.
- `task-board`: `discarded` is moved by the user or by a session through
  `work.ts status`; a reconciliation still leaves a `discarded` card where
  it is.

## Impact

- Changed: `bun/work-status.ts`, `bun/work.ts` (`--why` in the dispatch,
  `USAGE` and the header comment), `bun/work-status.test.ts`,
  `bun/board-state.ts` (comments only), `bun/status-guard.ts` (its
  refusal's text) and `bun/status-guard.test.ts`, `core/feature-workflow.md`,
  `core/skills/session-wrapup/SKILL.md`, `README.md`.
- No new dependency, allow entry or hook: `.claude/settings.json` already
  allows `bun bun/work.ts *`. `status-guard` still sends every `Status`
  write to `work.ts status`, and its line for a card created at a status
  other than `idea` names only `approved` as the user's, which stays true.
- The comment uses the ask integration's *Insert comments* capability, which
  `bun bun/notion-ask.ts` already needs; an integration set up for `status`
  alone now needs it too.
- The laptop session's memory saying these statuses are the user's alone is
  the user's to retire.
