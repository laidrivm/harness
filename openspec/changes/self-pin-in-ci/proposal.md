# self-pin-in-ci

## Why

The harness's own sessions run their hooks and the goal check, and a host
pass runs `board-loop.ts`, from the commit `package.json`'s
`devDependencies.harness` pins, so a merged fix holds nothing until the pin
moves past it. Moving it needs a plain `bun install` to rewrite `bun.lock`,
and `Bash(bun install *)` is an `ask` entry that overrides auto mode: on
2026-11-08 the move to `cd50372` stopped on the user, while the frozen
`bun run deps` fails by design after a re-pin. A re-pin is mechanical and
brings in no outside code, so CI should do it the way the consumers' bump
does (card *Bump the harness's own self-pin in CI, as consumers' bump does,
so a re-pin needs no human approval*, option а). The closest artefact is the
discarded `self-pin-bump` change (removed in #305 and #306), whose step 1
this change restores and whose step 2, `.github/workflows/self-bump.yml`,
never landed.

## What Changes

- `bun/bump.ts` gains a third command, `self`, restored from `self-pin-bump`
  step 1 (`36e9a2c`, removed in `64d84b6`): from the harness's own root it
  targets the `main` head it checked out, once green by `verify`'s rule,
  moves the development pin with `movePin` and rewrites `bun.lock`, then
  commits `package.json` and `bun.lock` alone, with no sync, check or
  `bumpTest`. It changes nothing when the head is not green, is the pin, or
  differs from the pin only as a merged bump does — in `bun.lock` and the
  harness fields of `package.json` — so a merged bump never opens the next.
  It refuses a manifest whose two harness fields hold different pins.
- A new workflow, `.github/workflows/self-bump.yml`, runs `self` after each
  successful `Test` run from a push to `main`, and on `workflow_dispatch`.
  It pushes the commit to one branch, `bump/self-pin`, and opens or updates
  one pull request from it as the board loop's GitHub App, so `Test`, the
  other required checks and CodeRabbit run on it. The body names the old and
  new commits and how many commits the pin moves past. The user merges it.
- README's *Move the pin by hand* line names the workflow and keeps the hand
  move as the fallback.

Left out: merging the bump without the user (card *Auto-merge the self-pin
bump PR without an LLM*); any change to the consumers' `verify` and `land`;
`self-pin-bump`'s lag line in `pass.sh` (the pull request's body carries the
count); any new roll-out code — a merged bump reaches each place the pin is
read by what already runs there (design.md, *Roll-out*).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-updates`: the harness proposes its own pin bump by pull request
  after each green `main`.

## Impact

- `bun/bump.ts` (`bumpSelf`, a commit helper shared with `land`,
  `greenHead` given the commit to ask about), a new `bun/bump-self.test.ts`,
  `bun/bump-pin.ts` exporting `harnessFields` and so `mutation/bump-pin.json`
  and `harness.mutationFloor` re-measured, `bun/bump.fixture.ts`'s header.
- New `.github/workflows/self-bump.yml`; `bun/bun-version.test.ts` already
  reads every workflow's `bun-version`.
- `README.md`.
- **User act, once, by hand** (tasks.md 2.1, design.md D4): create the
  GitHub environment `self-bump` with deployment branches limited to `main`;
  generate a second private key of the App `laidrivm-harness-agent` and store
  it there as the secret `HARNESS_APP_KEY`; set the App's id there as the
  variable `HARNESS_APP_ID`. Then one run by hand and the first merge (2.2).
