# self-pin-bump

## Why

The host's pass runs `board-loop.ts` and `notion-bot.ts` from the commit
`main`'s `devDependencies.harness` pins, so a merged fix reaches the host only
after someone opens a pin pull request by hand (harness#246). On 2026-10-25
the pin `7e740f1` was 28 commits behind `main`, and the first live pass failed
"not a trusted workspace" on a stale pin. Nothing says how far the pin lags.
The consumers' `harness-bump.yml` does not fit the harness itself: `verify`
runs the consumer's sync and check, and `land` pushes to `main`, which the
`main` ruleset refuses without a pull request (card *Bump the harness's
self-pin automatically and report how far it lags `main`*).

## What Changes

- `bun/bump.ts` gains a third command, `self`: from the harness's own root it
  targets `main`'s newest green commit as `verify` does, moves the
  development-dependency pin and `bun.lock` with no sync, check or
  `bumpTest`, and commits. It changes nothing when the head is not green, is
  the pin, or differs from the pin only in `bun.lock` and the pin field of
  `package.json` — the last is what a merged bump looks like, and without it
  every merged bump would open the next one.
- `movePin` moves the pin in each of the two fields that holds it, so a
  manifest with the same pin under both no longer throws.
- `pinOf` reads `devDependencies.harness` when `dependencies` names none, as
  the session-start notice already does.
- A new workflow, `.github/workflows/self-bump.yml`, runs `self` after each
  successful `Test` run on `main` and on `workflow_dispatch`, and pushes the
  commit to one branch, `bump/self-pin`, with one pull request opened or
  updated in place as the board loop's GitHub App, so `Test` and CodeRabbit
  run on it. Its body names how many commits the pin moves past. The user
  merges it.
- `orchestrator/pass.sh` writes, as the first line of a host pass's log, how
  many commits the pin it runs is behind the harness's `main`, when it is.
- README's "The pin moves by hand" sentence describes the workflow instead.

Left out: merging the bump without the user (the `main` ruleset needs an
approval; card *Auto-approve low-blast-radius PRs through deterministic gates
that fail closed* now names this pull request in its scope); a session-start
lag line in the harness's own sessions (the user's answer 3a); any change to
the consumers' `verify`/`land`. The host's checkout follows a merged bump by
`host-deploy` (PR #265), applied first; design.md, *How it meets
host-deploy*.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-updates`: the harness proposes its own pin bump by pull request.
- `orchestrator`: a host pass names how far its harness pin lags `main`.

## Impact

- `bun/bump.ts` (the `self` command, `pinOf` via `bun/bump-pin.ts`), a new
  `bun/bump-self.test.ts`, a case in `bun/bump-pin.test.ts`.
- New `.github/workflows/self-bump.yml`; `bun/bun-version.test.ts` covers its
  `bun-version`.
- `orchestrator/pass.sh` and a new `orchestrator/pass-lag.test.ts`
  (`pass-pin.test.ts` is at 294 lines).
- `README.md`.
- **User act.** A GitHub environment `self-bump` limited to `main`, holding
  the App's id and a second private key of the App.
