## ADDED Requirements

### Requirement: The host deploys main's green head and nothing else

A root timer SHALL start the host's deploy five minutes after boot and five
minutes after each run ends, one run at a time. Each run SHALL compare `origin/main`'s head with the commit it last
deployed and with the commit it last rolled back. When the head is neither and
its latest `test` check run from `github-actions` has concluded `success`, the
run SHALL fast-forward the host's checkout to that head and rebuild the
images, and SHALL record the head as deployed only once the session is up on
them. It SHALL move the host's checkout and images to no other commit; the
session's clone, which the runner's start script pulls when the session
restarts, MAY be at a newer head of `origin/main` than the one deployed.
While the Windmill deploy token's file
does not exist, the run SHALL skip the Windmill push and say so.

#### Scenario: Main has not moved

- **WHEN** a run finds `origin/main`'s head equal to the commit last
  deployed
- **THEN** the checkout, the images and the engine are unchanged

#### Scenario: The head's test check has not passed

- **WHEN** the head's `test` check is pending, failed or absent
- **THEN** the checkout is not moved, and the next tick reads the check again

#### Scenario: A rerun after a green run

- **WHEN** the head's `test` run succeeded and a later rerun of it is pending
  or failed, read before the fast-forward or again right before `up`
- **THEN** the stack is not brought up, the head is not recorded and no
  failure is written

#### Scenario: A green head

- **WHEN** the head differs from the commits last deployed and last rolled
  back, its `test` check concluded `success`, and the session is fresh
- **THEN** the checkout is at the head, the runner runs the image built from
  it, the session has started again, and the head is recorded as deployed

#### Scenario: The checkout cannot fast-forward

- **WHEN** the checkout has a tracked change, an untracked file that is not
  ignored, or a commit `origin/main` does not hold, whether or not the
  fast-forward itself succeeds
- **THEN** nothing is rebuilt, the head is not recorded, and the deploy fails

#### Scenario: The deploy token is absent

- **WHEN** a green head is deployed and `secrets/windmill_deploy_token` does
  not exist
- **THEN** no push and no engine wait run, the journal says the push was
  skipped, and the head is recorded

#### Scenario: The deploy's units

- **WHEN** the units under `orchestrator/host/` are read
- **THEN** the service is `Type=oneshot` with `StateDirectory=harness-deploy`
  and runs `deploy.sh` from `/root/harness/orchestrator`, and the timer starts
  it five minutes after boot and five minutes after each run, wanted by
  `timers.target`

### Requirement: The deploy restarts the session only while it is fresh

The runner image SHALL carry managed settings whose `SessionStart` hook, on
startup and on clear, marks the session fresh in agent's home, leaving the
mark as it was on a start that continues a conversation, and whose
`UserPromptSubmit` hook removes the mark. After its build the deploy SHALL
bring the stack up only while the mark exists; otherwise it SHALL exit 0
without recording the head, so the next tick tries again. When `up` leaves
the runner container as it was, the deploy SHALL restart the runner, so the
session starts again on the updated clone.

#### Scenario: A session at work

- **WHEN** a green head is built and the fresh-session mark does not exist
- **THEN** no container is recreated or restarted, the head is not recorded,
  the run exits 0, and the next tick tries again

#### Scenario: A fresh session

- **WHEN** a green head is built and the fresh-session mark exists
- **THEN** the deploy brings the stack up and waits for the session

#### Scenario: An unchanged image

- **WHEN** the deploy brings the stack up and the runner container's id is
  the same afterwards
- **THEN** the deploy restarts the runner

#### Scenario: The container's managed settings

- **WHEN** `orchestrator/runner/managed-settings.json` and the Dockerfile are
  read
- **THEN** the image copies the settings to Claude Code's managed-settings
  path, its `SessionStart` hook matches `startup` and `clear` and creates the
  mark, and its `UserPromptSubmit` hook removes it

#### Scenario: The user's first message

- **WHEN** the managed hooks run for a `startup` or `clear` session start and
  then for a submitted prompt
- **THEN** the mark exists after the first and not after the second

#### Scenario: A continued start

- **WHEN** the managed hooks run for a start that continues the last
  conversation
- **THEN** the mark exists exactly when it existed before, and a failure file
  is reported as on any other start

### Requirement: A session that does not come back is rolled back

Before the build the deploy SHALL tag the image the running runner container
runs as the previous image. After bringing the stack up it SHALL wait at most
two minutes for the tmux session `main` in the runner. When `main` is not up
by then, it SHALL write the failure file, record the head as rolled back,
bring the runner up on the previous image once, and SHALL NOT deploy that
head again while the record holds it; a record that cannot be written SHALL
be told by the journal. A rollback that fails SHALL be told by the failure file and the
journal and left for the user; retrying or verifying it is stage 9's.

#### Scenario: The session comes back

- **WHEN** `main` is up within two minutes of `up`
- **THEN** the head is recorded as deployed and the failure file is removed

#### Scenario: The session does not come back

- **WHEN** `main` is not up two minutes after `up`
- **THEN** the head is recorded as rolled back, the failure file names the
  head, the run fails, and, when the rollback's tag and `up` succeed, the
  runner runs the previous image

#### Scenario: A rolled-back head

- **WHEN** a run finds `origin/main`'s head equal to the commit last rolled
  back
- **THEN** the checkout, the images and the runner are unchanged

#### Scenario: The rollback fails

- **WHEN** the tag back or the runner's `up` fails during a rollback
- **THEN** the failure file names the failed step, the head stays recorded as
  rolled back, the run fails, and no later run retries the rollback

### Requirement: A deploy never ends a running pass

Until stage 7 removes the pass loop, the deploy SHALL recreate containers only
while it holds, from a process no container recreation ends, the pass gate and
every pass lock, waiting for a running pass to release its lock. A pass SHALL
take its repository lock only while it holds the gate, so no pass's lock file
appears during the hold. A tick that starts during the hold SHALL find its
repository busy.

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

#### Scenario: The runner is recreated under the locks

- **WHEN** `docker compose up -d` recreates the runner during the hold
- **THEN** the locks stay held until `up` has finished

### Requirement: A failed deploy is told to the session

When a step after the fast-forward fails, the deploy SHALL write the failure
file in agent's home, naming the failed step and the commit and replacing an
older one, SHALL write each clone's stop file that does not exist yet, until
stage 7 removes them, and SHALL NOT record the commit as deployed. A fetch or
check read that fails SHALL write neither, nor SHALL a run that the service's
start timeout kills before the failure file is written, which leaves the
timeout on the journal. The managed `SessionStart` hook
SHALL print the failure file, when it exists, on startup, on clear and on a
continued start, with a line asking the session to report it to the user in
chat, and SHALL then move it aside, so the next start does not report it
again.

#### Scenario: The build fails

- **WHEN** the image build fails for a green head
- **THEN** the failure file and every clone's stop file name the deploy, the
  build and the head, the head is not recorded, and the next tick retries the
  deploy

#### Scenario: GitHub cannot be reached

- **WHEN** the fetch or the check read fails
- **THEN** no failure file and no stop file is written and the next tick
  tries again

#### Scenario: A stop file already exists

- **WHEN** a clone's stop file exists as the deploy fails
- **THEN** that file is left as it was

#### Scenario: The session starts after a failed deploy

- **WHEN** the managed `SessionStart` hook runs while the failure file exists
- **THEN** its output asks the session to report the failure to the user and
  carries the file's line, and the next start's output does not
