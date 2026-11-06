# ship-ponytail

## Why

The harness leans on the ponytail plugin (`core/code-style.md`,
`/ponytail-review` in `core/review-toolkit.md`), but ships neither it nor
you-should-know: both are enabled only in the user's own
`~/.claude/settings.json`. A co-author, a consumer's fresh clone and the
`runner` container on the VPS get neither, so the persistent session and its
subagents work without the rules the rulebook assumes (card *Ship ponytail
(ultra on the VPS) and you-should-know with the harness*,
`3f639875c31b8142b793e3be4527a6a6`). The user, 03.11: ponytail is part of the
harness, used everywhere (answer 1 в); every claude the runner starts as
`agent` runs it at ultra, the board loop's passes included (answer 2); both
plugins ship in this one change (answer 3 б).

## What Changes

- The harness's own `.claude/settings.json` gains `enabledPlugins` with
  `ponytail@ponytail` and `cc-plugin-you-should-know@builtin` set to `true`,
  and `extraKnownMarketplaces.ponytail`: the GitHub source
  `DietrichGebert/ponytail` at `ref: "v5.3.3"`, with `autoUpdate: false`.
- `bun/settings.ts` exports those values and checks them: both plugins
  enabled, other plugins allowed; the `ponytail` marketplace entry equal to
  the harness's whole, other marketplaces allowed.
- `bun/sync-settings.ts` writes them into a consumer's
  `.claude/settings.json`, keeping the consumer's other plugins and
  marketplaces.
- `orchestrator/runner/entrypoint.sh` writes
  `/home/agent/.config/ponytail/config.json` as `agent` on every start, with
  `defaultMode` `ultra`, before it starts the persistent session. The main
  session, its subagents and every pass's session read that file. The
  laptop's and the consumers' levels do not change.
- `orchestrator/runner/session.sh` adds ponytail's marketplace at the pinned
  tag and runs `claude plugin install ponytail@ponytail`, both at local
  scope, in the clone before each start, logging both calls' output: on
  Claude Code 2.1.316 the project's settings alone kept ponytail for the
  first start only (probe and user, 05.11; design.md, D7).
- `README.md` gains a section on the harness's plugins: which, why, what they
  cost, and how to turn one off locally.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: the tracked settings enable the harness's two plugins
  from a pinned marketplace, and the check fails when they do not.
- `harness-updates`: the sync writes the two plugins and the marketplace
  entry, and keeps the consumer's own.
- `orchestrator`: every claude the runner starts as `agent` reads ponytail's
  level as ultra, and the persistent session installs ponytail before each
  start; a pass may run without it (design.md, D5).

## Impact

- Code: `bun/settings.ts`, `bun/sync-settings.ts`,
  `orchestrator/runner/entrypoint.sh`, `orchestrator/runner/session.sh`, and
  their tests.
- Configuration: the harness's `.claude/settings.json`; every consumer's on
  its next sync.
- The user's laptop: in the harness's and consumers' folders, the project's
  `ponytail` marketplace entry replaces the user's own whole, its
  `autoUpdate: true` included. The user keeps their entry as it is (design.md,
  D6; answer 4 а).
- Docs: `README.md`.
- Dependencies: none added to a manifest. ponytail is a plugin pinned by tag,
  outside any manifest. The note beside the pin says what moves it.
