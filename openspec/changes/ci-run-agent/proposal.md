# ci-run-agent

## Why

A red CI run on one of the board loop's pull requests waits until the user
notices it, reads the log and starts a session by hand, so every loop still
starts with a person. The orchestrator host (`vps-board-loop`) and the App's
identity (`github-app-identity`) make an event-driven start possible. This
change builds what every event flow will share, and its first flow: a failed
CI run starts an agent that reads the failed jobs' logs and either fixes the
failure or says why it cannot.

## What Changes

- **The event handler**, `bun/on-event.ts`, an engine-neutral command run as
  the runner's Unix user. The engine (Windmill, which
  `vps-board-loop` settled on) only receives the HTTP request and calls
  it with the raw body and three headers. The handler:
  - verifies `X-Hub-Signature-256` itself, against a webhook secret only the
    runner's user reads;
  - drops a delivery id it has already seen;
  - applies the filters and routes the event to its flow, ignoring every event
    no flow takes.
- **The PR → session table**, a JSON Lines file on the runner's own volume. The
  board-loop runner starts each stage session with a session id of its own
  choosing, and appends one record naming the step's branch before it pushes
  that branch. A pull request whose branch has no record is not the loop's,
  and no flow starts an agent for it.
- **The CI flow**, on `workflow_run` `completed` with `conclusion: failure`.
  It acts only on runs of the repository itself, never a fork's, and only on
  branches `feat/` and `spec/`:
  - The runner reads the failed jobs' logs of the attempt the event names
    with `gh run view <id> --attempt <n> --log-failed`, and hands them to the
    session as a file.
  - It resumes the pull request's session with `claude -r`, under
    `--json-schema`. The session fixes the failure in new commits, or answers
    `BLOCKED —` with a question on its card.
  - The runner pushes the fix, never by force, as the App.
- **At most three fix attempts per pull request.** Each attempt is a marked
  comment the App posts on the pull request before the session starts. A
  fourth failure starts no fix: the session puts a question on the card and
  ends `BLOCKED —`, and the flow ignores that pull request from then on.
- **A failed scheduled run** with no pull request (a nightly `bun audit` in
  d2ass, say) starts a fresh session that files an `idea` card on that
  repository's board.
- **A flaky run**, a failed run that passed on a later attempt of the same
  `head_sha`, is reported as a `flaky` finding with a card. It is never fixed
  and never re-run until green.

The whole change measured over the diff budget's failing threshold, so the
plan, `design.md` and `tasks.md`, follows on `spec/ci-run-agent-plan` once
this merges.

## Non-goals

- The CodeRabbit-review flow (card *Update the review docs once a review's
  arrival starts an agent*). It reuses this core in a change of its own.
- The timer sweep over open pull requests, proposed separately as the
  deterministic `pr-sweep`. An event this flow drops, for whatever reason, is
  the sweep's to catch.
- The engine choice, and the engine's wiring beyond the contract `design.md`
  fixes.
- Reacting to `success`, a failed run on the default branch that no schedule
  started, a `workflow_dispatch` run, or a pull request opened by anyone but
  the board loop.

## User acts

Only the user does these, by hand. The host README lists them in order:

1. Generate a webhook secret and save it as
   `orchestrator/secrets/github_webhook_secret` on the host, owned by the
   runner's uid, mode 0400.
2. Give the GitHub App the repository permission *Actions: read-only*, and
   accept it on each installation. Reading a run and its logs needs it.
3. On each repository the loop serves, add a webhook. It points at the
   engine's path on `hooks.laidrivm.com`, sends `application/json`, uses that
   secret, and carries the *Workflow runs* event alone.
4. Add a Cloudflare Access bypass for that path, so GitHub's delivery reaches
   the engine and the UI stays behind Access.

## Capabilities

### New Capabilities

None. `orchestrator` is new in `vps-board-loop`, which this change comes
after.

### Modified Capabilities

- `orchestrator`: gains the event handler (signature, deliveries, routing),
  the CI flow, its attempt limit, the scheduled and flaky routes.
- `board-loop`: gains *The runner records the session of each step it
  pushes*.

## Impact

- New: `bun/on-event.ts` (the handler and its routing), `bun/ci-run.ts` (the
  CI flow), `bun/pr-sessions.ts` (the table, read and written), and their
  tests.
- Changed:
  - `bun/board-loop.ts` and `bun/board-loop-session.ts`: a session id, and the
    flags a resumed session needs;
  - `bun/board-loop-push.ts`: the table's record, and a push the CI flow
    reuses;
  - `bun/github-app.ts`: the permissions a token asks for;
  - `orchestrator/runner/Dockerfile`: the image carries the handler;
  - the host README and `README.md`.
- The engine's webhook route and script under
  `orchestrator/windmill/f/orchestrator/`, for Windmill, the engine the spike
  confirmed.
- Consumers: the new files land inert under `node_modules/harness/`, as
  `orchestrator/` does.
