# fix-card-done-by-pr

## Why

`bun bun/work.ts status --to done` proves `done` only by an OpenSpec change
archived on `origin/main`, read from the card's `Pointer`. A fix card has no
change, so its `Pointer` is empty: the command refuses it under `no-pointer`,
and the status guard refuses the connector's own `Status` write, so such a
card has no path to `done` at all. The first one was card
`40739875c31b8189b6fed21ea2ef1da4` (#350). The user settled the form on this
card on 2026-10-31 (answers 1 а, 2 а, 3 а).

## What Changes

- A card's `Pointer` may read `pr:<N>`: the number of the one pull request of
  this repository that closes the card, a positive whole number with no
  leading zero (answer 1 а). The other pull requests the work took stay under
  the card's `Ссылки` (answer 2 а). Behind this repository's own name, as
  `harness: pr:<N>`, it counts alike, the cross-repository form task-board
  already has.
- `status --to done` proves `done` for such a card when GitHub says that pull
  request of the repository `origin` names is merged into `main`. It reads no
  tree and fetches nothing. `--to proposed` and `--to applied` with a `pr:`
  pointer refuse (answer 3 а): a fix has no proposal and no `tasks.md`.
- `bun/pull-requests.ts` gains the read of one pull request by number, beside
  the read of a branch's, sharing its mint, its time limit and its failure
  handling.
- A reconciliation skips a `pr:` card, as it skips a cross-repository one:
  the tree derives nothing for it.
- `core/feature-workflow.md` and the README name the new form.

The session that opened the closing pull request writes `pr:<N>` into the
card's `Pointer`, with the link under `Ссылки` (card assumption 6). Not in
this change: `work.ts finish` writing it by itself, until a hand-written one is
seen forgotten; a list of pull requests in one `Pointer`, until a card needs
one; tying the pull request to the card it closes (roadmap clarification 11).
The status guard's reach to `notion-create-pages` (answer 4 б) is a card of
its own, not this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-status`: `done` proven by a merged pull request the `Pointer` names;
  the merged statuses' tree read and the `Pointer` requirement make room
  for it.
- `task-board`: the `pr:<N>` pointer as a second exception to the
  repository-relative path, which a reconciliation skips; the
  cross-repository form gains it.

## Impact

- Changed: `bun/pull-requests.ts` (one more reader), `bun/work-status.ts`
  (the `pr:` branch of the evidence), `bun/work-status.fixture.ts` (a `gh`
  stub), their tests, `core/feature-workflow.md`, `README.md`.
- GitHub: one `gh api repos/<origin>/pulls/<N>` per `--to done` on a `pr:`
  card, with the minted token where `HARNESS_GITHUB_APP_MINT` names a mint.
- Notion: no schema change; `Pointer` stays `rich_text`.
