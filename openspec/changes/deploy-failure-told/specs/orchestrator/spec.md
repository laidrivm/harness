## MODIFIED Requirements

### Requirement: The host deploys main's green head and nothing else

A root timer SHALL start the host's deploy five minutes after boot and five
minutes after each run ends, one run at a time. Each run SHALL compare `origin/main`'s head with the commit it last
deployed and with the commit it last rolled back. When the head is neither and
its newest `test` check run from `github-actions`, across every check suite
of the head, has concluded `success`, the
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

#### Scenario: An older check suite's success

- **WHEN** the head carries a `test` run from `github-actions` in more than
  one check suite, and the newest of them is pending or failed while an older
  one concluded `success`
- **THEN** the checkout is not moved, and the next tick reads the check again

#### Scenario: A newer check suite's success

- **WHEN** the head carries a failed `test` run from `github-actions` in one
  check suite and a newer successful one in another
- **THEN** the head is deployed as a green head is

#### Scenario: An image older than the check

- **WHEN** the runner image under the name was built from a commit before
  the checkout's, because a build after the fast-forward failed or a
  rollback restored the previous image
- **THEN** the check is read and decided by the checkout's rule, as on any
  other run

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

### Requirement: A session that does not come back is rolled back

Before the build the deploy SHALL tag the image the running runner container
runs as the previous image, unless the head is the one whose images it last
brought up, when the previous image SHALL stay as tagged; it SHALL record
that head before bringing the stack up, and SHALL NOT bring it up when the
record cannot be written. After bringing the stack up it SHALL wait at most
two minutes for the tmux session `main` in the runner. When `main` is not up
by then, it SHALL record the head as rolled back, write the failure file,
bring the runner up on the previous image once, and SHALL NOT deploy that
head again while the record holds it; a record that cannot be written SHALL
be told by the journal and named in every failure line the rollback writes.
A rollback that fails SHALL be told by the failure file and the
journal and left for the user; retrying or verifying it is stage 9's.

#### Scenario: The session comes back

- **WHEN** `main` is up within two minutes of `up`, and the engine wait and
  the push succeed or are skipped for want of the token
- **THEN** the head is recorded as deployed and the failure file is removed

#### Scenario: The session does not come back

- **WHEN** `main` is not up two minutes after `up`
- **THEN** the head is recorded as rolled back, the failure file names the
  head, the run fails, and, when the rollback's tag and `up` succeed, the
  runner runs the previous image

#### Scenario: The rolled-back record cannot be written

- **WHEN** `main` is not up two minutes after `up` and the head cannot be
  recorded as rolled back
- **THEN** the failure file names the wait for `main`, the rolled-back record
  and the head, the journal says the head could not be recorded, and the
  rollback's tag and `up` still run

#### Scenario: A retry after a late failure

- **WHEN** a run brought the stack up for the head and a later step failed,
  and the next run deploys the same head
- **THEN** that run does not move the previous image, and a rollback in it
  brings the runner up on the image that ran before the first run

#### Scenario: A new head after a brought-up one

- **WHEN** the head differs from the one whose images a run last brought up
- **THEN** the image the running runner container runs is tagged as the
  previous image, as on any deploy

#### Scenario: The brought-up record cannot be written

- **WHEN** the head cannot be recorded as brought up
- **THEN** the stack is not brought up, the failure file names the
  brought-up record and the head, and the run fails

#### Scenario: A rolled-back head

- **WHEN** a run finds `origin/main`'s head equal to the commit last rolled
  back
- **THEN** the checkout, the images and the runner are unchanged

#### Scenario: The rollback fails

- **WHEN** the tag back or the runner's `up` fails during a rollback
- **THEN** the failure file names the failed step, the head stays recorded as
  rolled back, the run fails, and no later run retries the rollback

#### Scenario: The rollback fails without its record

- **WHEN** the head cannot be recorded as rolled back and the tag back or the
  runner's `up` then fails
- **THEN** the failure file names that step and the rolled-back record

### Requirement: A failed deploy is told to the session

When a step after the fast-forward fails, the deploy SHALL write the failure
file in agent's home, naming the failed step and the commit and replacing an
older one, SHALL write each clone's stop file that does not exist yet, until
stage 7 removes them, and SHALL NOT record the commit as deployed. A fetch or
check read that fails SHALL write neither, nor SHALL a run that the service's
start timeout kills before the failure file is written, which leaves the
timeout on the journal. The managed `SessionStart` hook
SHALL print the failure file, when it exists, on startup, on clear and on a
continued start, and the managed `UserPromptSubmit` hook on each submitted
prompt, each with a line asking the session to report it to the user in
chat, and SHALL then move it aside, so the next start or prompt does not
report it again.

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

#### Scenario: A failure after main is up

- **WHEN** a step after `main` is up fails, such as the Windmill push, and a
  prompt is then submitted to the session that started before it
- **THEN** the `UserPromptSubmit` hook's output asks the session to report the
  failure to the user and carries the file's line, and the next prompt's
  output does not

#### Scenario: A prompt with no failure

- **WHEN** a prompt is submitted while the failure file does not exist
- **THEN** the `UserPromptSubmit` hook prints nothing and removes the
  fresh-session mark as before
