# notion-create-status-gate

## Why

The status guard refuses a `Status` write through the connector's
`notion-update-page`, so in the harness a card moves only through `bun
bun/work.ts status`. It does not match `notion-create-pages`, so a card can
be created straight into any status: on 2026-10-29 an explore agent created a
card directly at `approved`, which only the user sets, and the auto-mode
classifier caught it, not the guard. That is the failure roadmap
clarification 11 waits for, and it lifts `notion-status-gate`'s non-goal *the
connector's other writes (`notion-create-pages`, …)*, for this call alone.
The user asked for it as a card of its own on 2026-10-31 (answer 4 b on card
`40839875c31b814ab3ecec910aa768d8`) and settled its shape the same day.

## What Changes

- The status guard's own `PreToolUse` group in the harness's
  `.claude/settings.json` matches `notion-create-pages` beside
  `notion-update-page`, under any server name, with a matcher of its own;
  `NOTION_MATCHER`, which the consumer-wide Notion update guard uses, stays
  as it is.
- On `notion-create-pages` the guard refuses the call when any page in its
  `pages` carries `properties.Status` with a value other than `"idea"`,
  naming the page's index and the way out: create the card at `idea` or with
  no `Status`, the user moves it to `approved`, and later moves go through
  `bun bun/work.ts status`. A missing or `null` `Status` passes, whatever the
  parent, with no list of boards (user's answer 1 а).
- A card an agent files on the user's word starts at `idea` too: the guard
  makes no exception for `approved` (answer 2 а).
- The refusal is the same ledger record as today's, `status-guard` /
  `mcp-status`; an event it cannot read, a `pages` that is no array and an
  entry that is no object pass, as today's guard fails open.
- `notion-update-page` is guarded exactly as today.
- `core/feature-workflow.md`'s sentence that the connector's `Status` write is
  refused in the harness names the creation too.

Not in this change, by clarification 11: `notion-duplicate-page`, which
copies a card with its status, and `notion-move-pages`, which can bring a
page into a board; a `template_id` that would set `Status` with no `Status`
key in the call; a lower-case `status` key (design, *Risks*). The card text
validator this change once shared `pages[]` with was discarded (answer 4), so
there is no shared reader to plan for.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-status`: *The connector's Status write is refused in the harness*
  covers `notion-create-pages` — a page created at any `Status` but `idea` —
  beside `notion-update-page`.

`gate-ledger` is not modified: its scenario *A status move refused* already
names the status guard refusing a connector `Status` write, and the record's
rule id stays `mcp-status`.

## Impact

- Changed: `bun/status-guard.ts` and `bun/status-guard.test.ts`;
  `.claude/settings.json` (the group's matcher); `bun/self-pin.test.ts` (the
  pinned group and a matcher case); `core/feature-workflow.md` (one clause).
- Harness-only: the guard is in no `HOOKS` entry and reaches no consumer, so
  there is no consumer tree to measure it against
  (`core/feature-workflow.md`, Stage 1).
- The hook runs from the pin: it holds a session once the pin passes this
  change's merge, and its live probe follows that bump.
