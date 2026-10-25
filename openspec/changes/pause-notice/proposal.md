# pause-notice

## Why

When a pass pauses a clone, `pass.sh` writes `<clone>.stop` and every later
tick exits 3, but nobody is told: the pause shows only as a red job in
Windmill and a file on the runner. On 2026-10-24 the third live pass ended
`goal open` and paused the clone, which came to light only because an agent in
a chat was reading the log (card *Tell the user when the loop pauses a
clone*). Since `no-pause-on-question` (#253), a pause means a real failure, so
each one needs the user.

## What Changes

- When `pass.sh` writes a stop file, it hands the stop file and the pass's log
  to a notice command, which posts one comment from the runner's Notion
  integration on the card of the step that stopped, mentioning the user, with
  the stop line, the log's path and the command that resumes the clone, then
  sets the card's `Assign` to the user. The user clears it when they resume.
- A pause tied to no existing card (a halt, a refusal before the pick, no card
  whose `Pointer` names the step's change) files a new card on the board,
  describing why the loop stopped, at `approved` and assigned to the user, and
  posts the same comment there.
- The board is the data source the runner's `notion-bot.json` names as
  `board`. With no such key, or no file, the command posts nothing and prints
  why; the pause stands as today.
- One notice per pause: the command runs only where the stop file is written,
  so the ticks it then refuses (exit 3) post nothing, and a stop by hand
  (`stop.sh`) posts nothing.
- The notice never changes the pass's exit status or the stop file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator`: a new requirement, *A pause posts one notice to the user*.

## Impact

- `bun/notion-pause.ts` (new): the notice command, with the `Pointer` query
  and the new card's creation.
- `bun/notion-bot.ts`: `settings()` reads the optional `board` id;
  `comment()` takes an optional user to mention; the `Assign` write `post()`
  makes is lifted into a function both callers use.
- `orchestrator/pass.sh`: `pause()` runs the command `PASS_NOTIFY` names.
- `orchestrator/runner/entrypoint.sh`: the forced command sets `PASS_NOTIFY`
  to the image's copy of the notice command.
- `orchestrator/README.md`: the `board` key and the notice in section 7.
- Tests: `bun/notion-pause.test.ts`, `orchestrator/pass-notice.test.ts` (new;
  `pass.test.ts` is near the cap), and the forced-command cases in
  `orchestrator/users.test.ts`.
- On the host, after merge: the `board` key and a rebuilt runner image, whose
  `/opt/orchestrator/bun/` the notice runs from.
