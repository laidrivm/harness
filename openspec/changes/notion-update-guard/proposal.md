# notion-update-guard

## Why

On 2026-10-10 a session moved three cards to `done` with the Notion connector's
`notion-update-page`. It passed the new statuses as `properties` beside the
command `update_content`. The connector applied the content edit, dropped the
`properties` without an error, and returned the page id as it does on success.
The session reported the cards moved. They stayed where they were until the
user saw the board.

Two changes then each assumed the other would guard this. `board-state-per-project`
handed the hook to `policy-gate-beyond-bash`, whose non-goals exclude board
writes, so nobody owns it. All that stands between a session and the same
loss is one sentence in `core/feature-workflow.md`: "Set a card's status and
pointer with `update_properties`". That is prose, the mechanism
`capture-as-mechanism` was written to stop relying on.

## What Changes

- A `PreToolUse` hook on the Notion update tool refuses a call that carries
  `properties` with any command other than `update_properties`. Its reason
  names the split: properties go in their own `update_properties` call. It
  matches the tool under any server name, because the same connector reaches
  sessions as `claude_ai_Notion` and as `notion`.
- The hook fails open. An event it cannot read lets the call through. It
  catches one known way to lose a write, and a guard that refused every
  update when the event's shape changed would stop the board workflow
  outright.
- The harness registers it in its own `.claude/settings.json`. Consumers get
  its text from `bun/bootstrap.ts`, and `bun/settings.ts` pins the
  registration verbatim, as it already pins the turn gate's.
- A refusal is recorded in the gate ledger that `gate-decision-ledger` adds,
  under its own id.
- `core/feature-workflow.md` keeps only what the hook cannot see: re-read a
  card before reporting it moved. No hook can read a board.

## Non-goals

- Re-reading a card after a write. A hook has no connector, so it cannot read
  the page it lets through, and the re-read stays the prose obligation.
- Other Notion tools and other connectors. Only this call, with this
  argument pair, has been seen to lose a write.
- Sending as the user. That is `policy-gate-beyond-bash`'s.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-board`: one added requirement, *A card write that would lose its
  properties is refused*, with the registration consumers carry pinned by the
  check.

## Impact

- New `bun/notion-guard.ts` and its tests; `bun/bootstrap.ts` gains the
  registration text; `bun/settings.ts` pins it.
- `.claude/settings.json` gains one `PreToolUse` entry.
- `core/feature-workflow.md` loses the half of one sentence the hook now
  holds.
- dota2 and mellon add the registration in the pull request that bumps their
  pin, because the bumped check fails without it.
- Each Notion page update pays one `bun` start. Nothing else does.
