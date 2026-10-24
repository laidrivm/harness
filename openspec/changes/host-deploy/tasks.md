## 1. The deploy script

- [ ] 1.1 Write `orchestrator/deploy.test.ts` first: it runs
      `orchestrator/deploy.sh` with stub `git`, `docker` and `curl` on `PATH`
      that log their arguments and answer from fixture files, and a state
      directory in a temp dir. Cases, each citing its scenario:
      `orchestrator/main-has-not-moved` (no ff, no build),
      `orchestrator/the-head-s-test-check-has-not-passed` (pending, failure,
      no run: no ff), `orchestrator/a-green-head` (ff, build, hold, `up`,
      prune, push, record, in that order),
      `orchestrator/the-checkout-cannot-fast-forward`,
      `orchestrator/the-build-fails`, `orchestrator/github-cannot-be-reached`,
      `orchestrator/a-stop-file-already-exists`. Record that they fail
- [ ] 1.2 Write `orchestrator/deploy.sh` per design.md: the body in one
      function called on the last line; fetch; compare with the recorded
      commit; the check-run read; `merge --ff-only`; `docker compose build`;
      the lock holder (bash 3.2-safe: no `coproc`); `up -d`;
      `docker image prune -f`; the push in a one-off container with the
      CLI version read from `docker compose config --format json`; the
      record; the stop files on a failed step. Make 1.1 pass
- [ ] 1.3 Case `orchestrator/a-pass-is-running-when-main-moves`: the stub
      holder prints its line only after a delay, and `up` is logged after it.
      `orchestrator/a-tick-during-the-deploy` is `pass.sh`'s existing busy
      path: cite it on the busy case in `orchestrator/pass.test.ts` (Linux
      CI only, it needs `flock`)

## 2. The units, the push configuration and the layout

- [ ] 2.1 Add `orchestrator/host/harness-deploy.service` (`Type=oneshot`,
      `StateDirectory=harness-deploy`, `TimeoutStartSec=2h`,
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

## 3. The README and the live check

- [ ] 3.1 `orchestrator/README.md`: a step after 11, *Deploys from main*,
      naming what the deploy moves and what stays the user's (secrets, host
      keys, the App's key, the schedule, removing a stop file), the deploy
      token's file and mode, and the two `systemctl` commands; step 6 notes
      that the schedule moves only by the hand push
- [ ] 3.2 **User act.** On the host, as root, in `orchestrator/`: create a
      Windmill token for the deploy and write it to
      `secrets/windmill_deploy_token` with `umask 077`; run
      `./deploy.sh` once by hand and confirm in Windmill that the pass
      schedule is still enabled and the scripts carry the head
      (`orchestrator/the-schedule-is-enabled-on-the-engine`)
- [ ] 3.3 **User act.** `systemctl link` both units from
      `/root/harness/orchestrator/host/`, then
      `systemctl enable --now harness-deploy.timer`; after the next merge to
      `main`, read `journalctl -u harness-deploy` for the deploy of that head
- [ ] 3.4 **User decision.** Confirm the `main` ruleset's bypass list names no
      App and no bot, since every merge now runs on the host as root
