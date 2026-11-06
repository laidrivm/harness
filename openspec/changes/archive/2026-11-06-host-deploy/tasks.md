Each numbered group below is one pull request, within the 800-line diff
budget. Group 2 lands after card *Build the runner image for the persistent
session…* (`40c39875c31b8116879bec24abbba0ba`), which owns the Dockerfile's
tmux and the start script; group 3 after group 2. Tasks 1.1–1.4 are the first
plan's (2026-10-24), on `main`; their code stays, and what of it stage 7
removes is in design.md, *What stage 7 removes*.

## 1. The deploy script (first plan, on `main`)

- [x] 1.1 Write `orchestrator/deploy.test.ts` first: it runs
      `orchestrator/deploy.sh` with stub `git`, `docker` and `curl` on `PATH`
      that log their arguments and answer from fixture files, and a state
      directory in a temp dir. Cases, each citing its scenario:
      `orchestrator/main-has-not-moved` (no ff, no build),
      `orchestrator/the-head-s-test-check-has-not-passed` (pending, failure,
      no run, a `test` run from another app: no ff; the read carries
      `filter=latest`), `orchestrator/a-rerun-after-a-green-run` (the latest
      run pending or failed at the first read: no ff; green at the first
      read and pending at the second, under the locks: no `up`, no record,
      no stop file), `orchestrator/a-green-head` (read, ff, build, hold, the
      second read, `up`, prune, the engine wait, push, record, in that order, with
      `STATE_DIRECTORY` unset the state directory created),
      `orchestrator/the-checkout-cannot-fast-forward` (the merge fails; and
      the merge exits 0 while `HEAD` is a local commit over the head, or
      `git status` shows a tracked edit or an untracked file under `bun/`:
      no build, no record),
      `orchestrator/the-build-fails`, `orchestrator/github-cannot-be-reached`,
      `orchestrator/a-stop-file-already-exists`. Record that they fail
- [x] 1.2 Write `orchestrator/deploy.sh` per design.md: the body in one
      function called on the last line; fetch; compare with the recorded
      commit; the check-run read; `merge --ff-only`, then the clean-tree and
      `HEAD`-equals-head checks; `docker compose build`; the locks, taken on
      the host on the runner volume's `locks/` (mount point from
      `docker volume inspect`): the gate, then every other `*.lock`, all
      blocking; the second check read; `up -d`; release; `docker image prune -f`; the engine wait
      and the push in one-off containers with `--entrypoint`, the CLI version
      read from `docker compose config --format json`; the record, in
      `STATE_DIRECTORY` or `mkdir -p /var/lib/harness-deploy`; the stop files
      on a failed step. Make 1.1 pass
- [x] 1.3 In `orchestrator/pass.test.ts` (Linux CI only, it needs `flock`),
      write first, record that they fail, then add the gate to `pass.sh`
      before its repository lock per design.md, *Build first*: with the gate
      held by the test, a pass prints `busy`, exits 0 and creates no lock
      file (`orchestrator/a-repository-s-first-pass-during-the-deploy`); the
      existing busy case cites `orchestrator/a-tick-during-the-deploy`; two
      passes of two repositories started together both run. `wc -l` both
      files first; split by the cap if either would pass it
- [x] 1.4 Linux-only cases in `deploy.test.ts` with real `flock` over a temp
      `locks/`: `orchestrator/a-pass-is-running-when-main-moves` (a held
      repository lock: `up` is logged only after it is released) and
      `orchestrator/the-runner-is-recreated-under-the-locks` (the stub `up`
      checks, from another process, that the gate and the lock are still
      held)

Task 1.5, the gate in `bun/ci-run.ts`, was dropped on 2026-10-25.

## 2. The fresh-session mark in the image

- [x] 2.1 Write `orchestrator/layout-deploy.test.ts` first. Cases, each citing
      its scenario: `orchestrator/the-container-s-managed-settings` (the
      Dockerfile copies `runner/managed-settings.json` to
      `/etc/claude-code/managed-settings.json` after the directory's
      `install -d -m 0755` and before the mode check; a `SessionStart`
      matcher is `startup|clear`; `UserPromptSubmit` is set);
      `orchestrator/the-user-s-first-message` (runs the hook commands
      read from the JSON under `sh` with `HOME` in a temp dir: the mark
      exists after `SessionStart`, not after `UserPromptSubmit`);
      `orchestrator/a-continued-start` (a `resume` start leaves the mark as
      it was); `orchestrator/the-session-starts-after-a-failed-deploy` (on
      `startup`, `clear` and `resume`, with `~/.harness-deploy-failed`
      present the output carries the ask line and the file's line, and the
      next start's carries nothing; absent, it prints nothing). Record that they fail (05.11: 7 of 7, the file
      absent)
- [x] 2.2 Confirm the Linux managed-settings path and the `SessionStart`
      matcher values against the Claude Code docs (05.11: the path, and
      `--continue` fires `resume`, design.md, *Every start continues*);
      write `orchestrator/runner/managed-settings.json` per design.md, *The
      fresh-session mark*, and its `COPY` line in the Dockerfile. Make 2.1
      pass

## 3. The deploy for the session, its units and the README

- [x] 3.1 `wc -l` `deploy.test.ts` and `deploy.fixture.ts`; new cases go in
      a new `orchestrator/deploy-session.test.ts` on the same fixture, whose
      stub `docker` gains the container's image and id, `tag`, `restart` and
      `exec … tmux has-session`, answered from fixture files, and a stub
      `sleep` on `PATH`, so the two-minute wait runs at once. Write first,
      each citing its scenario: `orchestrator/a-session-at-work`,
      `orchestrator/a-fresh-session`, `orchestrator/an-unchanged-image`,
      `orchestrator/the-session-comes-back`,
      `orchestrator/the-session-does-not-come-back` (the failure file and
      `rolled-back` written, then the tag goes back, `up -d runner`, exit 1),
      `orchestrator/the-rollback-fails` (the tag back or `up -d runner`
      fails: the failure file names that step, `rolled-back` stays, the next
      run skips the head),
      `orchestrator/a-rolled-back-head`,
      `orchestrator/the-deploy-token-is-absent`; extend
      `orchestrator/the-build-fails` with the failure file, and change the
      order `orchestrator/a-green-head` asserts in `deploy.test.ts` from 1.1's
      (`up`, prune, engine wait, push, record) to the tag before the build,
      then the failure file's removal, `up`, the wait for `main`, engine
      wait, push, record, prune. Record that they fail (06.11: 22 of 38)
- [x] 3.2 In `deploy.sh`, per design.md: skip a head equal to `rolled-back`;
      tag the running runner's image as `orchestrator-runner:previous` before
      the build; after the build, exit 0 without the fresh-session mark; with
      it, under the locks, the second check read and mark check, then the
      failure file's removal, `up -d`, then `restart runner` when the
      container id is unchanged; the wait for `main`; the one rollback, its
      failure file and `rolled-back` before its tag and `up`; the failure file
      in `failed()`; the
      push and the engine wait skipped while the token file is absent; the
      record, then the prune. Update the header
      comment. Make 3.1 pass
- [x] 3.3 Add `orchestrator/host/harness-deploy.service` (`Type=oneshot`,
      `ExecStart=/root/harness/orchestrator/deploy.sh`,
      `StateDirectory=harness-deploy`, `TimeoutStartSec=3h`,
      `WorkingDirectory=/root/harness/orchestrator`) and
      `orchestrator/host/harness-deploy.timer` (`OnBootSec=5min`,
      `OnUnitInactiveSec=5min`, `[Install] WantedBy=timers.target`); a case
      in `layout-deploy.test.ts` citing `orchestrator/the-deploy-s-units`
- [x] 3.4 `orchestrator/README.md`: a step after 11, *Deploys from main*:
      what the deploy moves and when (a fresh session), the two `systemctl`
      commands, the failure file, how to retry a rolled-back head, how to
      stop deploys, and that hooks move only with the pin (06.11: step 13,
      after step 12's session, which it restarts)
- [x] 3.5 Run the build's own scans over every file this group writes
      (`bun test` covers layout, spec coverage and board-state hygiene)
      (06.11: `.githooks/gates.sh` with the units tracked, 0 fail)

## 4. On the host

- [x] 4.1 **User act.** Once group 3 is merged and the image of group 2 runs
      (built by hand, stage page step 3): as root, `systemctl link` both
      units from `/root/harness/orchestrator/host/`, then
      `systemctl enable --now harness-deploy.timer`. Never before group 3:
      the deploy on `main` brings the stack up without waiting for a fresh
      session (06.11: the timer enabled; card, «Задача 4.1 на VPS, 06.11»)
- [x] 4.2 **User act.** After the next merge, `/clear` the session from
      Remote Control and watch: within a tick the session restarts, Remote
      Control reconnects, and `journalctl -u harness-deploy` shows the head
      deployed. Note on the card whether the first message cleared the mark
      and whether Remote Control reconnected, the two points design.md lists
      as unverified; the `SessionStart` on `/clear` and the conversation a
      restart continues the live probe settled on 05.11 (answer 18 а)
      (06.11: 9c47f18 deployed at 13:37 UTC after the `/clear`, Remote
      Control reconnected, the first message removed `.harness-fresh`; card,
      «Задача 4.2 на VPS, 06.11»)
- [x] 4.3 **User decision.** Confirm the `main` ruleset's bypass list names no
      App and no bot, since every merge now runs on the host as root (06.11:
      only the user, as repository admin; card, «Задача 4.3, 06.11»)

## Moved out of this change

- Stage 6: the webhook kick (`ssh` with a forced command running
  `systemctl start --no-block`, its key, `host.docker.internal` on the
  worker, `event.ts`), the Windmill push with `windmill_deploy_token`,
  `includeSchedules` dropped from `wmill.yaml`, the token's absence from
  `compose.yaml`, a stop-file check in the forced command — the first plan's
  group 3 and tasks 2.2, 2.3, 4.2 and 4.3.
- Stage 9: the write-path probe without a session (mint, a branch in a
  sandbox repository, a sandbox Notion card), the full rollback with a stop
  file and an escalation card, the session that finishes its work and then
  updates, the stage metric.
- After stage 9: an agent on the host that repairs a failed deploy
  (answer 13).
