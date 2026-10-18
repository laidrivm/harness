# vps-board-loop — tasks

Two task groups, so the change ships as `feat/vps-board-loop-1` and
`feat/vps-board-loop-2`. Group 1's wrapper works on any Linux host from cron
or a terminal, before n8n exists. Group 2 puts it under n8n. Numbers in
brackets refer to the proposal-stage `/zombies` list in the PR. No task here
runs anything on the VPS. What happens there is the user acts in
`proposal.md`.

## 1. The wrapper a host timer runs

Closes every scenario of `orchestrator` §*The timer starts at most one pass
per repository*, §*A failed pass pauses the timer until the user removes the
stop file* and §*The wrapper starts the pass with the environment it names*,
and both of `board-loop` §*A timer the user set up may start the runner*.

- [ ] 1.1 Write the failing cases first in a new `orchestrator/pass.test.ts`,
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
      its status [23]. Absent state and lock directories are created [25]. A
      happy tick ends on the runner's `idle` line and exits 0 [26]. Cite each
      scenario with `// spec: orchestrator/<slug>`. Skip the file when
      `flock` is not on `PATH`, with the reason in the skip's title
- [ ] 1.2 Add `orchestrator/pass.sh` in the order `design.md` fixes: name,
      stop file, lock, secrets, `trap '' HUP`, `env -i` run, stop file on any
      non-zero exit. The clones, state and secrets directories default to
      `~/clones`, `~/orchestrator` and `/run/secrets`. Each can be overridden
      only through a variable the script names. Its header says why it hands
      `CLAUDECODE` on rather than checking it. Verify with 1.1 on Linux, in CI
      (`ubuntu-latest`)
- [ ] 1.3 In `bun/board-loop-clone.test.ts`, add the case with standard input
      from `/dev/null` and no `TERM`: the pass ends as the fixture's default
      pass does, with the same line and record. Cite
      `board-loop/started-with-no-terminal`. Cite
      `board-loop/a-timer-started-inside-a-claude-code-session` on the
      existing `CLAUDECODE` cases, which already cover it [39]. Verify with
      `bun test bun/board-loop-clone.test.ts`
- [ ] 1.4 Update the docs. In `README.md`, under Layout, add one sentence for
      `orchestrator/`. In the board loop's paragraph, add the host timer the
      user set up (`orchestrator/pass.sh`) beside "a terminal of their own",
      and add that two passes at once need two clones, never two worktrees of
      one. In the header of `bun/board-loop.ts`, say the same. Grep for "a
      terminal of their own" and "only the user starts it" across the tree,
      `openspec/specs/**` included, and reconcile each site. Verify with
      `bun test`
- [ ] 1.5 Run `bun bun/check.ts` and `bun test`. Both pass

## 2. The n8n host

Closes every scenario of `orchestrator` §*The orchestrator directory holds no
secret* and §*Every pin in the orchestrator directory is exact and names what
moves it*.

- [ ] 2.1 Write the failing cases first in a new `orchestrator/layout.test.ts`,
      and record that each fails before the files exist. Each check runs over
      fabricated input and over the tracked tree. Cover: no workflow file
      fails rather than passing empty [27]. The n8n floor compares
      numerically: 2.38.1 fails, while 2.38.2 and 2.100.0 pass [28]. The
      workflow's trigger is hourly, and its SSH node refers to the `runner`
      credential by name [29]. Each of these fails, naming its file and key or
      line: `meta`, `shared` or `pinData` in a workflow, and a credential with
      an `id` [30, 31]. A literal value for a token, key, secret or password
      variable in compose, naming the service [32]. A `FROM` or `image:`
      without `@sha256:` [33]. A pinned line without its note [34]. An `ARG`
      version that is not a full `x.y.z` [35]. An IPv4 literal other than
      `127.0.0.1` or `0.0.0.0`, or a string with a GitHub or Anthropic token
      prefix, anywhere under `orchestrator/` [36].
      `orchestrator/secrets/<file>` is ignored, per `git check-ignore` [37].
      The entrypoint writes exactly one `authorized_keys` line, carrying
      `restrict,command=` and `pass.sh`, and exits non-zero when the public
      key file is missing [38]. The image creates both users `runner` and
      `agent`, `/run/secrets` is owned by `runner` with mode 0400, and the
      one rule that lets `runner` start a command as `agent` names `claude`
      alone [39]. Cite each scenario
- [ ] 2.2 Add `orchestrator/runner/Dockerfile` and
      `orchestrator/runner/entrypoint.sh`. The image holds git, `gh`, bun
      1.4.2, `claude`, `openspec`, `coderabbit`, `flock` and `sshd`, and the
      users `runner` and `agent` as `design.md` fixes. `gh auth setup-git` is
      run in the image. Copy
      `orchestrator/pass.sh` to `/opt/orchestrator/`. Each pin is an exact
      version or a digest and carries the note `design.md` fixes. Verify with
      2.1, and with `docker build` where Docker is available. Otherwise record
      that the build is first run by the user
- [ ] 2.3 Add `orchestrator/compose.yaml` with the services `n8n` (the stock
      image, 2.38.2 or later, by digest), `runner` (one volume for
      `/home/agent`, the secrets mounted, no published port) and
      `cloudflared` (the tunnel token from its secret file). Add
      `orchestrator/secrets` to `.gitignore` with no trailing slash. Verify
      with 2.1 and `docker compose config` where Docker is available
- [ ] 2.4 Write the hourly workflow by hand to the shape
      `n8n export:workflow --backup` produces: a Schedule Trigger and an SSH
      node sending the clone name `harness`, with the keys `design.md`
      removes left out. Save it as `orchestrator/workflows/<id>.json`. Verify
      with 2.1
- [ ] 2.5 Write `orchestrator/README.md`, opening with a level-1 heading. It
      holds the host requirements, the user acts in `proposal.md`'s order, the
      export and import commands, the check of the three Notion tool names, and
      what to read before removing a stop file. It names no address and no
      account. Verify by reading every file under `orchestrator/` whole for an
      identifier before the commit (`git-and-prs.md`)
- [ ] 2.6 Run `bun bun/check.ts` and `bun test`. Both pass
