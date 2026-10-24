## Context

Two things decide what the host runs. The pin in `package.json` decides the
board loop: `pass.sh` (`orchestrator/pass.sh:176-186`) fetches and checks out
main's pin on every pass, so it needs no deploy. The checkout at
`/root/harness` decides everything else: the runner image bakes `pass.sh`,
`stop.sh`, `clone-name.sh`, the entrypoint, sudoers, `as-agent`, `mint`,
`reach-check.sh` and the whole of `bun/` for the event handler
(`orchestrator/runner/Dockerfile`, the `COPY` lines); `compose.yaml` holds the
stack and its image pins; `orchestrator/windmill/` holds the pass script, the
event script, the schedule and the webhook route, pushed by hand from the
laptop with a writing token deleted afterwards (README step 6).

`main` is protected by a ruleset: a pull request with one approval, which only
the user gives (`cloud-sessions` design, decision 2). That approval is the
trust a deploy can rest on.

Overlap: card *Bump the harness's self-pin automatically* moves the pin; this
change moves the checkout. They touch no common file. A merged pin bump is a
commit on `main` like any other: the deploy fast-forwards to it and the build
reuses every cached layer, since `package.json` is in no build context.

## Goals / Non-Goals

**Goals:** a merged pull request reaches the host's images, stack and engine
scripts with no act of the user's; a running pass is never cut; a failed
deploy is visible where the user already looks.

**Non-Goals:** a push-driven trigger; rollback other than a revert merged to
`main`; deploying another repository's host; moving the Windmill schedule;
the self-pin's bump.

## Decisions

### A root timer on the host pulls; nothing pushes to the host

`orchestrator/host/harness-deploy.timer` starts
`harness-deploy.service` five minutes after boot and five minutes after each
run ends; the service is `Type=oneshot` and runs
`/root/harness/orchestrator/deploy.sh` as root, so ticks never overlap.

Alternatives, rejected:
- GitHub Actions on a push to `main`, over SSH: a root key in GitHub's secrets
  and an SSH route through the tunnel, so a leaked CI secret is root on the
  host.
- A Windmill job, or the pass itself: both run in containers without the
  Docker socket, and handing them the socket hands root on the host to the
  engine or to the runner the agent shares.
- GitHub's push webhook through the existing route: faster, but the handler
  runs in the runner and still needs a root actor on the host to rebuild, so
  it adds a hand-off to the timer it cannot replace.

A poll is one `git fetch` and one unauthenticated read of a public
repository's check runs: twelve an hour, under the 60 an hour GitHub allows an
address.

### Only the head of `main`, and only once its `test` check passed

The script reads
`https://api.github.com/repos/<owner>/<repo>/commits/<sha>/check-runs?check_name=test`
for the fetched head, the owner and repository parsed from the checkout's
origin, and deploys only when a run concluded `success`. A pending, failed or
missing check leaves everything as it is; the next tick reads it again. An
older green commit is never deployed in its place: the next green head
supersedes it.

### The deployed commit is recorded outside the tree, after the last step

`StateDirectory=harness-deploy` gives `/var/lib/harness-deploy/`; the script
writes the head there only once the push has succeeded. The tick compares
`origin/main`'s head with that file, never with `HEAD`, so a deploy that
failed after the fast-forward is retried in full on the next tick: every step
is idempotent, and a build with nothing new reuses its cache.

### A fast-forward only

`git merge --ff-only origin/main` in `/root/harness`. A tracked change or a
local commit makes it fail, which pauses the loop (below); the user resolves
it on the host. `secrets/`, `app/`, `app-key/` and `wmill-lock.yaml` are
already ignored, so the files the stack needs never block it.

### The script runs from a function, so its own update cannot change the run

The body is one function called on the last line. Bash has parsed the whole
of it before the fast-forward rewrites the file, so the run in flight is the
old version end to end, and the next tick runs the new one.

### Build first, then recreate under every pass lock

`docker compose build` runs with no lock: it is the long step and touches no
running container. Then one background
`docker compose exec -T -u runner runner` takes, blocking, every
`/home/runner/orchestrator/locks/*.lock` with `flock` and prints one line once
it holds them all; the script waits for that line, runs `docker compose up -d`,
then ends the holder if the runner was not recreated. A pass that was running
ends first, since the blocking `flock` waits for it; a tick during the hold
reads `busy` and exits 0 (`pass.sh:126-130`). The service's
`TimeoutStartSec` is 2 h, above the pass's 5400 s timeout.

Waiting for idle and then recreating was the smaller alternative, rejected:
a pass started by hand between the check and `up` would be killed mid-step.

A recreated Windmill worker drops the pass job's SSH connection; the pass
already survives that (`pass.sh:193`), but no pass runs then anyway.

`docker image prune -f` follows `up`: a rebuild below the last layer leaves
the old 6 GB image dangling, and the host's disk is 20 GB.

### The Windmill push runs in a one-off container, with a token only root reads

After `up`, the script runs the push in a throwaway container of the runner
image just built, on the compose network, never through the tunnel:
`docker run --rm --network orchestrator_default` with
`orchestrator/windmill/` mounted and the token file mounted read-only, running
`bun x windmill-cli@<v> sync push --yes --skip-secrets --include-triggers`
against `http://engine:8080`, workspace `harness-admin`. `<v>` is read from
the `windmill_server` image in `docker compose config --format json`, so the
CLI and the engine move together and no second pin exists. The token is read
inside the container from the mounted file, so no host process's arguments
carry it.

The token sits in `orchestrator/secrets/windmill_deploy_token`, root's, 0400,
and no `secrets:` entry in `compose.yaml` names it, so no long-running
container receives it. A writing token on the host is no new power: root
there already owns the engine's database. `--yes` answers the plan
unattended; the push is scoped to `f/orchestrator/**` and skips variables,
resources and secrets (`wmill.yaml`), so a `-` line only removes a script the
tree removed.

### The unattended push writes no schedule

`layout.test.ts` pins the schedule at `enabled: false`, so a fresh host is
pushed with the loop off until the reach check passes. Pushing the schedule on
each deploy would disable the one the user enabled. So `wmill.yaml` drops
`includeSchedules: true`; README step 6's hand push already passes
`--include-schedules`, so a fresh install is unchanged. A change to the
schedule stays a hand push.

### A failed deploy pauses each clone

When a step after the fast-forward fails, the script writes, as `runner`,
`/home/runner/orchestrator/<clone>.stop` for each directory under
`/home/agent/clones/` that has no stop file, holding
`<time> deploy: <step> failed at <sha>`. Every later tick fails in Runs with
the paused line, which is where the user already looks (README step 7). A
failed fetch or check read pauses nothing: the host is still on a working
commit. If the runner itself is down, the exec fails too; the ticks then fail
on SSH, which Runs shows as well.

## Risks / Trade-offs

- [A merged pull request runs as root on the host within minutes, with no
  look from the user] → the `main` ruleset is the gate; its bypass list must
  name no App and no bot (assumption, checked by the user).
- [`bun x windmill-cli@<v>` resolves its dependencies from npm at deploy
  time] → the same exposure as README step 6's `bun add -g`, now unattended;
  the version is exact.
- [A docs-only commit still waits for a running pass before `up`] → a deploy
  is not urgent, and `up` with nothing changed recreates nothing.
- [Whether a push without schedules leaves the live schedule untouched is
  read from the CLI's help, not run] → task 3.2 probes it on the host before
  the timer is enabled.

## Migration Plan

Merge, then the user's acts in README's new step: write the deploy token,
`systemctl link` both units, `systemctl enable --now harness-deploy.timer`.
The first tick deploys the head, since nothing is recorded yet. To stop
deploys: `systemctl disable --now harness-deploy.timer`.

## Open Questions

On the card: the trigger (timer, CI over SSH, or webhook), the failure signal
(pause, journal only, or a line in each pass log), and whether the Windmill
push is in the deploy or stays the laptop's.
