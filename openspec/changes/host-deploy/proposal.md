# host-deploy

## Why

Stage 2.5 of the roadmap (page *Этап 2.5. Короткий путь на VPS*) runs one
persistent Claude Code session on the host, in the `runner` container, which
the user reaches through Remote Control. Its metric counts every `git pull`
and rebuild on the host as a manual step. Today each merge reaches the host
only by hand: `git pull` in `/root/harness`, `docker compose build runner`,
`docker compose up -d runner`, and `git pull --ff-only` with `bun install` in
the session's clone (card *Деплой новой версии раннера в CI по изменению
main*, explore of 2026-11-02).

The change was written on 2026-10-24 for the pass loop: a webhook kick, pass
locks and a gate, clones' stop files, an unattended Windmill push. Tasks
1.1–1.4 of that plan are on `main`. The loop is switched off in stage 2.5, so
none of that protects the session, and `up -d runner` would end the session
mid-turn. This rewrite keeps that code and changes what decides when the
deploy acts.

## What Changes

- A root timer on the host, every five minutes, runs `orchestrator/deploy.sh`.
  When `origin/main`'s head is neither the commit last deployed nor the one
  last rolled back, and its `test` check has passed, the script fast-forwards `/root/harness`, tags the image
  the runner runs now as the previous one, and builds the images, as on
  `main` today. The webhook kick of answer 12а moves to stage 6.
- The script then acts only while the session is fresh: after the user's
  `/clear` and before the first message (user, 02.11, answer 16 a). Hooks in
  the container's managed settings set a fresh-session mark on `SessionStart`
  (startup, clear) and clear it on `UserPromptSubmit`. Without the mark the
  script exits 0 and the next tick tries again.
- With the mark, `docker compose up -d`, then `docker compose restart runner`
  when the runner container was not recreated, so the start script of the
  image card pulls the session's clone and runs `bun install` before `claude`
  starts again.
- The head is recorded once the tmux session `main` is up again. When it is
  not up within two minutes, the runner goes back to the previous image, the
  head is recorded as rolled back, and a failure file in agent's home tells
  the next session, which reports it in chat (user, 02.11, answer 17 a). Any
  other step after the fast-forward that fails writes the same file, except
  in a run the service's start timeout kills, which leaves only the journal's
  line.
- The Windmill push is skipped, with a journal line, while
  `secrets/windmill_deploy_token` does not exist.

## Capabilities

### Modified Capabilities

- `orchestrator`: the host deploys `main`'s green head on a timer, restarts
  the persistent session only while it is fresh, rolls the runner back when
  the session does not come back, and tells the session of a failed deploy.

## Impact

- `orchestrator/deploy.sh`: the previous image's tag, the fresh-session wait,
  the restart, the wait for `main`, the rollback, the failure file, the
  push's skip; new cases in a new `orchestrator/deploy-session.test.ts`.
- New: `orchestrator/host/harness-deploy.service`,
  `orchestrator/host/harness-deploy.timer`,
  `orchestrator/runner/managed-settings.json`, and its `COPY` line in
  `orchestrator/runner/Dockerfile`; cases in a new
  `orchestrator/layout-deploy.test.ts`.
- `orchestrator/README.md`: a step installing the units.
- Host, by the user: `systemctl link` and `enable --now` once.
- Kept on `main` and inert in stage 2.5, removed at stage 7: the gate in
  `pass.sh`, the pass locks in `deploy.sh`, the clones' stop files, and the
  image's copy of `bun/` (design.md, *What stage 7 removes*).
- Seam: card *Build the runner image for the persistent session…*
  (`40c39875c31b8116879bec24abbba0ba`) owns the image's tmux, the start
  script and its restart loop, and the `git pull --ff-only` and `bun install`
  before each `claude` start. This change lands after it.
- Out of scope: the webhook kick, the Windmill push with a token, schedules
  (stage 6); the write-path probe, the full rollback with a stop file and an
  escalation card, the session that finishes its work and updates (stage 9);
  an agent that repairs a failed deploy (answer 13, after stage 9).
