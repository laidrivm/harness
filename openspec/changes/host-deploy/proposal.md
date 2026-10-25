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

- One root service on the host, `harness-deploy.service`, runs
  `orchestrator/deploy.sh`. Two triggers start it. At once: GitHub's
  `workflow_run` delivery for a successful run on `main` reaches the existing
  route `/api/r/github`, the runner's handler checks its signature as it does
  today, and then Windmill's event script runs `ssh` to the host with a key
  whose forced command only starts the service. As the backstop: a root timer
  every five minutes. When `origin/main`'s head differs from the commit last
  deployed and its `test` check has passed, the script fast-forwards
  `/root/harness` to it, rebuilds the images, recreates what changed with
  `docker compose up -d`, and pushes the Windmill scripts and the route, then
  records the commit.
- The stack is recreated only while the deploy holds every pass lock, taken
  from the host on the runner volume's files behind a gate lock no pass can
  pass meanwhile, so a running pass is never ended: the deploy waits for it,
  and a tick during the deploy reads `busy` and exits 0. Before the build the
  checkout must be clean and at the fetched head, not merely fast-forwarded.
- A deploy that fails after the fast-forward writes each clone's stop file,
  naming the step and the commit, so the failure shows in Windmill's Runs as a
  paused loop. A fetch or a check read that fails writes none and is retried
  on the next tick.
- The unattended push leaves schedules alone: `wmill.yaml` stops including
  them, and README step 6's hand push keeps `--include-schedules`, so the
  deploy never disables the schedule the user enabled.

## Capabilities

### Modified Capabilities

- `orchestrator`: the host deploys main's green head unattended, as soon as
  its `test` passes, without ending a pass, pausing the loop when the deploy
  fails, and leaving the pass schedule as the engine holds it.

## Impact

- New: `orchestrator/deploy.sh`, `orchestrator/deploy.test.ts`,
  `orchestrator/host/harness-deploy.service`,
  `orchestrator/host/harness-deploy.timer`.
- `orchestrator/windmill/f/orchestrator/event.ts`: after the handler exits 0
  on a successful `main` run, the kick over `ssh`; a new
  `orchestrator/event-kick.test.ts`.
- `orchestrator/compose.yaml`: `host.docker.internal` on the default worker.
- `orchestrator/pass.sh`: a gate lock taken for the moment it takes its
  repository lock, so the deploy, holding the gate, holds every lock a pass
  can take; cases in `orchestrator/pass.test.ts`. `bun/ci-run.ts` takes no
  gate: it stops being a flow of its own in v2 (design.md, *A failed run's
  flow stays outside the gate*).
- `orchestrator/windmill/wmill.yaml`: `includeSchedules` dropped.
- `orchestrator/layout.test.ts`: the units, the worker's host entry and the
  deploy token's absence from `compose.yaml`.
- `orchestrator/README.md`: a step installing the service, the timer, the
  deploy token and the kick key; step 10's webhook on this repository too.
- Host and GitHub, by the user: the deploy token file, the kick key's
  `authorized_keys` line and its Windmill variable, the host's line in
  `runner_known_hosts`, the units' install, and the webhook on this
  repository. Cloudflare Access is unchanged: the route already has its
  bypass.
- Out of scope: the self-pin's bump (card *Bump the harness's self-pin
  automatically*, discarded; design.md, *The self-pin's bump*), rollback
  beyond a revert merged to `main`, an agent that repairs a failed deploy
  (its own card), and other repositories' hosts.
