# bot-notion-writes

## Why

On the host the board loop's questions already go out from the Notion
integration (`bun/notion-bot.ts`), but every other write the loop makes goes
through the hosted Notion MCP, which is signed in as the user: the pick
session's claim of a card's `Status`, and whatever a stage session writes on
its card. The user decided on 2026-10-24 (answer 12 on the `approved` card)
that everything the bot does goes under the bot's name. The same pass also
leaves a defect: `task-board` says `Assign` is cleared in the turn the
answer's pull request opens, and nobody clears it — the runner opens the pull
request (`publish()` in `bun/board-loop-push.ts`) and the session never sees
it, so on runnersec `Assign` stayed on the user after PR #254 until it was
cleared by hand.

## What Changes

- Where the integration is configured, both loop sessions are launched with
  every Notion write tool withheld, the comment tool among them; the read
  tools stay, since the pick reads `Board view` and both read the card and
  its comments.
- The pick session writes nothing. It names the card it picked in a `CARD:`
  line beside its `PICK:` line, and the runner, after checking the card is
  the picked change's on the board `harness.board` names, moves its
  `Status` to `applying` over REST from the integration, from `proposed`, or
  from `applied` for an answer candidate.
- Right after the claim, before the stage session starts, the runner removes
  the user from that card's `Assign` over REST: the user decided on
  2026-10-25 that `Assign` goes as soon as the answer is read, and comes back
  only with a new question. A pass that then ends `open` or `waiting` leaves
  it empty. This relies on `answer-match` (PR #263), under which the pick no
  longer reads `Assign`, and reuses the `CARD:` reader and `unassign()` of
  `draft-until-answered` (PR #262), so it is applied after both.
- A stage session carrying an answer that asks for a change of its own names
  the new card in an `IDEA:` line of its final message instead of filing it;
  the runner files it at `idea` on the same board.
- Without the integration nothing changes: the laptop keeps the MCP form for
  both sessions (the user's answer 13в on the `loop-reads-feedback` card:
  with neither the integration nor the ask command, the loop writes through
  the connector under the user's name).

Not in this change: `Status` and `Pointer` lines for the stages the loop does
not carry yet (they come with *Let the board loop carry every status's next
stage*, on this mechanism); the pull request's link under the card's `Ссылки`
line, which no loop pass writes today; any write to a board's schema
(design, *The schema write of `approved-column`*).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: the pick's claim and the stage session's `idea` card move to
  the runner, the runner clears `Assign` when the pass reads the answer, and
  the sessions lose the Notion write tools where the integration is
  configured.
- `task-board`: who clears `Assign` and files the `idea` card for an answer
  the board loop carries.

## Impact

- `bun/board-loop.ts`, `bun/board-loop-prompt.ts`,
  and a new `bun/notion-card.ts` holding the runner's card writes; their
  tests and `bun/notion-bot.fixture.ts`'s stand-in API.
- `core/feature-workflow.md` (the board loop's launch-form variants),
  `README.md` (the board loop's paragraph).
- `openspec/changes/approved-column/.openspec.yaml` gains `after:
  bot-notion-writes`.
- The integration needs edit access to every board a runner with its settings
  writes: `Harness` on this host, and a consumer's own board where a
  consumer's runner holds the settings.
