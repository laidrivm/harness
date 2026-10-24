# host-deploy

## Why

The host runs `/root/harness` at whatever commit the user last pulled, and
every update is by hand: `git pull`, `docker compose up -d --build` in
`orchestrator/`, and `wmill sync push` from the laptop with a temporary
writing token. The pin in `package.json` already reaches the host by itself,
since each pass checks out `board-loop.ts` at main's pin; the checkout does
not. `pass.sh`, `stop.sh`, the entrypoint, the mint, the event handler baked
from `bun/`, `compose.yaml` and the Windmill scripts move only when the user
remembers to move them (card *Деплой новой версии раннера в CI по изменению
main*, 2026-10-22).

## What Changes

- A root systemd timer on the host runs `orchestrator/deploy.sh` every five
  minutes. When `origin/main`'s head differs from the commit last deployed and
  its `test` check has passed, the script fast-forwards `/root/harness` to it,
  rebuilds the images, recreates what changed with `docker compose up -d`, and
  pushes the Windmill scripts and the route, then records the commit.
- The stack is recreated only while the deploy holds every pass lock, so a
  running pass is never ended: the deploy waits for it, and a tick during the
  deploy reads `busy` and exits 0.
- A deploy that fails after the fast-forward writes each clone's stop file,
  naming the step and the commit, so the failure shows in Windmill's Runs as a
  paused loop. A fetch or a check read that fails writes none and is retried
  on the next tick.
- The unattended push leaves schedules alone: `wmill.yaml` stops including
  them, and README step 6's hand push keeps `--include-schedules`, so the
  deploy never disables the schedule the user enabled.

## Capabilities

### Modified Capabilities

- `orchestrator`: the host deploys main's green head unattended, without
  ending a pass, pausing the loop when the deploy fails, and leaving the
  pass schedule as the engine holds it.

## Impact

- New: `orchestrator/deploy.sh`, `orchestrator/deploy.test.ts`,
  `orchestrator/host/harness-deploy.service`,
  `orchestrator/host/harness-deploy.timer`.
- `orchestrator/windmill/wmill.yaml`: `includeSchedules` dropped.
- `orchestrator/layout.test.ts`: the units and the deploy token's absence
  from `compose.yaml`.
- `orchestrator/README.md`: a step installing the timer and the deploy token.
- Host, by the user: the deploy token file and the timer's install.
- Out of scope: the self-pin's bump (card *Bump the harness's self-pin
  automatically*), a push-driven trigger, rollback beyond a revert merged to
  `main`, and other repositories' hosts.
