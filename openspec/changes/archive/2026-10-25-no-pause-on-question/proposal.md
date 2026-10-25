# no-pause-on-question

## Why

A pass whose stage session asks the user a question ends `open`, exits 1,
and `pass.sh` writes `<clone>.stop`, so every later tick pauses until the
user deletes the file by hand. Waiting for an answer is not a failure. The
third live pass on 2026-10-24 stopped this way: runner-isolation step 6
finished 6.1, asked about 6.2, and paused the clone. The user will not clear
stop files by hand (card *Don't pause the loop when a pass ends waiting on the
user's answer*, 2026-10-24).

## What Changes

- The board loop gains an outcome, `waiting`: the pass ended short of its
  goal and a question on the carried card waits on the user, because the
  runner has just posted the session's question or the card already held an
  unanswered one. It records `loop`, `waiting`, prints the card, and exits 0,
  so `pass.sh` writes no stop file and the next tick runs.
- The pick session passes over a takeable change whose card holds an
  unanswered question, so a waiting card costs no stage session per tick. Once
  the user answers, the card is taken as any other.
- Every other non-zero end still pauses: refused, timeout, a goal open with
  no question waiting, and a question the runner could not post.

## Capabilities

### Modified Capabilities

- `board-loop`: the `waiting` outcome, and the pick's pass-over of a card
  whose question waits.
- `orchestrator`: the stop-file requirement names the `waiting` pass as one
  that writes none.

## Impact

- `bun/board-loop.ts`: the outcome and its exit status; `bun/notion-bot.ts`
  exports the two line prefixes `post()` already prints, so the runner reads
  them from one place.
- `bun/board-loop-prompt.ts`: one sentence in the pick prompt.
- `orchestrator/pass.sh`: its header comment only; the code already writes no
  stop file on exit 0.
- Tests in `bun/board-loop*.test.ts` and `orchestrator/pass*.test.ts`.
