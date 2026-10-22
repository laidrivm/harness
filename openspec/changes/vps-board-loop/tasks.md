# vps-board-loop — tasks

Three task groups, so the change ships as `feat/vps-board-loop-1`,
`feat/vps-board-loop-2` and `feat/vps-board-loop-3`. Group 1's wrapper works
on any Linux host from cron or a terminal, before an engine exists. Group 2
is the spike that compared n8n with Windmill on that wrapper before the host
is built. Group 3 puts the wrapper under Windmill CE, the engine the user
chose from it (2026-10-22). Numbers in
brackets refer to the proposal-stage `/zombies` list in the PR. Only group 2
runs anything on the VPS, and it leaves nothing there. Everything else that
happens there is the user acts in `proposal.md`.

## 1. The wrapper a host timer runs

Closes every scenario of `orchestrator` §*The timer starts at most one pass
per repository*, §*A failed pass pauses the timer until the user removes the
stop file* and §*The wrapper starts the pass with the environment it names*,
and both of `board-loop` §*A timer the user set up may start the runner*.

- [x] 1.1 Write the failing cases first in a new `orchestrator/pass.test.ts`,
      and record that each fails before `pass.sh` exists. Each case runs
      `orchestrator/pass.sh` with `HOME`, the clones directory and the secrets
      directory pointed at a temporary tree. The clone there holds a fake
      `node_modules/harness/bun/board-loop.ts` that prints its environment and
      a last line, then exits with a status the case sets. Cover: an empty
      name, a name of no clone, `..`, a `/`, a newline, a leading `-`, and an
      origin URL that names no owner and repository, each exiting 2 with no
      lock and no stop file [1, 2, 9, 10, 11, 12, 15]. Status 0 leaves no stop
      file [3]. Status 1 writes a stop file with the UTC time, `1` and the last
      line, and exits 1 [4]. Status 137 is recorded and returned [19]. Cover
      busy on the same clone, busy on a second clone of the same repository
      over HTTPS and SSH, two repositories both running, and the next tick
      running once the lock is released [5, 6, 7, 8, 14]. The paused line and
      exit 3, and paused winning over a held lock [18, 24]. A secret that is
      missing, empty or whitespace-only writes the stop file, names the file
      and never starts the runner [13, 22]. `bun` missing from `PATH` writes the
      stop file [21]. The pass's environment holds only the allowlisted names,
      with a sentinel variable absent [16]. While the fake runner runs, no
      process's arguments, per `ps`, hold either token's value [40]. `CLAUDECODE` set, empty and unset
      [17]. The pass's output reaches the wrapper's stdout [20]. `SIGHUP` to
      the wrapper mid-pass, where the pass completes and the stop file shows
      its status [23]. Every pass, exit 0 included, leaves its whole output in
      `~/orchestrator/passes/<UTC time>-<clone>.log` [42]. Absent state, lock
      and pass-log directories are created [25]. A
      happy tick ends on the runner's `idle` line and exits 0 [26]. Cite each
      scenario with `// spec: orchestrator/<slug>`. Skip the file when
      `flock` is not on `PATH`, with the reason in the skip's title
- [x] 1.2 Add `orchestrator/pass.sh` in the order `design.md` fixes: name,
      stop file, lock, secrets, `trap '' HUP`, `env -i` run, stop file on any
      non-zero exit. The clones, state and secrets directories default to
      `~/clones`, `~/orchestrator` and `/run/secrets`. Each can be overridden
      only through a variable the script names; the clones directory's is
      `PASS_CLONES`. Its header says why it hands
      `CLAUDECODE` on rather than checking it. Verify with 1.1 on Linux, in CI
      (`ubuntu-latest`)
- [x] 1.3 In `bun/board-loop-clone.test.ts`, add the case with standard input
      from `/dev/null` and no `TERM`: the pass ends as the fixture's default
      pass does, with the same line and record. Cite
      `board-loop/started-with-no-terminal`. Cite
      `board-loop/a-timer-started-inside-a-claude-code-session` on the
      existing `CLAUDECODE` cases, which already cover it [39]. Verify with
      `bun test bun/board-loop-clone.test.ts`
- [x] 1.4 Update the docs. In `README.md`, under Layout, add one sentence for
      `orchestrator/`. In the board loop's paragraph, add the host timer the
      user set up (`orchestrator/pass.sh`) beside "a terminal of their own",
      and add that two passes at once need two clones, never two worktrees of
      one. In the header of `bun/board-loop.ts`, say the same. Grep for "a
      terminal of their own" and "only the user starts it" across the tree,
      `openspec/specs/**` included, and reconcile each site. Verify with
      `bun test`
- [x] 1.5 Run `bun bun/check.ts` and `bun test`. Both pass. Applied: `bun
      test` passes. `check.ts` is the consumer's entry point and cannot run
      in this tree, which has no `bunfig.toml` and no `harness.rootFiles` or
      `harness.suppressions`; it fails alike on `main`

## 2. Spike: n8n against Windmill on one pass

Closes no scenario: its output is a measured comparison in `design.md` and
the engine group 3 builds on. It needs the user acts that give the host a
Claude token and a GitHub token first, and the user's SSH key loaded on the
machine that carries the step.

- [x] 2.1 On the VPS, in a throwaway directory outside any clone, start each
      engine's stock image (n8n ≥ 2.38.2; Windmill's community edition) beside
      a copy of group 1's runner, one engine at a time. Drive the same
      scenario through each: a scheduled start of `pass.sh` against a clone
      holding a fake runner that sleeps 65 minutes, then one real pass whose
      stage prompt is a single trivial `claude -p` call. Record for each, with
      what was read or run: a command past one hour survives or is cut; a
      second start while the first runs is refused by a concurrency limit of
      1; a webhook with a wrong `X-Hub-Signature-256` is rejected and a
      repeated delivery ID is dropped; the Claude token works inside the
      container and the run's `session_id` and `total_cost_usd` reach the
      execution record; `claude -r` resumes across two runs; what the engine
      shows when the subscription limit is hit, if it can be provoked cheaply;
      a workflow exported to files, deleted and imported again comes back
      runnable, with no secret in the files; the execution list is readable
      from a phone through Cloudflare Access; and, for Windmill, which of
      these the community edition withholds. One more criterion, from the
      docs and a minimal build (user, 2026-10-20): whether the engine takes
      an extension — a plugin, community node or module — installed beside
      the stock image rather than in a fork, so the engine still updates from
      upstream, through which an LLM step reaches Claude on the subscription
      (the `claude` CLI on a `setup-token` token) and not the API; failing
      that, an OpenAI-compatible endpoint such as OpenRouter, which can route
      to a locally deployed model or custom inference. Build the smallest
      such extension for each engine, call it once, and record whether it
      survived an engine update. A self-hosted tool the docs show meeting
      this where both engines fail joins the table as a row read from its
      docs, without a run.
      2026-10-21: the secret-free rows are run and recorded in `design.md`
      *Spike: n8n against Windmill*. 2026-10-22: the token and Cloudflare
      rows are run and recorded there as rows 8–12. The subscription limit
      was not provoked: a failed `claude -p` was forced with an invalid
      token instead (row 10), since burning the limit would lock the user's
      own sessions for hours. Also 2026-10-22: row 13 (control through MCP
      and a CLI) is run on both engines, and Windmill is re-run on 1.846.1,
      recorded under *Windmill 1.846.1*
- [x] 2.2 Write the results into `design.md` under a new *Spike: n8n against
      Windmill* section, one row per criterion and engine. Whatever the
      results, stop: put the table to the user as the question on the card,
      with a recommendation (unattended: card — hand the choice on, and build
      neither host), and revise group 3 after the answer (user, 2026-10-20).
      2026-10-22: the user chose Windmill CE 1.846.1 with no chat page, and
      a manual root session for Remote Control; group 3 is revised to match
- [x] 2.3 Tear both stacks down. Verify with `docker ps -a`, `docker volume
      ls` and the throwaway directory gone that the VPS holds nothing from
      the spike.
      2026-10-21: the secret-free bring-up is torn down: `docker ps -a`,
      `docker volume ls` and `docker images` are empty, only the default
      networks remain, and `/root/spike-2026-10-21` is gone. Docker 29.1.3
      and compose 2.40.3 from Ubuntu's repository stay installed. 2026-10-22:
      the token bring-up is torn down the same way, its token files shredded
      and the `spike` user removed; the tunnel and the Access applications
      stay for group 3. 2026-10-22, later: the third bring-up (row 13 and
      Windmill 1.846.1) is torn down the same way, with every token, key and
      password file shredded; `docker ps -a`, `docker volume ls` and `docker
      images` are empty. In Access the spike's Service Auth policy is
      removed; the service token itself is the user's to keep or revoke, and
      the bypass keeps `/api/r/github` for Windmill's route

## 3. The Windmill host

Closes every scenario of `orchestrator` §*The orchestrator directory holds no
secret*, §*Every pin in the orchestrator directory is exact and names what
moves it*, §*A pass is stopped on the runner, never through the engine* and
§*No tracked file starts Remote Control*. The App key goes on the host only
after `runner-isolation` group 3, which edits this group's image and README.

- [ ] 3.1 Write the failing cases first in a new `orchestrator/layout.test.ts`,
      and record that each fails before the files exist. Each check runs over
      fabricated input and over the tracked tree. Cover: no script under
      `orchestrator/windmill/` fails rather than passing empty [27]. The
      Windmill floor compares numerically: 1.846.0 fails, while 1.846.1 and
      1.1000.0 pass, and a server and a worker image on different versions
      fail [28]. The pass script carries the tag `pass`, a `timeout` of at
      least 5400 and no `concurrent_limit`, and its schedule is hourly and
      on the script, not a flow [29]. The script's last command is the `ssh`
      call, so its status is the job's; a command after it fails the suite
      [43]. A variable file carrying a `value` fails, naming the file [30,
      31]. In compose, the worker service tagged `pass` has one replica and
      `WORKER_TAGS=pass`, and no other worker takes `pass`. A tracked file
      under `orchestrator/` other than its README that starts `claude
      remote-control` or passes `--remote-control` fails, naming the file.
      A literal value for a token, key, secret or password
      variable in compose, naming the service [32]. A `FROM` or `image:`
      without `@sha256:` [33]. A pinned line without its note [34]. An `ARG`
      version that is not a full `x.y.z` [35]. An IPv4 literal other than
      `127.0.0.1` or `0.0.0.0`, or a string with a GitHub or Anthropic token
      prefix, anywhere under `orchestrator/` [36].
      `orchestrator/secrets/<file>` is ignored, per `git check-ignore` [37].
      The entrypoint writes exactly one `authorized_keys` line, carrying
      `restrict,command=`, `PASS_CLONES=/home/agent/clones` and `pass.sh`,
      and exits non-zero when the public
      key file is missing [38]. The image creates both users, `runner` with
      the fixed numeric uid the host README names, and the one rule that lets
      `runner` start a command as `agent` names one command,
      `/opt/orchestrator/as-agent`, the launcher `runner-isolation` adds and
      `board-loop.ts` runs; the README's provisioning step makes each secret
      file this group provisions (the App key is `runner-isolation`
      group 3's, owned by the key holder) owned by that uid, mode 0400,
      and its directory 0500 [41]. Cite each scenario
- [ ] 3.2 Add `orchestrator/runner/Dockerfile` and
      `orchestrator/runner/entrypoint.sh`. The image holds git, `gh`, bun
      1.4.2, `claude`, `openspec`, `coderabbit`, `flock` and `sshd`, and the
      users `runner` and `agent` as `design.md` fixes. `gh auth setup-git` is
      run in the image. Copy `orchestrator/pass.sh` and
      `orchestrator/stop.sh` to `/opt/orchestrator/`. Each pin is an exact
      version or a digest and carries the note `design.md` fixes. Verify with
      3.1, and with `docker build` where Docker is available. Otherwise record
      that the build is first run by the user
- [ ] 3.3 Write the failing cases in `orchestrator/pass.test.ts`, then add
      `orchestrator/stop.sh`, and have `pass.sh` write `<lock>.pid` (`design.md`
      *Stopping a pass*). Cover: a bad name exits 2 as `pass.sh`'s guard
      does; no pass holding the lock prints `idle`, removes a stale marker,
      signals nothing and writes no stop file; another repository's running
      pass is left alone; a running fake pass gets TERM, the
      lock frees, and the stop file's last line is `stopped by hand`, so the
      next tick prints the paused line. Skip without `flock`, as 1.1 does.
      Cite each scenario
- [ ] 3.4 Add `orchestrator/compose.yaml` with the services `db` (Postgres
      16), `windmill_server`, `windmill_worker_pass` (one replica,
      `WORKER_TAGS=pass`), `windmill_worker` (every other tag), each
      Windmill image 1.846.1 or later by digest; `runner` (one volume for
      `/home/agent` and one for `/home/runner`, the secrets mounted, no
      published port); and `cloudflared` (the tunnel token from its secret
      file). Find whether Windmill takes its database URL from a file; if
      not, build it in each service's `command` from the `db_password`
      secret (`design.md` *Secrets*), never a `.env`. Record it there.
      Add `orchestrator/secrets` to `.gitignore` with no trailing slash. Verify with 3.1 and `docker
      compose config` where Docker is available
- [ ] 3.5 Write `orchestrator/windmill/` by hand to the shape `wmill sync
      pull --skip-secrets --include-schedules` writes: the bash pass script
      (tag `pass`, `timeout` 5400, `ssh` to `runner` with the clone name
      `harness` and the key from its variable's path, ending on that call)
      and its hourly schedule. Verify with 3.1
- [ ] 3.6 **User act.** After the first bring-up, create in Windmill a token
      limited to running, reading and scheduling the pass's own path, and
      record in the pull request whether MCP accepts it and whether it is
      refused when it tries to deploy a script. The README then names the
      client chat control uses from the laptop: MCP on that token, or `wmill`
      with `HEADERS` when no such MCP token exists (`design.md` *Phone
      access*)
- [ ] 3.7 Write `orchestrator/README.md`, opening with a level-1 heading. It
      holds the host requirements, the user acts in `proposal.md`'s order, the
      `wmill sync` commands, the check of the three Notion tool names, what to
      read before removing a stop file, `stop.sh`, the laptop clients and
      their tokens' limits, and the emergency session: ssh as root, `claude
      auth login` once, start `claude` with Remote Control in the harness
      checkout, end it when done; its login refresh is manual, and root's
      shell exports none of the three token variables. It names no address
      and no account. Verify by reading every file under `orchestrator/`
      whole for an identifier before the commit (`git-and-prs.md`)
- [ ] 3.8 Add one line to the root `README.md`'s orchestrator paragraph
      naming the emergency session as the phone's second path
- [ ] 3.9 Run `bun test`. It passes
