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

The webhook path exists already (`ci-run-agent`, README steps 1 and 10).
`https://<hostname>/api/r/github` is the one path a Cloudflare Access
application with a Bypass policy leaves open, so GitHub reaches it without the
service-token headers the rest of the hostname needs. The route
(`github.http_trigger.yaml`) is async and unauthenticated in Windmill; its
script `f/orchestrator/event` hands the three headers and the raw body over
`ssh` to the runner, whose `bun/on-event.ts` checks `X-Hub-Signature-256`
against `secrets/github_webhook_secret` before anything else and exits 2 on a
mismatch, 1 on a failure and 0 otherwise. On 2026-10-25 this repository has no
webhook (`gh api repos/laidrivm/harness/hooks` lists none).

## Goals / Non-Goals

**Goals:** a merged pull request reaches the host's images, stack and engine
scripts with no act of the user's, as soon as its `test` passes; a running
pass is never cut; a failed deploy is visible where the user already looks.

**Non-Goals:** rollback other than a revert merged to `main`; deploying
another repository's host; moving the Windmill schedule; the self-pin's bump;
repairing a failed deploy without the user (card *Start an agent on the host
to fix a failed deploy*).

## Decisions

### One root service, started by the webhook at once and by a timer as the backstop

`orchestrator/host/harness-deploy.service` is `Type=oneshot` and runs
`/root/harness/orchestrator/deploy.sh` as root. Two things start it:

- the kick (next decision), within seconds of `main`'s `test` passing;
- `orchestrator/host/harness-deploy.timer`, five minutes after boot and five
  minutes after each run ends, for a delivery GitHub dropped, a kick that
  failed, or a head that turned green while a deploy ran.

The user chose this on the card (answer 12а): the deploy follows a merge at
once, and the key that reaches the host never leaves it.

Alternatives, rejected:
- GitHub Actions on a push to `main`, over SSH, even with a forced command:
  the key sits in GitHub's secrets and the host needs an SSH route through
  the tunnel (answer 12б, not taken).
- The timer alone (answer 1а): up to five minutes late; the user wants the
  deploy right after the merge (answer 1б).
- A Windmill job, or the pass itself, running the deploy: both run in
  containers without the Docker socket, and handing them the socket hands
  root on the host to the engine or to the runner the agent shares.

A poll is one `git fetch` and, only while the head differs from the commit
last deployed, one unauthenticated read of a public repository's check runs:
at most twelve an hour from the timer, under the 60 an hour GitHub allows an
address.

### The kick: the existing route, the existing signature check, then one `ssh`

The kick rides on GitHub's `workflow_run` delivery, not on `push`: at the push
the head's `test` is still pending, so a deploy started then deploys nothing
(*Only the head of `main`*, below) and the merge waits for the timer. A `workflow_run`
completing with `success` on `main` is the moment the head becomes
deployable. The webhook is README step 10's, added to this repository: payload
URL `/api/r/github`, the same secret file, the *Workflow runs* event.

`event.ts` keeps its order: hand the delivery to the runner's handler, and
throw on a non-zero exit, so a refused signature kicks nothing. After an exit
0, which only a body whose HMAC matched can reach, it parses that same body,
and when the delivery is `workflow_run`, `action` is `completed`,
`workflow_run.conclusion` is `success`, `workflow_run.event` is `push` and
`workflow_run.head_branch` is `repository.default_branch`, it runs

    ssh -i <key> -o BatchMode=yes -o StrictHostKeyChecking=yes
        -o UserKnownHostsFile=/run/secrets/runner_known_hosts
        root@host.docker.internal

The key is a new secret variable, `f/orchestrator/host_deploy_key`, read by
its path as the event key is. Its public half sits in root's
`authorized_keys` as

    restrict,from="<the compose network's subnet>",command="systemctl start --no-block harness-deploy.service" ssh-ed25519 …

so the key starts the service and nothing else: no shell, no pty, no
forwarding, no argument reaches the host (the forced command ignores
`SSH_ORIGINAL_COMMAND`), and only from the compose network.
`--no-block` returns at once, so the job does not wait for the deploy and a
deploy that recreates the worker does not cut it. The host's ed25519 key is
one more line of `runner_known_hosts`, under the name `host.docker.internal`,
which the default worker gets from `extra_hosts: host-gateway`.

The handler's signature check is the one copy: the secret stays in its one
file and the HMAC in `on-event.ts`, so no second copy can drift. The kick
carries no data, so a delivery for another repository the loop serves, a
duplicate, or a green run of a workflow other than `Test` costs at most one
`git fetch` and one check read: `deploy.sh` reads everything it acts on from `origin` and the
check runs, never from the delivery.

- *Alternative: a second route with its own Access bypass, verifying the HMAC
  in the Windmill script under a secret variable.* A second opening in
  Access, a second copy of the secret and of the check.
- *Alternative: the runner's handler sends the kick.* The runner is the
  agent's container; a host key there is one sudo rule away from the agent.

### Two triggers never run two deploys

Both triggers start the same `Type=oneshot` unit, and systemd runs one
instance of a unit: a start while a run is active joins that run. So the
webhook and the timer never deploy at once, and a kick during a deploy adds
nothing. Each run compares `origin/main`'s head with the recorded commit, so
a second run on a deployed head ends after its fetch. A head that turned
green during a run is the timer's, at most five minutes after that run ends.

### Only the head of `main`, and only once its `test` check passed

The script reads
`https://api.github.com/repos/<owner>/<repo>/commits/<sha>/check-runs?check_name=test&filter=latest`
for the fetched head, the owner and repository parsed from the checkout's
origin, and deploys only when a run there from the `github-actions` app
concluded `success`, as `bun/bump.ts` reads the same check. `filter=latest`
keeps only each suite's latest run, so a green run that a rerun superseded
counts for nothing while the rerun is pending or failed. A pending, failed or
missing check leaves everything as it is; the next tick reads it again. An
older green commit is never deployed in its place: the next green head
supersedes it.

The read is the step right before the fast-forward, and the script reads the
check again once it holds the locks, right before `up`: a rerun started
during the build or the wait for a pass would otherwise be deployed under.
A check no longer green there releases the locks and ends the run with no
`up`, no record and no stop file; the tree is on the head, the containers on
the old images, and the next green read deploys it.

### The deployed commit is recorded outside the tree, after the last step

`StateDirectory=harness-deploy` gives `/var/lib/harness-deploy/`, which the
script reads from `STATE_DIRECTORY` and creates itself with `mkdir -p` when
the variable is unset, since the first run by hand (task 4.2) is not the
service's and systemd creates nothing for it. The script writes the head
there only once the push has succeeded. Each run compares
`origin/main`'s head with that file, never with `HEAD`, so a deploy that
failed after the fast-forward is retried in full on the next tick: every step
is idempotent, and a build with nothing new reuses its cache. The user
confirmed this on the card (answers 7 and 14): a failed step is not resumed;
the next run, a kick or a tick, starts again from the first step.

### A fast-forward only

`git merge --ff-only origin/main` in `/root/harness`, then two checks before
the build: `git status --porcelain` prints nothing, and
`git rev-parse HEAD` equals the fetched head. The merge alone is not enough:
on a checkout with a local commit over `origin/main` it reports "Already up
to date" and exits 0, and a tracked edit or an untracked file it does not
touch survives it, so the build (its contexts `.` and `../bun` take whole
directories) would run a tree that is not the green head. Either check
failing fails the step, which pauses the loop (below); the user resolves it
on the host. `secrets/`, `app/`, `app-key/` and `wmill-lock.yaml` are
already ignored, so the files the stack needs never block it.

### The script runs from a function, so its own update cannot change the run

The body is one function called on the last line. Bash has parsed the whole
of it before the fast-forward rewrites the file, so the run in flight is the
old version end to end, and the next tick runs the new one.

### Build first, then recreate under every pass lock

`docker compose build` runs with no lock: it is the long step and touches no
running container. Then the script takes the locks itself, from the host,
on the runner volume's files: `docker volume inspect` gives
`orchestrator_runner_home`'s mount point, and `locks/` under its
`orchestrator/` is the directory `pass.sh` locks in. `flock` is the kernel's,
so a lock root takes on the host excludes the one `runner` takes in the
container, and no recreated container can release it: the holder is the
deploy's own process, which `up` never touches.

The set of lock files is closed by a gate. `pass.sh` gains one lock before
its repository's: it opens `locks/gate.lock`, takes it exclusively with
`flock -w 10`, takes its repository lock as today, then closes the gate, so
it holds the gate only while it takes its own lock. A gate it cannot take in
10 s is `busy`, exit 0, as a held repository lock is. The deploy takes the
gate, blocking, then every `locks/*.lock` but the gate, blocking, runs
`docker compose up -d`, and releases them all when the step ends. While the
deploy holds the gate no pass can create a lock file, so the files it
enumerates are every lock a pass can hold, including a repository's first
pass. A pass that was running ends first, since the blocking `flock` waits
for it; a pass tick during the hold reads `busy` and exits 0. The pass never
takes the gate while it holds its repository lock, so the two never
deadlock, and the gate's 10 s wait covers two passes starting at once.

The script holds each lock on fd 9 of a nested redirection, one level per
file: bash keeps the enclosing level's descriptor open on another number while
the inner one runs, so every lock is held until the levels return, with no
`{fd}` form that bash 3.2, the macOS one the tests also run under, lacks. It
creates `locks/gate.lock` when absent, owned as the runner's home is, since a
pass opens it for writing as `runner` (decided at apply).

`bun/ci-run.ts` takes a repository lock too, for a failed run's flow
(`ci-run-agent`): today with a blocking `flock -w 7200` on
`locks/<repo>.lock`, which it creates when absent. That wait goes: it gains
the gate, held only for an attempt, as a pass holds it. One `sh` loop opens
and takes the gate with `flock -w <remaining>`, tries the repository lock
with `flock -n`, and closes the gate's descriptor either way. The gate's
waits share one budget of 14400 s across all attempts: each wait gets what
the earlier ones left, and a budget run out, or a wait that times out, ends
the run with exit status 75. A lock it took stays held as it execs the
flow, which keeps holding the repository lock alone. The loop makes at most
1440 attempts and sleeps 5 s after each busy one but the last: 1439 sleeps,
7195 s, today's 7200 s to within one sleep, counted in the sleeps, so time
spent waiting on a deploy's gate does not use it up. A last attempt that
finds the lock busy ends the run at once with exit status 75, as today's
bound does. A flow that arrives during the hold waits
for the deploy instead of creating a lock file the deploy did not
enumerate; a flow that waits for a running pass holds the gate for a moment
per attempt, so other repositories' ticks and the deploy are not kept out
while it waits. The user chose this on the card (answer 15б: «15. ок, давай
б»). The gate's budget is its own, 4 h, above the 3 h the service's timeout
bounds the deploy's hold at, so a deploy that waits out a full pass never
runs the flow's bound out and drops the delivery; holds that together pass
4 h end the flow with 75 rather than outliving its job. The Windmill event
job waits for the flow's verdict, so its `timeout` in `event.script.yaml`
grows from 11700 to 26100 s: the 14400 s of gate waits, the 7195 s of
retries, the hour a fix runs and 900 s for the ssh and setup, rounded up.
Both budgets are spent in full at most once, so the job outlasts the flow's
longest run.

The service's `TimeoutStartSec` is 3 h: the unlocked build, up to the pass's
5400 s timeout waiting for the locks, then `up`, the prune and the push, with
an hour left for the steps around the wait. A run the timeout kills writes no
stop file and records nothing, so the next tick starts again from the first
step.

Alternatives, rejected:
- Waiting for idle, then recreating: a pass started by hand between the
  check and `up` would be killed mid-step.
- Holding the locks through `docker compose exec` in the runner: `up`
  recreates the runner and ends the holder with it, so the locks drop while
  `up` still recreates other services.
- One lock that each pass holds shared for its whole run: Linux `flock`
  grants a new shared lock while an exclusive one waits, so overlapping
  passes could keep the deploy out for good.
- The flow holding the gate through a blocking `flock -w 7200` on its
  repository lock (answer 15а, not taken): while a pass holds that lock, up
  to 1.5 h, every other repository's tick reads `busy` and the deploy waits.

A recreated Windmill worker drops the pass job's SSH connection; the pass
already survives that (`pass.sh:193`), but no pass runs then anyway.

`docker image prune -f` follows `up`: a rebuild below the last layer leaves
the old 6 GB image dangling, and the host's disk is 20 GB. A prune that fails
is logged and fails nothing: the stack already runs the head (decided at
apply).

### The Windmill push runs in a one-off container, with a token only root reads

After `up`, the script runs the push in a throwaway container of the runner
image just built, on the compose network, never through the tunnel:
`docker run --rm --network orchestrator_default --entrypoint sh` with
`orchestrator/windmill/` mounted and the token file mounted read-only, both
with `--mount`, which fails on a missing file where `-v` would create a
directory in its place. The `sh` reads the token into `WM_TOKEN` and execs
`bun x windmill-cli@<v> sync push --yes --skip-secrets --include-triggers`,
which, with no workspace profile in the container, takes the engine and the
workspace from `BASE_INTERNAL_URL=http://engine:8080` and
`WM_WORKSPACE=harness-admin` (windmill-cli 1.846.1, `resolveWorkspace`;
decided at apply). The entrypoint is
replaced because the image's `entrypoint.sh` exits 1 unless the runner's
three secret files are mounted, and the push needs none of them. `up -d`
does not wait for the engine, which has no health check, so before the push a
container of the same image, the same way, polls
`http://engine:8080/api/version` with `curl` until it answers, for at most
two minutes; an engine that never answers fails the push step. `<v>` is read from
the `windmill_server` image in `docker compose config --format json`, so the
CLI and the engine move together and no second pin exists. The token is read
inside the container from the mounted file, so no host process's arguments
carry it. That JSON and the check runs are parsed by the runner image's `jq`,
in a one-off container, so the host needs no `jq` of its own (decided at
apply).

The user chose the push in the deploy, with a token that stays on the host
(answer 3а), over keeping it the laptop's hand push.

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

When a step after the fast-forward fails, the script writes
`/home/runner/orchestrator/<clone>.stop` for each directory under
`/home/agent/clones/` that has no stop file, holding
`<time> deploy: <step> failed at <sha>`. Every later tick fails in Runs with
the paused line, which is where the user already looks (README step 7). A
failed fetch or check read pauses nothing: the host is still on a working
commit. It writes them from the host, on the two volumes' mount points, and
gives each the owner of the runner's home, so a stop file lands even when the
runner is down, and `runner` can still replace or remove it (decided at apply,
in place of an exec in the runner, which a runner `up` left down would fail).

The user chose this signal (answer 2а) once answer 13 named when it fires:
the tree is on the new commit, but the build, `up` or the push failed, so the
containers are old or gone. The stop file holds the loop until the user looks.
An agent on the host that takes such a failure and repairs it is its own card,
*Start an agent on the host to fix a failed deploy* (roadmap D); this change
only leaves it the stop file's line and the journal to start from.

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
  read from the CLI's help, not run] → task 4.2 probes it on the host before
  the timer is enabled.
- [Anyone can POST to the bypassed path] → as today, the handler refuses an
  unsigned body before any kick; a kick itself carries nothing, so the worst
  a valid but unwanted delivery does is one fetch and one check read.
- [The webhook on this repository also starts `ci-run-agent`'s flow for the
  loop's failing pull requests here] → step 10 already means it for every
  repository the loop serves, and this one is served (an assumption of this
  change; disabling the webhook stops both, and the timer still deploys).
- [The worker reaches the host's `sshd` on the bridge] → `from=` holds the key
  to the compose network; the host's `sshd` must listen there, which the
  user's first kick (task 4.4) shows.

## How it meets self-pin-bump

Card *Bump the harness's self-pin automatically* (`self-pin-bump`, PR #264)
and this change are complementary, kept as two changes:

- **Triggers.** Both start on a successful `Test` run on `main`: its workflow
  in GitHub Actions, this kick on the host. Neither waits for the other.
- **What each moves.** That change moves the pin, which the pass reads from
  `main` on every pass (`pass.sh:176-186`), so a merged bump reaches the board
  loop with no deploy. This change moves the checkout: the images, the stack
  and the engine scripts. A merged bump is a `main` commit like any other;
  this deploy fast-forwards to it and the build reuses every cached layer,
  since `package.json` is in no build context.
- **Files.** One: both edit `orchestrator/pass.sh`, in different places —
  this one the gate before the repository lock (`pass.sh:121-126`), that one
  the lag line after the pin checkout (`pass.sh:177-186`). Whichever merges
  second merges `main` first. This change also bakes `pass.sh` into the image
  by each deploy, so that change's lag line reaches the host with no hand
  rebuild.
- **User acts.** Unrelated: a GitHub environment with a second App key there;
  a host token, a host key, units and a webhook here.
- **Order.** Apply this one first: then `self-pin-bump`'s `pass.sh` edit, and
  every later fix, reach the host on their merge.

Glued, the two proposals pass 800 lines and mix two sets of user acts in one
review, so they stay apart.

## Migration Plan

Merge, then the user's acts in tasks.md group 4: write the deploy token,
`systemctl link` both units, `systemctl enable --now harness-deploy.timer`;
add the kick key and its variable, the host's line in `runner_known_hosts`,
and the webhook. The first run deploys the head, since nothing is recorded
yet. That run still meets the old runner, whose `pass.sh` and `ci-run.ts`
take no gate: a repository with no lock file could start its first pass or
flow after the deploy lists `locks/`, and `up` would cut it. So task 4.2
first makes sure every served repository has its lock file; the deploy then
holds them all, and from its `up` on the gate closes the set. To stop deploys: `systemctl disable --now harness-deploy.timer` and
remove the kick key's line from `authorized_keys`.

## Settled on the card

All answered on 2026-10-25: the trigger is the webhook kick with the timer as
the backstop (12а); a failed deploy writes each clone's stop file (2а, 13);
the deploy pushes the Windmill scripts with a host-held token (3а); every
step reruns from the first after a failure (7, 14); decisions 4–6 and 8–11
stand as written. Answered at apply, on 2026-10-25: a failed run's flow
holds the gate only while it tries its repository lock, without blocking,
and retries within the same 7200 s, which time spent waiting on the gate
does not use; the gate's waits have a 14400 s budget of their own across
all attempts (15б: «15. ок, давай б»).
