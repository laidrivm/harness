## Context

Stage 2.5 of the roadmap (page *Этап 2.5. Короткий путь на VPS*,
`6ddee4d50e7346c397620d7838550f17`) runs one persistent Claude Code session on
the host: tmux session `main` in the `runner` container, as `agent`, in the
clone `/home/agent/harness`, reached by the user through Remote Control. The
old path (Windmill's schedule → `pass.sh` → board loop, and the CI flow's
webhook events) is switched off in this stage and removed at stage 7.

Two trees decide what the session runs:

- `/root/harness`, root's checkout on the host: `compose.yaml` and the
  `runner` image, built from `orchestrator/` and, through the named context
  `bun`, the whole of `bun/` (`orchestrator/runner/Dockerfile`, kept for
  `on-event.ts`). Since `bun/` changes in most merges, most merges make a new
  image.
- `/home/agent/harness`, the session's clone on `main`: the rules, the docs,
  the skills and `bun/` the session runs. The start script of card *Build the
  runner image for the persistent session…*
  (`40c39875c31b8116879bec24abbba0ba`) runs `git pull --ff-only` and
  `bun install` there before each `claude` start, so restarting the session
  updates the clone.

Both are moved by hand today (stage page, step 3 and step 6). On `main` are
tasks 1.1–1.4 of this change's first plan (2026-10-24): `orchestrator/deploy.sh`
with its tests (fetch, the green `test` read, fast-forward, build, pass locks
under a gate, `up -d`, prune, Windmill push, record, clones' stop files) and
the gate in `pass.sh`. No unit, kick or README step exists. Run on the host as
it stands, `deploy.sh` would fail at the push: there is no Windmill token.

`main` is protected by a ruleset: a pull request with one approval. That
approval is the trust a deploy rests on.

## Goals / Non-Goals

**Goals:** a merge to `main` reaches both trees with no act of the user's;
the session is never restarted mid-work; a deploy that leaves no session
behind is undone; a failed deploy is told to the user in the session's chat.

**Non-Goals:** the webhook kick, the Windmill push with a token, schedules
(stage 6); the write-path probe, the full rollback with a stop file and an
escalation card, a session that finishes its work and then updates (stage
9); an agent that repairs a failed deploy (answer 13, after stage 9); moving
the harness pin; another repository's host.

## Decisions

### The timer alone starts the deploy — a revision of answer 12а

`orchestrator/host/harness-deploy.service` is `Type=oneshot` with
`ExecStart=/root/harness/orchestrator/deploy.sh`, run as root, with
`WorkingDirectory=/root/harness/orchestrator`,
`StateDirectory=harness-deploy` and `TimeoutStartSec=3h`, which bounds a hung
build. A run the timeout kills is the one failure after the fast-forward that
writes no failure file: the script is gone before it could. It records
nothing either, the journal names the timeout, and the next tick starts again
from the first step.
`orchestrator/host/harness-deploy.timer` starts it with `OnBootSec=5min` and
`OnUnitInactiveSec=5min`, `[Install] WantedBy=timers.target`. systemd runs one
instance of a unit, so two ticks never deploy at once.

**This revises answer 12а.** On 2026-10-24 the user chose GitHub's webhook
through Windmill, with `ssh` to a forced command, and the five-minute timer as
the backstop. In stage 2.5 the timer alone remains: the stage-2.5 page puts
Windmill events in stage 6 (*Отложено*: «События Windmill и обход PR — этап
6»), and the event handler `on-event.ts` the kick rode on is removed at stage
7. The webhook kick, its key, its forced command and its layout cases move to
stage 6 with the events. What the timer costs is at most five minutes, and
the wait for a fresh session (below) is longer than that in nearly every
case, so answer 1б's «deploy as soon as merged» loses little.

Alternatives, rejected (explore of 2026-11-02): GitHub Actions over `ssh`,
whose key sits in GitHub's secrets (answer 12, not taken); the session
deploying itself, which needs the Docker socket, and with it root on the
host, in agent's hands.

### Only the head of `main`, and only once its `test` check passed

Unchanged from the first plan and on `main`: the script reads the check runs
of the fetched head with `check_name=test&filter=latest` and deploys only when
a run from the `github-actions` app concluded `success`. A pending, failed or
missing check leaves everything as it is. The read is repeated right before
`up`, so a rerun started meanwhile is not deployed under. At most twelve
unauthenticated reads an hour, under GitHub's 60 per address.

### A fast-forward only, and the script runs from a function

Unchanged: `git merge --ff-only origin/main`, then a clean `git status
--porcelain` and `HEAD` equal to the fetched head, before the build. The body
is one function called on the last line, so the fast-forward that rewrites
the file does not change the run in flight.

### The previous image is the one the runner runs

Before the build the script tags the image of the running `runner` container
(`docker inspect` of the container, not of the image name) as
`orchestrator-runner:previous`. Tagging the name instead would be wrong from
the second tick on: a build that waited for a fresh session has already moved
the name to the new image. A tag that fails fails its step (*A failed deploy
is told to the session*). `docker image prune -f` after the record removes
the image the tag held before; the previous one stays until the next deploy
moves the tag (disk, *Risks*).

### Build first, then act only in a fresh session (answer 16 a)

The build runs at once and touches no running container. Then the script
looks for the fresh-session mark in agent's home, through the `agent_home`
volume's mount point, as it already finds the runner's volume. Without the
mark it logs that the session is busy and exits 0; the head is not recorded,
so the next tick tries again, and its build comes from the cache.

The user chose this on the card: «only in a fresh session: after your
`/clear` and before the first message» (user, 02.11, answer 16 a). It matches
the order «card in done → wrapup → `/clear`» and leaves stage 9 its session
that finishes its work and then updates. The mark is checked after the build,
not before it, so the gap in which a message can arrive is seconds, not the
build's minutes.

### The fresh-session mark lives in the container's managed settings

`orchestrator/runner/managed-settings.json` is copied into the image at the
path Claude Code reads managed settings from on Linux
(`/etc/claude-code/managed-settings.json`, confirmed against the Claude Code
docs at apply). It holds two hooks:

- `SessionStart` with matcher `startup|clear`: creates `~/.harness-fresh`,
  and, when `~/.harness-deploy-failed` exists, prints a line asking the
  session to report it to the user in chat, followed by the file. A hook's
  output on `SessionStart` enters the session's context.
- `UserPromptSubmit`: removes `~/.harness-fresh`.

They are inline commands, not a script: two shell lines need no file of
their own. They live in the image, not in the repository's
`.claude/settings.json`, so the laptop never runs them, and they are not the
harness's `SessionStart` hooks that stage 3 adds (`compacted` mark). The
image's hooks move only with a new image, which this deploy builds.

A session restarted by the start script's loop after `claude` exits is
fresh by the same hook; so is the one a deploy restarts, so a second merge
deploys without waiting for the user.

### `up -d`, then a restart when the runner was not recreated

With the mark, the script takes the pass locks as on `main` (inert, below),
reads the check again, and runs `docker compose up -d`. It compares the
`runner` container's id before and after: when `up` did not recreate it (the
image and its configuration unchanged), it runs `docker compose restart
runner`. Either way the start script runs again, pulls the clone, runs
`bun install` and starts `claude`. A restart is chosen over hoping the session
picks up new hooks and skills in place, which is not verified (explore,
*Риски*).

### The session must be back within two minutes, or the runner goes back (answer 17 a)

After `up` the script polls `docker compose exec -T -u agent runner tmux
has-session -t main` every 5 s for at most 120 s. When `main` answers, it
writes the head to `$STATE_DIRECTORY/deployed` (or
`/var/lib/harness-deploy/deployed` for a run by hand, as on `main`), removes
`~/.harness-deploy-failed`, prunes, and exits 0.

When `main` does not answer, the script tags `orchestrator-runner:previous`
back as `orchestrator-runner`, runs `docker compose up -d runner`, writes the
head to `$STATE_DIRECTORY/rolled-back`, writes the failure file, and exits 1.
When the image did not change, there is no other image to go back to: the
record and the failure file alone. The user chose this on the card: «light
rollback: the previous image gets a tag before the build; if `main` is not up
within 2 minutes, go back to it and write a failure file; on start the
session reports it in chat; the full probe with a sandbox and a stop file
stays in stage 9» (user, 02.11, answer 17 a).

A rolled-back head is not retried: each run skips a head equal to either
record. Retrying it would recreate the broken runner every five minutes while
the restored session sits fresh. The next head, a fix merged to `main`, is
deployed as usual. Every other failure is retried in full from the first step,
as answers 7 and 14 settled.

The rollback returns the image, not the clone: the start script has already
pulled it. A tree that keeps `claude` from running while tmux stays up passes
this check; catching it is stage 9's probe.

### A failed deploy is told to the session

`failed()` on `main` names the step and the head on the journal and writes
each clone's stop file. It gains one write before those: the failure file
`~/.harness-deploy-failed` in agent's home, through the volume's mount point,
owned as that home is, so the session can remove it. One line,
`<time> deploy: <step> failed at <sha>`, replacing an older one. Every step
after the fast-forward calls it, the rollback included (a run the service's
timeout kills cannot, *The timer alone starts the deploy*), so a failed build is
reported at the next `/clear` as a rolled-back runner is. A fetch or a check
read that fails writes nothing, as on `main`: the host is still on a working
commit.

This replaces answers 2а and 13, a stop file per clone: stop files were read
by passes, and stage 2.5 runs none (explore, question 17).

### The Windmill push waits for its token

When `secrets/windmill_deploy_token` does not exist, the script logs that the
push is skipped and goes on to the record, skipping the engine wait too. With
the token, the push runs as on `main`. Stage 6 adds the token, drops
`includeSchedules` from `wmill.yaml`, and pins that no long-running container
names the token (answers 3а, 6 and 11, deferred).

### The pass locks stay, inert

`locked()` takes the gate and every `locks/*.lock` before `up`; with no pass
running they are free, and the hold costs nothing. Removing them now would
mean editing code and tests that stage 7 deletes anyway. Their requirement
and scenarios stay in this change's delta spec, since tests on `main` cite
them.

### Hooks move with the pin, not with the deploy — a known limit

The session's harness hooks run from `node_modules/harness`, installed at the
version `package.json` pins. `git pull` does not move that, and `bun install`
moves it only up to the pin. So a merge that changes hook code reaches the
session's rules, docs, skills and `bun/` at once, and its hooks only after a
pull request that bumps the pin. Nothing in this change bumps it (answer 9).

### What stage 7 removes

Code on `main` from tasks 1.1–1.4 that stage 2.5 keeps and stage 7 deletes
with the pass loop:

- the gate in `orchestrator/pass.sh` and `orchestrator/pass-gate.test.ts`;
- in `deploy.sh`, the pass locks (`locked()`, `gate.lock`, the walk over
  `locks/*.lock`) and their `flock` cases in `deploy.test.ts`;
- the clones' stop files in `failed()`, and the `a-stop-file-already-exists`
  case;
- `COPY --from=bun` in the Dockerfile and `additional_contexts: bun` in
  `compose.yaml`, with `on-event.ts`;
- the requirement *A deploy never ends a running pass* in the orchestrator
  spec.

## Risks / Trade-offs

- [A message sent in the seconds between the mark check and the restart is
  lost] → the gap is seconds; the user sees the session restart and resends.
- [Not verified: `SessionStart` fires on a `/clear` from Remote Control;
  `UserPromptSubmit` fires on a message from Remote Control; Remote Control
  reconnects after the restart (a stage criterion)] → task 4.2 watches the
  first deploy for all three.
- [A session never cleared is never updated] → the user's `/clear` at the end
  of a card is the stage's rule; the journal shows the waiting head.
- [The session's clone pulls `origin/main` as it is at the restart, which
  can be a newer head whose `test` has not passed yet] → the next green head
  deploys and restarts again; pulling one exact commit is the image card's
  start script to decide.
- [The previous image stays on a 20 GB disk until the next deploy] → one
  extra image; `prune` drops it once the tag moves.
- [`main` up is not `claude` working] → stage 9's probe.
- [Every merge to `main` runs on the host as root, with no look from the
  user] → the ruleset is the gate; its bypass list must name no App and no
  bot (task 4.3).
- [The build on 2 vCPU runs beside the session's subagents' tests] → it runs
  once per green head, cached on the ticks after.

## Migration Plan

Merge after the image card, then the user's acts in tasks.md group 4:
`systemctl link` both units from `/root/harness/orchestrator/host/`,
`systemctl enable --now harness-deploy.timer`. The first run deploys the head,
since nothing is recorded, at the next `/clear`. To stop deploys:
`systemctl disable --now harness-deploy.timer`. To retry a rolled-back head:
remove `/var/lib/harness-deploy/rolled-back`.

## Settled on the card

- 16 a (user, 02.11): restart only in a fresh session.
- 17 a (user, 02.11): light rollback, failure file reported in chat.
- 12а (2026-10-24): revised above, the timer alone in stage 2.5, the kick in
  stage 6.
- 1б: a merge deploys without the user, within a tick of a fresh session.
- 2а, 13: replaced by the failure file (17 a).
- 3а, 6, 11: the push with a host-held token, no schedules: stage 6.
- 4 (only a green head), 7 and 14 (a failure reruns from the first step, a
  rolled-back head excepted), 8 (prune), 9 (pin untouched), 10 (the bypass
  list, task 4.3): stand.
- 5 (`up` under the pass locks): kept inert, removed at stage 7.
- 15б: superseded on 2026-10-25, unchanged.
