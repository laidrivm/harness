# session-runner-image — tasks

Two pull requests from the laptop through `finish`, each under the 800-line
budget: groups 1 and 2 on `feat/session-runner-image-1` (the token and the
image's tools, about 300 lines), group 3 on `feat/session-runner-image-2`
(the session, about 350). Failing cases first, their failure recorded, cited
as `// spec: orchestrator/<slug>`. Group 4 is the user's and the probe's.

## 1. The token per call

- [x] 1.1 Write the failing cases in a new `orchestrator/gh-wrapper.test.ts`,
      running `orchestrator/runner/gh` with `GH_WRAPPER_REAL`,
      `GH_WRAPPER_MINT` and `GH_WRAPPER_USER` pointing at stubs that record
      their arguments and environment: no `GH_TOKEN` as the session user →
      the mint gets `laidrivm/harness` and the six pairs of decision 39 б,
      the real gh gets the minted token in its environment and not in its
      arguments; an empty `GH_TOKEN` → minted as when unset; `GH_TOKEN`
      set → gh with it, the mint unrun; another user → gh as is, the mint
      unrun; a mint
      exiting 2 and 75 → the wrapper exits 2 and 75 and gh never runs; every
      pair the wrapper asks is in the mint's `ALLOWED`. Verify each fails
      for the missing wrapper
- [x] 1.2 Add the failing cases to `orchestrator/users.test.ts`: sudoers
      holds exactly three rules, the third
      `agent ALL=(keyholder) NOPASSWD: /opt/orchestrator/mint`; the
      Dockerfile installs the release's gh at `/usr/local/libexec/gh/gh`,
      copies the wrapper to `/usr/local/bin/gh` 0755, sets
      `credential.https://github.com.helper` to
      `!/usr/local/bin/gh auth git-credential` with `git config --system`,
      and runs no `gh auth setup-git`. Verify they fail
- [x] 1.3 Write `orchestrator/runner/gh` per design *The gh wrapper*, with
      its two `shortcut:` comments; export `ALLOWED` from
      `bun/github-app-mint.ts`; edit the Dockerfile and `sudoers` and its
      header comment (three rules). Verify `bun test orchestrator/` passes

## 2. The image's tools

- [x] 2.1 Write the failing cases in `orchestrator/layout-runner.test.ts`:
      apt installs `tmux` and `libstdc++6`; a `FROM node:24.` stage and a
      `COPY --from` of its `node`, and no line linking `node` to bun; the
      `actionlint` and `gitleaks` `FROM` lines carry exactly the image, tag
      and digest `lint.yml`'s `uses: docker://…` lines name, read from
      `lint.yml`, failing with both values; one `RUN` prints the versions
      of `node`, `actionlint`, `gitleaks` and `claude`. Verify they fail
- [x] 2.2 Edit the Dockerfile per design *The image's tools and their pins*:
      re-read Claude Code's latest release and its linux-x64 checksum from
      that release's `manifest.json`, Node 24's current patch and its
      digest, each pin with its note; drop the symlink line. Verify `bun test
      orchestrator/` passes and `docker build -f orchestrator/runner/Dockerfile
      --build-context bun=bun orchestrator` succeeds where Docker runs, or
      say in the pull request that it was not run
- [x] 2.3 Open the first pull request through `finish`, its body naming the
      seam with group 3; once it merges, nothing on the host changes until
      group 4

## 3. The session

- [x] 3.1 Write the failing cases in a new `orchestrator/session.test.ts`,
      running `orchestrator/runner/session.sh` with a temporary `HOME` and
      stubs for `git`, `bun`, `claude` and `sleep` on `PATH`, the second
      `claude` ending the loop: a clone → pull, then install, then `claude`
      with `--remote-control` and the name `harness`, never `--continue`;
      `sleep 5` between the two starts; a failing pull and a failing
      install each print their line and `claude` still starts; no clone →
      neither git nor bun runs and `claude` starts in `HOME`; `claude` sees
      `GIT_TERMINAL_PROMPT=0` and `DISABLE_AUTOUPDATER=1`. Verify they fail
- [x] 3.2 Add the failing cases in `orchestrator/layout.test.ts` and
      `layout-runner.test.ts`: `remoteControl()` passes the README and
      `orchestrator/runner/session.sh` and fails `orchestrator/run.sh`; the
      entrypoint runs `runuser -u agent -- tmux new-session -d -s main
      /opt/orchestrator/session.sh` after its `authorized_keys` lines and
      before `exec`; the Dockerfile copies `session.sh` 0755 to
      `/opt/orchestrator/`; the runner's `environment:` sets the four
      `GIT_AUTHOR_*` and `GIT_COMMITTER_*` names to `${NAME:?…}`; git ignores
      `orchestrator/.env`; `leaks()` fails a file holding a GitHub bot
      noreply address and passes the README's placeholders. Verify they fail
- [x] 3.3 Write `session.sh` per design *The start script*, then edit the
      entrypoint (its header comment too), `layout.ts`, the Dockerfile,
      `compose.yaml` and `.gitignore`. Verify `bun test orchestrator/`
      passes and `claude --help` at the pinned release names the
      `--remote-control` form `session.sh` uses
- [x] 3.4 In `orchestrator/README.md`, a section for the persistent
      session: writing `orchestrator/.env` 0600, under no `umask` the
      shell keeps (a later `git pull` would write the image's copy of `bun/`
      under it), from the
      placeholders, the one login as agent, attaching to `main`, and
      `notion-ask.json` in agent's home with `umask 077`; step 11's reach
      check unchanged. Verify `bun test orchestrator/` passes and the README
      holds no slug, id or email
- [x] 3.5 Open the second pull request through `finish`
- [x] 3.6 Continue the last conversation (user, 03.11, reversing answer 1 a;
      3.1's «never `--continue`» no longer holds): probe what 2.1.316's
      `claude --continue` does in a directory with no conversation; write
      the failing cases in `orchestrator/session.test.ts` — a clone with a
      transcript → `claude --continue --remote-control harness`, also after
      a crash; a clone with none, or only `HOME` with one → a new
      conversation; no clone and a transcript for `HOME` → continued in
      `HOME`; a `HOME` behind a symlink and a `CLAUDE_CONFIG_DIR` each find
      the transcript. Verify they fail; edit `session.sh` per design *Every start
      continues the last conversation*, the README's step 12 and the delta
      spec; name what host-deploy's apply reconsiders in *Seams*. Verify
      `bun test orchestrator/` passes; open a fix pull request through
      `finish`

## 4. On the host, and the probe

- [x] 4.1 The user, per design *Migration Plan*: `orchestrator/.env`, `git
      pull`, `docker compose build runner`, `docker compose up -d runner`,
      the login. Verify `docker compose exec -u agent runner tmux has-session
      -t main` exits 0
      — exited 0 at step 2 of the live probe, card
      `40c39875c31b814e8902ef481aad54e2`, 2026-11-05
- [x] 4.2 Hand the probe's checks to card
      `40c39875c31b814e8902ef481aad54e2`; this change archives once it
      reports them
      — reported there on 2026-11-05 («Итоги пробы 05.11» and its
      addendum); its findings went to #427 and `fix/session-rules-gh-wrapper`
