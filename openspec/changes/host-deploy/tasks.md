## 1. The deploy script

- [ ] 1.1 Write `orchestrator/deploy.test.ts` first: it runs
      `orchestrator/deploy.sh` with stub `git`, `docker` and `curl` on `PATH`
      that log their arguments and answer from fixture files, and a state
      directory in a temp dir. Cases, each citing its scenario:
      `orchestrator/main-has-not-moved` (no ff, no build),
      `orchestrator/the-head-s-test-check-has-not-passed` (pending, failure,
      no run, a `test` run from another app: no ff; the read carries
      `filter=latest`), `orchestrator/a-rerun-after-a-green-run` (the latest
      run pending or failed: no ff), `orchestrator/a-green-head` (ff, build,
      hold, `up`, prune, the engine wait, push, record, in that order, with
      `STATE_DIRECTORY` unset the state directory created),
      `orchestrator/the-checkout-cannot-fast-forward` (the merge fails; and
      the merge exits 0 while `HEAD` is a local commit over the head, or
      `git status` shows a tracked edit: no build, no record),
      `orchestrator/the-build-fails`, `orchestrator/github-cannot-be-reached`,
      `orchestrator/a-stop-file-already-exists`. Record that they fail
- [ ] 1.2 Write `orchestrator/deploy.sh` per design.md: the body in one
      function called on the last line; fetch; compare with the recorded
      commit; the check-run read; `merge --ff-only`, then the clean-tree and
      `HEAD`-equals-head checks; `docker compose build`; the locks, taken on
      the host on the runner volume's `locks/` (mount point from
      `docker volume inspect`): the gate, then every other `*.lock`, all
      blocking; `up -d`; release; `docker image prune -f`; the engine wait
      and the push in one-off containers with `--entrypoint`, the CLI version
      read from `docker compose config --format json`; the record, in
      `STATE_DIRECTORY` or `mkdir -p /var/lib/harness-deploy`; the stop files
      on a failed step. Make 1.1 pass
- [ ] 1.3 In `orchestrator/pass.test.ts` (Linux CI only, it needs `flock`),
      write first, record that they fail, then add the gate to `pass.sh`
      before its repository lock per design.md, *Build first*: with the gate
      held by the test, a pass prints `busy`, exits 0 and creates no lock
      file (`orchestrator/a-repository-s-first-pass-during-the-deploy`); the
      existing busy case cites `orchestrator/a-tick-during-the-deploy`; two
      passes of two repositories started together both run. `wc -l` both
      files first; split by the cap if either would pass it
- [ ] 1.4 Linux-only cases in `deploy.test.ts` with real `flock` over a temp
      `locks/`: `orchestrator/a-pass-is-running-when-main-moves` (a held
      repository lock: `up` is logged only after it is released) and
      `orchestrator/the-runner-is-recreated-under-the-locks` (the stub `up`
      checks, from another process, that the gate and the lock are still
      held)
- [ ] 1.5 In a new `bun/ci-run-gate.test.ts` (Linux CI only, real `flock`),
      write first and record that it fails: with the gate held by the test,
      the flow creates no repository lock until the test releases the gate
      (`orchestrator/a-failed-run-s-flow-during-the-deploy`). Then take the
      gate in `bun/ci-run.ts` per design.md, *Build first*; `wc -l` it first
      (296 lines) and split by the cap before adding

## 2. The units, the push configuration and the layout

- [ ] 2.1 Add `orchestrator/host/harness-deploy.service` (`Type=oneshot`,
      `StateDirectory=harness-deploy`, `TimeoutStartSec=3h`,
      `WorkingDirectory=/root/harness/orchestrator`) and
      `orchestrator/host/harness-deploy.timer` (`OnBootSec=5min`,
      `OnUnitInactiveSec=5min`). Cases in `orchestrator/layout.test.ts` read
      both and pin those fields
- [ ] 2.2 Drop `includeSchedules: true` from
      `orchestrator/windmill/wmill.yaml`; a case citing
      `orchestrator/the-tree-s-push-configuration` asserts it is unset
- [ ] 2.3 A case citing `orchestrator/the-compose-file` asserts no service and
      no secret in `compose.yaml` names `windmill_deploy_token`
- [ ] 2.4 Run the build's own scans over every file this group writes
      (`bun test` covers layout, spec coverage and board-state hygiene)

## 3. The kick

- [ ] 3.1 Write `orchestrator/event-kick.test.ts` first: it runs
      `event.ts`'s `main` with a stub `ssh` on `PATH` that logs its arguments
      and exits with a code per call, and a fake engine (`Bun.serve`) for the
      two key variables. Cases, each citing its scenario:
      `orchestrator/main-s-test-passes` (two `ssh` calls, the second to
      `root@host.docker.internal` with `f/orchestrator/host_deploy_key` and
      `UserKnownHostsFile=/run/secrets/runner_known_hosts`),
      `orchestrator/a-delivery-that-is-no-green-main-run` (`ping`, a
      `failure`, a `feat/` branch, a `pull_request` run: one `ssh` call),
      `orchestrator/a-refused-delivery` (handler exits 2: the job throws, one
      `ssh` call). Record that they fail
- [ ] 3.2 In `event.ts`, after the handler's exit 0, parse the body and run
      the kick per design.md, *The kick*; keep the handler call and its throw
      as they are, and the decision in one small exported function the test
      reads. Update the header comment and `event.script.yaml`'s description.
      Make 3.1 pass
- [ ] 3.3 `compose.yaml`: `extra_hosts: ["host.docker.internal:host-gateway"]`
      on `windmill_worker` alone; a case in `layout.test.ts` citing
      `orchestrator/the-worker-reaches-the-host`
- [ ] 3.4 A case in `layout.test.ts` citing
      `orchestrator/a-kick-during-a-deploy`: the service is `Type=oneshot`,
      the timer's `OnUnitInactiveSec` is set, and the README's
      `authorized_keys` line forces
      `systemctl start --no-block harness-deploy.service` under `restrict`
      and `from=`

## 4. The README and the live check

- [ ] 4.1 `orchestrator/README.md`: a step after 11, *Deploys from main*,
      naming what the deploy moves and what stays the user's (secrets, host
      keys, the App's key, the schedule, removing a stop file), the deploy
      token's file and mode, the kick key's `authorized_keys` line and
      variable, the host's line in `runner_known_hosts`, and the two
      `systemctl` commands; step 6 notes that the schedule moves only by the
      hand push; step 10 names this repository and that its *Workflow runs*
      deliveries also start the deploy. A layout case pins the new step's
      `authorized_keys` line (3.4)
- [ ] 4.2 **User act.** On the host, as root, in `orchestrator/`: create a
      Windmill token for the deploy and write it to
      `secrets/windmill_deploy_token` with `umask 077`; run
      `./deploy.sh` once by hand and confirm in Windmill that the pass
      schedule is still enabled and the scripts carry the head
      (`orchestrator/the-schedule-is-enabled-on-the-engine`)
- [ ] 4.3 **User act.** The kick key, on the host as root in `orchestrator/`
      with `umask 077`: `ssh-keygen -t ed25519 -N '' -C deploy-kick -f
      secrets/deploy_kick_key`; append the `authorized_keys` line of step
      4.1 to `/root/.ssh/authorized_keys` with its public half and the subnet
      `docker network inspect orchestrator_default` prints; store
      `base64 -w 0 secrets/deploy_kick_key` as the secret variable
      `f/orchestrator/host_deploy_key`, then `rm secrets/deploy_kick_key*`;
      append `host.docker.internal` and the first two fields of
      `/etc/ssh/ssh_host_ed25519_key.pub` as one line to
      `secrets/runner_known_hosts`
- [ ] 4.4 **User act.** `systemctl link` both units from
      `/root/harness/orchestrator/host/`, then
      `systemctl enable --now harness-deploy.timer`; on GitHub, add this
      repository's webhook per README step 10 (*Workflow runs* alone, the
      host's `github_webhook_secret`). After the next merge to `main`, read in
      Windmill's Runs the event job that kicked, and
      `journalctl -u harness-deploy` for the deploy of that head
- [ ] 4.5 **User decision.** Confirm the `main` ruleset's bypass list names no
      App and no bot, since every merge now runs on the host as root
