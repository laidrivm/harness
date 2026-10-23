# vps-board-loop

## Why

The board loop moves work across the board only while the user sits at a
terminal and starts each pass by hand. The user decided to run the agent
orchestrator on a VPS of its own under Windmill CE, the engine they chose
after the spike (2026-10-22), and this is its first slice: the
pass the harness already has, started every hour by a timer on that host, with
nobody at a terminal. Webhooks and every later flow build on that host.

## What Changes

- A new top-level `orchestrator/` directory in this repository holds what the
  host runs, and no secret. Every sensitive value comes from an untracked file
  on the host:
  - a compose file with Windmill (server, Postgres and two worker services,
    one of them a single worker tagged for the pass), a runner container
    where the pass runs, and `cloudflared` for `hooks.laidrivm.com`;
  - the runner's `Dockerfile`;
  - the Windmill workspace (the pass script and its hourly schedule), as
    `wmill sync pull --skip-secrets` writes it;
  - `pass.sh`, the wrapper the timer runs, and `stop.sh`, which stops a
    pass by hand;
  - a host README.
- Windmill starts the pass hourly over SSH in the runner container. The
  runner's key allows only `pass.sh`, and no session runs on an engine
  worker. The job ends on the pass's status, so a failed pass is a failed
  job.
- `pass.sh` takes a lock with `flock -n`, keyed by the clone's repository, so
  one pass runs per repository at a time and a second tick finds the lock held.
  A pass that exits non-zero leaves a stop file, and the timer starts no pass
  until the user removes that file by hand.
- The README and the runner's header say a timer the user set up on a host of
  their own may start the pass. A `board-loop` requirement says so too. The
  refusal inside a Claude Code session (`CLAUDECODE`) stays, and `pass.sh`
  hands that variable on so the runner still sees it.
- Concurrent passes get one full clone each, never a worktree. The Safety rule
  on pushing from a worktree is unchanged.
- Host requirements written down: the trust dialog once per clone, Claude on
  the host through `claude setup-token` for the unattended passes and the
  user's claude.ai login for the emergency session alone, Notion as a configured MCP
  server,
  `gh` through the GitHub App alone, a persistent home volume,
  `core.hooksPath` per clone.

## Non-goals

- Webhooks, the router and the CodeRabbit flow. They come in a later step, on
  this host.
- `--session-id` in the loop's record and the PR → session table (slot 2).
- A dashboard, a status page or a chat page. For now Windmill's Runs is the
  view from the phone (user, 2026-10-22: no chat page).
- The GitHub App. Its sibling proposal `github-app-identity` comes after this
  one, and `runner-isolation`'s group 5 puts its key on the host. The host
  never pushes as the user: it pushes and opens pull requests as the App
  alone, and no pass runs there until then (user, 2026-10-23).
- An n8n host. Task group 2 measured both engines on one pass and removed
  both; the user chose Windmill from that table (design.md).
- Anything an agent would do on the VPS beyond that spike. The host's address
  appears in no file.

## User acts

Only the user does these, by hand, on the VPS or in a dashboard. The host
README lists them in order:

1. Create the Cloudflare tunnel for `hooks.laidrivm.com` and a Cloudflare
   Access application on it (email) in front of Windmill's UI, bypassing
   only `/api/r/github`, then put the tunnel token in the host's secrets
   directory.
2. Run `claude setup-token` on the laptop, and save the token in the host's
   secrets directory. No GitHub token of the user's goes there: the host
   pushes and opens pull requests as the GitHub App alone, whose key arrives
   with `runner-isolation`'s group 5.
3. Put the database password in the secrets directory, build and start the
   stack, set Windmill's admin login, and give Windmill the runner's SSH key
   as a secret variable.
4. In the runner, clone each repository into its own directory, set
   `core.hooksPath`, and run `bun install`. Run `claude` there once, accept
   the trust dialog and `/exit`. Add and authenticate the Notion MCP server,
   and authenticate the `coderabbit` CLI.
5. Push the workspace with `wmill sync push --skip-secrets
   --include-schedules`.
6. When a pass pauses the loop, read the stop file and the pass's output, then
   remove the stop file. To stop a running pass, run `docker compose exec
   -u runner runner /opt/orchestrator/stop.sh <clone>` on the host.
7. For the emergency session (user, 2026-10-22), when needed: ssh to the
   host as root, `claude auth login` (the URL opens on any device, the phone
   included), start `claude` with Remote Control in the harness checkout,
   and end it when done. Sign in again when the login has expired.
8. For chat control from the laptop, create the narrow engine token and an
   Access service token with its Service Auth policy (task 3.6).

## Capabilities

### New Capabilities

- `orchestrator`: the host that starts unattended agent runs. In this change
  that means the timer's wrapper (one pass per repository, the stop file, the
  environment it passes on) and what the tracked `orchestrator/` directory may
  hold (no secret, exact pins, each naming what moves it), stopping a pass
  on the runner, and that no tracked file starts Remote Control. Later
  flows add their requirements here.

### Modified Capabilities

- `board-loop`: gains *A timer the user set up may start the runner*. The
  requirement *The runner is the user's script and starts from a clean clone*
  is unchanged, so the delta copies nothing from the live spec.

## Impact

- New: `orchestrator/`. Consumers install the package whole, so the directory
  lands, inert, under their `node_modules/harness/`. `sync.ts` copies only
  `core/*.md`, so no consumer has to ignore it. `check.ts` places root files
  alone, so a new directory needs no `rootFiles` entry.
- `.gitignore` gains the host's secrets directory.
- `README.md` (Layout, and the board loop's paragraph) and the header comment
  of `bun/board-loop.ts`. The runner's code is unchanged.
- `openspec/specs/board-loop/spec.md` and a new
  `openspec/specs/orchestrator/spec.md`, through this change's deltas.
- Tests: `orchestrator/*.test.ts`, collected by `bun test`, and one case in
  `bun/board-loop-clone.test.ts`. `pass.sh`'s cases need `flock`, which macOS
  lacks, so they run in CI and on Linux.
