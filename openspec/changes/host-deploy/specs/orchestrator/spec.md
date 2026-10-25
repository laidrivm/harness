## ADDED Requirements

### Requirement: The host deploys main's green head and nothing else

On each run, whether the kick or the timer started it, the host's deploy
SHALL compare `origin/main`'s head with the
commit it last deployed. When they differ and the head's latest `test` check
run from `github-actions` has concluded `success`, it SHALL fast-forward the
host's checkout to that head, rebuild the images, bring the stack up, push the
Windmill scripts and route, and only then record the head as deployed. It
SHALL deploy no other commit.

#### Scenario: Main has not moved

- **WHEN** a run finds `origin/main`'s head equal to the commit last
  deployed
- **THEN** the checkout, the images and the engine are unchanged

#### Scenario: The head's test check has not passed

- **WHEN** the head's `test` check is pending, failed or absent
- **THEN** the checkout is not moved, and the next tick reads the check again

#### Scenario: A rerun after a green run

- **WHEN** the head's `test` run succeeded and a later rerun of it is pending
  or failed
- **THEN** the checkout is not moved

#### Scenario: A green head

- **WHEN** the head differs from the commit last deployed and its `test`
  check concluded `success`
- **THEN** the checkout is at the head, the stack runs images built from it,
  the engine holds its scripts and route, and the head is recorded as deployed

#### Scenario: The checkout cannot fast-forward

- **WHEN** the checkout has a tracked change or a commit `origin/main` does
  not hold, whether or not the fast-forward itself succeeds
- **THEN** nothing is rebuilt, the head is not recorded, and the deploy fails

### Requirement: A green run on main starts the deploy at once

After the runner's handler exits 0 for a `workflow_run` delivery whose run
completed with `success`, from a push, on the repository's default branch, the
event job SHALL start the host's deploy service over `ssh` with a key whose
forced command starts that service alone, and SHALL end without waiting for
the deploy. It SHALL start nothing for any other delivery, or when the
handler exits non-zero. The timer SHALL start the same service, and the two
SHALL never run two deploys at once.

#### Scenario: Main's test passes

- **WHEN** the handler exits 0 for a `workflow_run` delivery completed with
  `success` from a push to the default branch
- **THEN** the job runs `ssh` to `root@host.docker.internal` with the kick key
  and the pinned host key, and ends once that returns

#### Scenario: A delivery that is no green main run

- **WHEN** the handler exits 0 for another event, a run that did not succeed,
  a run on another branch, or a run started by a pull request
- **THEN** the job runs no `ssh` to the host

#### Scenario: A refused delivery

- **WHEN** the handler exits non-zero
- **THEN** the job fails and runs no `ssh` to the host

#### Scenario: The worker reaches the host

- **WHEN** `compose.yaml` is read
- **THEN** the default worker maps `host.docker.internal` to the host gateway

#### Scenario: A kick during a deploy

- **WHEN** the kick starts the service while a run is active
- **THEN** that run is the only deploy, and a head that turned green during it
  is deployed by the timer's next run

### Requirement: A deploy never ends a running pass

The deploy SHALL recreate containers only while it holds, from a process no
container recreation ends, the pass gate and every pass lock, waiting for a
running pass to release its lock. A pass, and a failed run's flow in
`ci-run.ts`, SHALL take its repository lock only while it holds the gate, so
no lock file appears during the hold. A tick that starts during the hold SHALL
find its repository busy; a flow SHALL wait for the gate.

#### Scenario: A pass is running when main moves

- **WHEN** a green head arrives while a pass holds its repository's lock
- **THEN** the deploy brings the stack up only after that pass has ended, and
  the pass's log ends as the pass ended it

#### Scenario: A tick during the deploy

- **WHEN** the pass schedule fires while the deploy holds the locks
- **THEN** the wrapper prints `busy` and exits 0, and writes no stop file

#### Scenario: A repository's first pass during the deploy

- **WHEN** a pass for a repository with no lock file yet starts while the
  deploy holds the gate
- **THEN** it creates no lock file, prints `busy` and exits 0

#### Scenario: A failed run's flow during the deploy

- **WHEN** `ci-run.ts` starts a flow for a repository while the deploy holds
  the gate
- **THEN** it creates and takes no repository lock until the deploy releases
  the gate

#### Scenario: The runner is recreated under the locks

- **WHEN** `docker compose up -d` recreates the runner during the hold
- **THEN** the locks stay held until `up` has finished

### Requirement: A failed deploy pauses the loop

When a step after the fast-forward fails, the deploy SHALL write each clone's
stop file, unless one exists, naming the deploy, the failed step and the
commit, and SHALL not record the commit as deployed. A fetch or check read
that fails SHALL write no stop file.

#### Scenario: The build fails

- **WHEN** the image build fails for a green head
- **THEN** every clone's stop file names the deploy, the build and the head,
  the head is not recorded, and the next tick retries the deploy

#### Scenario: GitHub cannot be reached

- **WHEN** the fetch or the check read fails
- **THEN** no stop file is written and the next tick tries again

#### Scenario: A stop file already exists

- **WHEN** a clone's stop file exists as the deploy fails
- **THEN** that file is left as it was

### Requirement: The deploy leaves the pass schedule as the engine holds it

The deploy's push SHALL write scripts and triggers and no schedule, so a
schedule the user enabled in the engine stays enabled. The tree's
`wmill.yaml` SHALL not include schedules; the hand push names them.

#### Scenario: The schedule is enabled on the engine

- **WHEN** the user has enabled the pass schedule and a deploy pushes
- **THEN** the schedule is still enabled afterwards

#### Scenario: The tree's push configuration

- **WHEN** `wmill.yaml` is read
- **THEN** it does not set `includeSchedules`

### Requirement: The deploy token reaches no long-running container

The Windmill token the deploy pushes with SHALL sit in a root-only file under
`secrets/` that `compose.yaml` names nowhere, and SHALL reach only the one-off
container that runs the push, read-only.

#### Scenario: The compose file

- **WHEN** `compose.yaml` is read
- **THEN** no service and no secret names the deploy token's file
